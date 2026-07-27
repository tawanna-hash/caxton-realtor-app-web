/**
 * /api/admin/ads/creatives
 *   GET  — list every creative
 *   POST — record a creative (Vercel Blob URL captured elsewhere)
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listCreatives, createCreative } from '@/lib/server/ads-store';
import { logAudit } from '@/lib/server/audit';
import { createCreativeSchema } from '@/lib/server/schemas/ads';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const creatives = await listCreatives();
  return NextResponse.json({ creatives });
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const body = createCreativeSchema.parse(await req.json());

  const created = await createCreative({ ...body, uploaded_by: admin.email });

  // Audit log must not break the route — DO column types have bitten us
  // before. Log and continue.
  try {
    await logAudit({
      adminId: admin.adminId,
      action: 'ad_creative.created',
      entityType: 'ad_creative',
      entityId: created.id,
      afterState: { advertiser_name: created.advertiser_name, blob_url: created.blob_url },
      ipAddress: await getRequestIp(),
    });
  } catch (err) {
    logger.error({ err }, '[audit] log insert failed');
  }

  return NextResponse.json({ creative: created }, { status: 201 });
});
