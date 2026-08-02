/**
 * /api/admin/events/gmail/pending
 *
 * GET — the Gmail slice of the review queue, plus the OAuth connection state
 *       the page needs to decide between "Connect Gmail" and the scan button.
 *
 * Bundling the mailbox into this response avoids a second round-trip on every
 * page load; the connection state is one row and changes rarely.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listPendingGmailEvents } from '@/lib/server/events-store';
import { getConnectedMailbox, isGmailOAuthConfigured } from '@/lib/server/gmail-client';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const [events, mailbox] = await Promise.all([
    listPendingGmailEvents(),
    getConnectedMailbox(),
  ]);
  return NextResponse.json({
    events,
    count: events.length,
    mailbox,
    oauthConfigured: isGmailOAuthConfigured(),
  });
});
