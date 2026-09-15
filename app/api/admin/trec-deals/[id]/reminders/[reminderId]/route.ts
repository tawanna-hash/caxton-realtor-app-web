import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteTrecReminder, updateTrecReminder } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string; reminderId: string }> };

const reminderSchema = z.object({
  isComplete: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

async function getIds(ctx: RouteCtx): Promise<{ id: string; reminderId: string } | null> {
  const { id, reminderId } = await ctx.params;
  return UUID_RE.test(id) && UUID_RE.test(reminderId) ? { id, reminderId } : null;
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ids = await getIds(ctx);
  if (!ids) return NextResponse.json({ error: 'Invalid reminder id.' }, { status: 400 });

  const parsed = reminderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid reminder update.' }, { status: 400 });

  try {
    const reminder = await updateTrecReminder(ids.id, ids.reminderId, { ...parsed.data, actor: admin.email });
    return reminder
      ? NextResponse.json({ reminder })
      : NextResponse.json({ error: 'Reminder not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-reminder PATCH]', error);
    return NextResponse.json({ error: 'Could not update this reminder.' }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ids = await getIds(ctx);
  if (!ids) return NextResponse.json({ error: 'Invalid reminder id.' }, { status: 400 });

  try {
    const deleted = await deleteTrecReminder(ids.id, ids.reminderId, admin.email);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Reminder not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-reminder DELETE]', error);
    return NextResponse.json({ error: 'Could not delete this reminder.' }, { status: 500 });
  }
});
