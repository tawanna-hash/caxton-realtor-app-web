/**
 * POST /api/admin/events/delete-expired
 * Delete expired manual events and hide expired scraped events so they
 * cannot be reintroduced by the next scraper run.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteExpired } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  const admin = await requireAdmin();
  const result = await deleteExpired();
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.delete_expired',
    eventId: null,
    payload: result,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json(result);
});
