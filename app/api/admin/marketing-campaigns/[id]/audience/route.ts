// app/api/admin/marketing-campaigns/[id]/audience/route.ts
//
// GET — resolve the campaign's audience_filter and return:
//       { count, sample: Advertiser[] }
//
// Used by the UI for live audience preview when editing a campaign.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { resolveAudience, type AudienceFilter } from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();

    const camp = (await sql`
      SELECT audience_filter FROM marketing_campaigns WHERE id = ${id}
    `) as unknown as { audience_filter: AudienceFilter }[];
    if (camp.length === 0) {
      return NextResponse.json({ error: 'campaign not found' }, { status: 404 });
    }
    const filter = camp[0].audience_filter ?? {};
    const ids = await resolveAudience(sql as never, filter);

    // Pull a small sample for the UI (top 10 by name).
    const sample = ids.length === 0
      ? []
      : await sql`
          SELECT id, name, company, type, status, publication, email, phone, tags
          FROM advertisers
          WHERE id = ANY(${ids}::int[])
          ORDER BY name ASC
          LIMIT 10
        `;

    return NextResponse.json({
      count: ids.length,
      sample,
      filter,
    });
  } catch (err) {
    return NextResponse.json({ error: 'audience preview failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
