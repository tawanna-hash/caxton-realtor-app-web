// app/api/admin/renewal-reminders/[id]/route.ts
//
// PATCH  — update status and/or note
// DELETE — hard delete

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { updateRenewalReminder } from '@/lib/renewal-reminders';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { idParamSchema } from '@/lib/server/schemas/_common';
import { renewalReminderPatchSchema } from '@/lib/server/schemas/renewal-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withAdminTracking(async (req: NextRequest, ctx: RouteCtx) => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, 'Unauthorized');

  const { id } = idParamSchema.parse(await ctx.params);
  const patch = renewalReminderPatchSchema.parse(await req.json());

  await ensureSchema();
  // Strip out undefined keys so updateRenewalReminder only patches what was sent.
  const cleaned: Parameters<typeof updateRenewalReminder>[1] = {};
  if (patch.status !== undefined)      cleaned.status = patch.status;
  if (patch.note !== undefined)        cleaned.note = patch.note ?? null;
  if (patch.remind_date !== undefined) cleaned.remind_date = patch.remind_date ?? null;

  const reminder = await updateRenewalReminder(id, cleaned);
  if (!reminder) throw new ApiError(404, 'not found');
  return NextResponse.json({ reminder });
});

export const DELETE = withAdminTracking(async (_req: NextRequest, ctx: RouteCtx) => {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, 'Unauthorized');

  const { id } = idParamSchema.parse(await ctx.params);

  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM renewal_reminders WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
});
