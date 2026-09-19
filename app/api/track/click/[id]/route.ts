// app/api/track/click/[id]/route.ts
//
// GET — Record a link click for the recipient row, then 302 to the
// original URL passed as ?u=.
//
// Also fires a PostHog `email_clicked` event so email engagement is visible
// in the PostHog dashboards alongside other analytics.

import { NextResponse, type NextRequest } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = req.nextUrl.searchParams.get('u') ?? '';
  let target: string;
  try {
    const parsed = new URL(u);
    // Only allow http/https. Block javascript: and data: redirects.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.redirect('https://realtynewsnow.app/');
    }
    target = parsed.toString();
  } catch {
    return NextResponse.redirect('https://realtynewsnow.app/');
  }

  if (UUID_RE.test(id)) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`
        UPDATE marketing_campaign_outreach_recipients
        SET clicked_at = COALESCE(clicked_at, now()),
            click_count = click_count + 1
        WHERE id = ${id}
        RETURNING email, outreach_id AS campaign_id
      ` as unknown as { email: string | null; campaign_id: string | null }[];
      const row = rows[0];
      // Fire PostHog event so email engagement shows up in analytics
      if (row) {
        captureServerEvent('email_clicked', row.email || id, {
          recipient_id: id,
          campaign_id: row.campaign_id || undefined,
          target_url: target,
          source: 'email_pixel',
        });
      }
    } catch {
      // Tracking failures must never block the destination redirect.
    }
  }
  return NextResponse.redirect(target, 302);
}
