// app/api/admin/renewal-reminders/[id]/route.ts
//
// PATCH  — update status and/or note
// DELETE — hard delete

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { updateRenewalReminder } from '@/lib/renewal-reminders';
import type { RenewalReminderStatus } from '@/lib/types/renewal-reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set<RenewalReminderStatus>(['Pending', 'Completed', 'Dismissed']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const patch: Parameters<typeof updateRenewalReminder>[1] = {};

  if (typeof body.status === 'string' && VALID_STATUSES.has(body.status as RenewalReminderStatus)) {
    patch.status = body.status as RenewalReminderStatus;
  }
  if (typeof body.note === 'string' || body.note === null) {
    patch.note = body.note as string | null;
  }
  if (typeof body.remind_date === 'string' || body.remind_date === null) {
    patch.remind_date = body.remind_date as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const reminder = await updateRenewalReminder(id, patch);
    if (!reminder) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ reminder });
  } catch (err) {
    console.error('[admin/renewal-reminders PATCH]', errMessage(err));
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
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
    await sql`DELETE FROM renewal_reminders WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/renewal-reminders DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
