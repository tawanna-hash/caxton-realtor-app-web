/**
 * POST /api/admin/events/gmail/delete-duplicates
 * Permanently removes duplicate Gmail-detected events while retaining one
 * canonical row for each normalized title and Central-time event date.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteDuplicateGmailEvents } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  const admin = await requireAdmin();
  const deletedCount = await deleteDuplicateGmailEvents();
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.delete_gmail_duplicates',
    eventId: null,
    payload: { deletedCount },
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ deletedCount });
});
