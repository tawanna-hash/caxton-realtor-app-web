/**
 * /api/admin/ads/creatives/:id  DELETE — remove a creative.
 * Refuses if any campaign still references it.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { deleteCreative } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { idParamSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
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
