/**
 * POST /api/admin/events/hide-expired
 * Soft-hide every event whose start_date is in the past and not already hidden.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { hideExpired } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const admin = await requireAdmin();
  const hiddenCount = await hideExpired(admin.email);
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.hide_expired',
    eventId: null,
    payload: { hiddenCount },
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ hiddenCount });
});
