// app/api/admin/marketing-campaign-tasks/[id]/route.ts
//
// PATCH  — update task (auto-stamps done_at on status='done')
// DELETE — remove task

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import {
  TASK_PATCHABLE_FIELDS,
  TASK_STATUS_VALUES,
  TASK_PRIORITY_VALUES,
} from '@/lib/marketing-campaigns';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
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

    // Auto-stamp done_at on transition to 'done'
    if (typeof body.status === 'string' && body.status === 'done' && !('done_at' in body)) {
      body.done_at = new Date().toISOString();
    }
    if (typeof body.status === 'string' && body.status !== 'done' && !('done_at' in body)) {
      body.done_at = null;
    }

    const updated: string[] = [];
    for (const field of TASK_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];
      if (field === 'status'   && typeof raw === 'string' && !TASK_STATUS_VALUES.has(raw as never)) continue;
      if (field === 'priority' && typeof raw === 'string' && !TASK_PRIORITY_VALUES.has(raw as never)) continue;

      switch (field) {
        case 'title':       if (typeof raw === 'string' && raw.trim()) await sql`UPDATE marketing_campaign_tasks SET title = ${raw.trim()} WHERE id = ${id}`; break;
        case 'description': await sql`UPDATE marketing_campaign_tasks SET description = ${raw} WHERE id = ${id}`; break;
        case 'status':      await sql`UPDATE marketing_campaign_tasks SET status = ${raw} WHERE id = ${id}`; break;
        case 'priority':    await sql`UPDATE marketing_campaign_tasks SET priority = ${raw} WHERE id = ${id}`; break;
        case 'due_date':    await sql`UPDATE marketing_campaign_tasks SET due_date = ${raw} WHERE id = ${id}`; break;
        case 'assignee':    await sql`UPDATE marketing_campaign_tasks SET assignee = ${raw} WHERE id = ${id}`; break;
        case 'sort_order':  await sql`UPDATE marketing_campaign_tasks SET sort_order = ${raw} WHERE id = ${id}`; break;
      }
      updated.push(field);
    }
    if ('done_at' in body) {
      await sql`UPDATE marketing_campaign_tasks SET done_at = ${body.done_at as string | null} WHERE id = ${id}`;
      updated.push('done_at');
    }

    if (updated.length === 0) return NextResponse.json({ error: 'no patchable fields' }, { status: 400 });
    const rows = await sql`SELECT * FROM marketing_campaign_tasks WHERE id = ${id}`;
    return NextResponse.json({ task: rows[0], updated_fields: updated });
  } catch (err) {
    return NextResponse.json({ error: 'patch failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`DELETE FROM marketing_campaign_tasks WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
