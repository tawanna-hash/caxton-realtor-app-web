/**
 * /api/admin/ads/campaigns/:id/toggle  POST — flip `active` boolean.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { toggleCampaign } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { idParamSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);

  const updated = await toggleCampaign(id);
  if (!updated) throw new ApiError(404, 'Campaign not found');

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_campaign.toggled',
      entityType: 'ad_campaign',
      entityId: id,
      afterState: { active: updated.active },
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ campaign: updated });
});
