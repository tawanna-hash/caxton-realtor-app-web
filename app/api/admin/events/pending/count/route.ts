/**
 * /api/admin/events/pending/count
 *
 * Cheap GET that returns only the count of pending events — used by
 * the admin nav badge poller so we don't drag down the full list on
 * every page load.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { countPendingEvents } from '@/lib/server/events-store';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const count = await countPendingEvents();
  return NextResponse.json({ count });
});
