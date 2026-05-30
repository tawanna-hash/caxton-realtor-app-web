// app/api/admin/marketing-campaigns/route.ts
//
// GET  — list campaigns with task/outreach stats
// POST — create a new campaign (draft by default)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  CAMPAIGN_STATUS_VALUES,
  type MarketingCampaignWithStats,
} from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT
        mc.*,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = mc.id), 0) AS task_count,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = mc.id AND t.status = 'done'), 0) AS task_done,
        COALESCE((SELECT count(*)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = mc.id AND o.status = 'sent'), 0) AS outreach_sent,
        COALESCE((SELECT SUM(o.recipient_count)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = mc.id AND o.status = 'sent'), 0) AS recipients_total
      FROM marketing_campaigns mc
      ORDER BY mc.updated_at DESC
    `) as unknown as MarketingCampaignWithStats[];
    return NextResponse.json({ campaigns: rows });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const status = typeof body.status === 'string' && CAMPAIGN_STATUS_VALUES.has(body.status as never)
    ? (body.status as string) : 'draft';
  const audienceFilter = (body.audience_filter && typeof body.audience_filter === 'object')
    ? body.audience_filter : {};

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO marketing_campaigns (
        name, status, type, audience_filter, brief, goal,
        start_date, end_date, publication, created_by
      ) VALUES (
        ${name},
        ${status},
        ${(body.type as string | undefined) ?? null},
        ${JSON.stringify(audienceFilter)}::jsonb,
        ${(body.brief as string | undefined) ?? null},
        ${(body.goal as string | undefined) ?? null},
        ${(body.start_date as string | undefined) ?? null},
        ${(body.end_date as string | undefined) ?? null},
        ${(body.publication as string | undefined) ?? null},
        ${admin.email ?? null}
      )
      RETURNING *
    `;
    return NextResponse.json({ campaign: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: errMessage(err) }, { status: 500 });
  }
}
