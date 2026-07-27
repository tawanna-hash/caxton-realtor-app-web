/**
 * /api/admin/ads/campaigns/:id/approve  POST
 *
 * Admin go-live gate for self-serve bookings. A self-serve campaign is paid
 * but held at approval_status='pending' (active=false) until an admin approves
 * it here. Approval flips it to active=true + approved and brings the linked
 * agreement to 'active'. Idempotent: re-approving an already-live campaign is a
 * no-op. Refuses to approve a draft (unpaid) campaign.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { approveSelfServeCampaign } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { idParamSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = idParamSchema.parse(await ctx.params);

  const { campaign, state } = await approveSelfServeCampaign(id);

  if (state === 'not_found') throw new ApiError(404, 'Campaign not found');
  if (state === 'not_pending') {
    throw new ApiError(
      409,
      'Campaign is not awaiting approval (only paid, pending bookings can be approved).',
    );
  }

  // 'approved' | 'already_live' both succeed. Only log an audit entry on the
  // real transition so idempotent retries don't spam the audit trail.
  if (state === 'approved') {
    try {
      await logAudit({
        adminId: admin.adminId,
        action: 'ad_campaign.approved',
        entityType: 'ad_campaign',
        entityId: id,
        afterState: { active: true, approval_status: 'approved' },
        ipAddress: await getRequestIp(),
      });
    } catch (err) {
      logger.error({ err }, '[audit] log insert failed');
    }
  }

  return NextResponse.json({ campaign, state });
});
