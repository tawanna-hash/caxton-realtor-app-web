/**
 * /api/admin/ads/creatives/:id  DELETE — remove a creative.
 * Refuses if any campaign still references it.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteCreative, updateCreative } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { idParamSchema, updateCreativeSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);

  const result = await deleteCreative(id);
  if (!result.deleted) throw new ApiError(409, result.reason ?? 'Cannot delete');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_creative.deleted',
      entityType: 'ad_creative',
      entityId: id,
      afterState: {},
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ deleted: true });
});

export const PATCH = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);
  const body = await req.json().catch(() => ({}));
  const patch = updateCreativeSchema.parse(body);

  const updated = await updateCreative(id, patch);
  if (!updated) throw new ApiError(404, 'Creative not found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_creative.updated',
      entityType: 'ad_creative',
      entityId: id,
      afterState: patch as Record<string, unknown>,
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ creative: updated });
});
