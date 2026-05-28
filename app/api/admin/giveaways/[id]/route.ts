/**
 * /api/admin/giveaways/:id
 *   GET    — detail with rules + stats
 *   PATCH  — partial update (dynamic SET clauses)
 *   DELETE — only `draft` status can be deleted
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  getGiveawayDetail,
  updateGiveaway,
  deleteDraftGiveaway,
} from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import {
  giveawayIdParamSchema,
  updateGiveawaySchema,
} from '@/lib/server/schemas/giveaways';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const detail = await getGiveawayDetail(id);
  if (!detail) throw new ApiError(404, 'Giveaway not found');
  return NextResponse.json(detail);
});

export const PATCH = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const input = updateGiveawaySchema.parse(await req.json());

  const result = await updateGiveaway(id, input);
  if (!result.ok) {
    if (result.reason === 'no_fields') throw new ApiError(400, 'No fields to update');
    throw new ApiError(404, 'Giveaway not found');
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.update',
    entityType: 'giveaway',
    entityId: id,
    afterState: input,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);

  const result = await deleteDraftGiveaway(id);
  if (!result.ok) {
    if (result.reason === 'not_draft') {
      throw new ApiError(
        400,
        'Only draft giveaways can be deleted. Close active giveaways instead.',
      );
    }
    throw new ApiError(404, 'Giveaway not found');
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.delete',
    entityType: 'giveaway',
    entityId: id,
    afterState: {},
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true });
});
