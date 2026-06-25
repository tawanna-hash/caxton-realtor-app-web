// app/api/track/click/[id]/route.ts
//
// GET — Record a link click for the recipient row, then 302 to the
// original URL passed as ?u=.

import { NextResponse, type NextRequest } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';

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
    void (async () => {
      try {
        await ensureSchema();
        const sql = getSql();
        await sql`
          UPDATE marketing_campaign_outreach_recipients
          SET clicked_at = COALESCE(clicked_at, now()),
              click_count = click_count + 1
          WHERE id = ${id}
        `;
      } catch {
        // ignore
      }
    })();
  }
  return NextResponse.redirect(target, 302);
}
