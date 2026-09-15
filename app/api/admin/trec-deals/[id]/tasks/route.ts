import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createTrecDealTask, getTrecDeal } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

const taskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2_000).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deadlineKey: z.string().trim().max(100).nullable().optional(),
  assignee: z.string().trim().max(160).nullable().optional(),
});

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });

  const parsed = taskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid task.' }, { status: 400 });

  try {
    if (!(await getTrecDeal(id))) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    const task = await createTrecDealTask({ id: randomUUID(), dealId: id, ...parsed.data, actor: admin.email });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('[trec-task POST]', error);
    return NextResponse.json({ error: 'Could not add this task.' }, { status: 500 });
  }
});
