/**
 * POST /api/admin/events/delete-expired
 * Permanently delete every event whose end date, or start date when no end
 * date exists, is already in the past.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteExpired } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  const admin = await requireAdmin();
  const deletedCount = await deleteExpired();
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.delete_expired',
    eventId: null,
    payload: { deletedCount },
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ deletedCount });
});
