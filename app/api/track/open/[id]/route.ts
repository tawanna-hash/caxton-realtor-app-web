// app/api/track/open/[id]/route.ts
//
// GET — 1x1 transparent GIF that records an "email opened" event for the
// recipient row. Always returns 200 so the user never sees a broken image.

import type { NextRequest } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 43-byte transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (UUID_RE.test(id)) {
    // Fire-and-forget: never block the pixel response on the DB write.
    void (async () => {
      try {
        await ensureSchema();
        const sql = getSql();
        await sql`
          UPDATE marketing_campaign_outreach_recipients
          SET opened_at = COALESCE(opened_at, now()),
              open_count = open_count + 1
          WHERE id = ${id}
        `;
        // Roll up to the CRM advertiser row (best-effort — silently no-ops
        // for recipients whose email isn't in advertisers, e.g. one-off
        // manual sends we haven't synced yet).
        await sql`
          UPDATE advertisers a
          SET last_opened_at = now(),
              open_count = COALESCE(a.open_count, 0) + 1
          FROM marketing_campaign_outreach_recipients r
          WHERE r.id = ${id}
            AND lower(a.contact_email) = lower(r.email)
        `;
      } catch {
        // Swallow — tracking failures must never error the pixel.
      }
    })();
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
}
