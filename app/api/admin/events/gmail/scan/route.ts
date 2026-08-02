/**
 * /api/admin/events/gmail/scan
 *
 * POST — run the Gmail scanner on demand from /admin/events/gmail.
 *
 * Uses a 30-day lookback rather than the cron's 3 days: the manual button is
 * what an admin reaches for after connecting a new mailbox or adding a source
 * org, and they expect to see the recent backlog. Already-scanned messages are
 * skipped before the Gemini call, so the wider window is cheap on re-runs.
 *
 * Runs inline (no job queue) within the 300s function budget — the scanner
 * caps how many messages a single run will process.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { scanGmailForEvents } from '@/lib/server/gmail-event-scanner';
import { getConnectedMailbox } from '@/lib/server/gmail-client';
import { logAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MANUAL_LOOKBACK_DAYS = 30;

export const POST = withAdminTracking(async () => {
  const admin = await requireAdmin();

  const mailbox = await getConnectedMailbox();
  if (!mailbox) {
    throw new ApiError(400, 'No Gmail mailbox is connected. Connect one first.');
  }

  const result = await scanGmailForEvents({ lookbackDays: MANUAL_LOOKBACK_DAYS });

  await logAudit({
    adminId: admin.adminId,
    action: 'gmail.scan',
    entityType: 'gmail_scan',
    entityId: null,
    afterState: result,
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ result });
});
