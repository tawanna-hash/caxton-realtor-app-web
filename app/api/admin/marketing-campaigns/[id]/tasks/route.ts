// app/api/admin/marketing-campaigns/[id]/tasks/route.ts
//
// POST — create a task under this campaign

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
} from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const status = typeof body.status === 'string' && TASK_STATUS_VALUES.has(body.status as never)
    ? (body.status as string) : 'to_do';
  const priority = typeof body.priority === 'string' && TASK_PRIORITY_VALUES.has(body.priority as never)
    ? (body.priority as string) : 'medium';

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO marketing_campaign_tasks (
        campaign_id, title, description, status, priority,
        due_date, assignee, sort_order
      ) VALUES (
        ${id},
        ${title},
        ${(body.description as string | undefined) ?? null},
        ${status},
        ${priority},
        ${(body.due_date as string | undefined) ?? null},
        ${(body.assignee as string | undefined) ?? admin.email ?? null},
        ${typeof body.sort_order === 'number' ? body.sort_order : 0}
      ) RETURNING *
    `;
    return NextResponse.json({ task: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
