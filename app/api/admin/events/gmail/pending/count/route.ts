/**
 * /api/admin/events/gmail/pending/count
 *
 * GET — how many Gmail-detected events are awaiting review. Backs the nav
 *       badge, which polls on an interval, so this stays a single COUNT
 *       rather than reusing the full list endpoint.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { countPendingGmailEvents } from '@/lib/server/events-store';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  return NextResponse.json({ count: await countPendingGmailEvents() });
});
