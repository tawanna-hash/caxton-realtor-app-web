import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteTrecDealTask, updateTrecDealTask } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

const taskSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'skipped']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deadlineKey: z.string().trim().max(100).nullable().optional(),
  assignee: z.string().trim().max(160).nullable().optional(),
});

async function ids(ctx: RouteCtx) {
  const value = await ctx.params;
  return UUID_RE.test(value.id) && UUID_RE.test(value.taskId) ? value : null;
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const value = await ids(ctx);
  if (!value) return NextResponse.json({ error: 'Invalid task id.' }, { status: 400 });
  const parsed = taskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid task update.' }, { status: 400 });
  try {
    const task = await updateTrecDealTask(value.id, value.taskId, { ...parsed.data, actor: admin.email });
    return task ? NextResponse.json({ task }) : NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-task PATCH]', error);
    return NextResponse.json({ error: 'Could not update this task.' }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const value = await ids(ctx);
  if (!value) return NextResponse.json({ error: 'Invalid task id.' }, { status: 400 });
  try {
    const deleted = await deleteTrecDealTask(value.id, value.taskId, admin.email);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-task DELETE]', error);
    return NextResponse.json({ error: 'Could not delete this task.' }, { status: 500 });
  }
});
