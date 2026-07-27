/**
 * /api/admin/giveaways
 *   GET    — list all giveaways with ticket / participant counts
 *   POST   — create a new giveaway (status = draft)
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listGiveaways, createGiveaway } from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import { createGiveawaySchema } from '@/lib/server/schemas/giveaways';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  const giveaways = await listGiveaways();
  return NextResponse.json({ giveaways });
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const input = createGiveawaySchema.parse(await req.json());

  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    throw new ApiError(400, 'endsAt must be after startsAt');
  }
  if (input.drawAt && new Date(input.drawAt).getTime() < new Date(input.endsAt).getTime()) {
    throw new ApiError(400, 'drawAt must be on or after endsAt');
  }

  const id = await createGiveaway(input, admin.adminId);
  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.create',
    entityType: 'giveaway',
    entityId: id,
    afterState: input,
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ id }, { status: 201 });
});
