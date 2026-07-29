// app/api/admin/marketing-campaigns/[id]/route.ts
//
// GET    — single campaign w/ stats + tasks + outreach
// PATCH  — allow-listed update
// DELETE — cascades to tasks + outreach

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  CAMPAIGN_PATCHABLE_FIELDS,
  CAMPAIGN_STATUS_VALUES,
  type MarketingCampaignWithStats,
  type MarketingCampaignTask,
  type MarketingCampaignOutreach,
} from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
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
    const campaigns = (await sql`
      SELECT mc.*,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = mc.id), 0) AS task_count,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = mc.id AND t.status = 'done'), 0) AS task_done,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = mc.id AND o.status = 'sent'), 0) AS outreach_sent,
        COALESCE((SELECT SUM(o.recipient_count)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = mc.id AND o.status = 'sent'), 0) AS recipients_total
      FROM marketing_campaigns mc WHERE mc.id = ${id}
    `) as unknown as MarketingCampaignWithStats[];
    if (campaigns.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [tasks, outreach] = await Promise.all([
      sql`SELECT * FROM marketing_campaign_tasks WHERE campaign_id = ${id} ORDER BY sort_order ASC, created_at ASC`,
      sql`SELECT * FROM marketing_campaign_outreach WHERE campaign_id = ${id} ORDER BY created_at DESC`,
    ]);

    return NextResponse.json({
      campaign: campaigns[0],
      tasks: tasks as unknown as MarketingCampaignTask[],
      outreach: outreach as unknown as MarketingCampaignOutreach[],
    });
  } catch (err) {
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const updated: string[] = [];

    for (const field of CAMPAIGN_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      if (field === 'status' && typeof raw === 'string' && !CAMPAIGN_STATUS_VALUES.has(raw as never)) continue;

      switch (field) {
        case 'name':            if (typeof raw === 'string' && raw.trim()) await sql`UPDATE marketing_campaigns SET name = ${raw.trim()} WHERE id = ${id}`; break;
        case 'status':          await sql`UPDATE marketing_campaigns SET status = ${raw} WHERE id = ${id}`; break;
        case 'type':            await sql`UPDATE marketing_campaigns SET type = ${raw} WHERE id = ${id}`; break;
        case 'audience_filter': await sql`UPDATE marketing_campaigns SET audience_filter = ${JSON.stringify(raw ?? {})}::jsonb WHERE id = ${id}`; break;
        case 'brief':           await sql`UPDATE marketing_campaigns SET brief = ${raw} WHERE id = ${id}`; break;
        case 'goal':            await sql`UPDATE marketing_campaigns SET goal = ${raw} WHERE id = ${id}`; break;
        case 'start_date':      await sql`UPDATE marketing_campaigns SET start_date = ${raw} WHERE id = ${id}`; break;
        case 'end_date':        await sql`UPDATE marketing_campaigns SET end_date = ${raw} WHERE id = ${id}`; break;
        case 'publication':     await sql`UPDATE marketing_campaigns SET publication = ${raw} WHERE id = ${id}`; break;
      }
      updated.push(field);
    }

    if (updated.length === 0) return NextResponse.json({ error: 'no patchable fields' }, { status: 400 });
    await sql`UPDATE marketing_campaigns SET updated_at = NOW() WHERE id = ${id}`;
    const rows = await sql`SELECT * FROM marketing_campaigns WHERE id = ${id}`;
    return NextResponse.json({ campaign: rows[0], updated_fields: updated });
  } catch (err) {
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM marketing_campaigns WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
});
