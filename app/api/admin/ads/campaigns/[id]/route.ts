/**
 * /api/admin/ads/campaigns/:id
 *   PATCH  — partial update (dynamic SET)
 *   DELETE — hard delete
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { updateCampaign, deleteCampaign } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { idParamSchema, updateCampaignSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);
  const body = updateCampaignSchema.parse(await req.json());

  const updated = await updateCampaign(id, body);
  if (!updated) throw new ApiError(404, 'Campaign not found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_campaign.updated',
      entityType: 'ad_campaign',
      entityId: id,
      afterState: body,
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ campaign: updated });
});

export const DELETE = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);

  const ok = await deleteCampaign(id);
  if (!ok) throw new ApiError(404, 'Campaign not found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_campaign.deleted',
      entityType: 'ad_campaign',
      entityId: id,
      afterState: {},
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ deleted: true });
});
