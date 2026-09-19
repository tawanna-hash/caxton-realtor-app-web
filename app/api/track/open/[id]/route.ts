// app/api/track/open/[id]/route.ts
//
// GET — 1x1 transparent GIF that records an "email opened" event for the
// recipient row. Always returns 200 so the user never sees a broken image.
//
// Also fires a PostHog `email_opened` event so email engagement is visible
// in the PostHog dashboards alongside other analytics.

import type { NextRequest } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { captureServerEvent } from '@/lib/server/posthog';

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
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`
        UPDATE marketing_campaign_outreach_recipients
        SET opened_at = COALESCE(opened_at, now()),
            open_count = open_count + 1
        WHERE id = ${id}
        RETURNING email, outreach_id AS campaign_id
      ` as unknown as { email: string | null; campaign_id: string | null }[];
      const row = rows[0];
      // Keep the CRM partner cache synchronized with the authoritative
      // recipient ledger. Recomputing avoids drift when both this pixel and
      // the Resend webhook observe the same open.
      await sql`
        UPDATE advertisers a
        SET open_count = totals.open_count,
            last_opened_at = totals.last_opened_at
        FROM (
          SELECT
            recipient_id,
            COALESCE(SUM(open_count), 0)::int AS open_count,
            MAX(opened_at) AS last_opened_at
          FROM marketing_campaign_outreach_recipients
          WHERE recipient_type = 'advertiser'
            AND recipient_id = (
              SELECT recipient_id
              FROM marketing_campaign_outreach_recipients
              WHERE id = ${id}
            )
          GROUP BY recipient_id
        ) totals
        WHERE a.id = totals.recipient_id
      `;
      // Fire PostHog event so email engagement shows up in analytics
      if (row) {
        captureServerEvent('email_opened', row.email || id, {
          recipient_id: id,
          campaign_id: row.campaign_id || undefined,
          source: 'email_pixel',
        });
      }
    } catch {
      // Swallow — tracking failures must never error the pixel.
    }
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
