/**
 * /api/admin/ads/campaigns
 *   GET  — list every campaign with joined space + creative rows
 *   POST — create a campaign (active=false by default in the schema)
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listCampaigns, createCampaign } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { createCampaignSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const body = createCampaignSchema.parse(await req.json());
  if (body.end_date < body.start_date) {
    throw new ApiError(400, 'end_date before start_date');
  }

  const created = await createCampaign({ ...body, created_by: admin.email });

  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_campaign.created',
      entityType: 'ad_campaign',
      entityId: created.id,
      afterState: {
        advertiser_name: created.advertiser_name,
        slot: created.ad_space_slug,
        pub: created.publication,
        start: created.start_date,
        end: created.end_date,
      },
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ campaign: created }, { status: 201 });
});
