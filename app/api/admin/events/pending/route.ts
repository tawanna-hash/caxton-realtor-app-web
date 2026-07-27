/**
 * /api/admin/events/pending
 *
 * GET — list all events awaiting admin review, plus the total count
 *       (used by the admin nav badge so we don't run a 2nd round-trip
 *       just to count).
 *
 * "Pending" = events with hidden=true AND external_source in
 * ('submission', 'facebook-llm'). Manual admin-hidden events are not
 * surfaced — those were hidden deliberately by an admin and shouldn't
 * pollute the review queue.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { listPendingEvents } from '@/lib/server/events-store';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const events = await listPendingEvents();
  return NextResponse.json({ events, count: events.length });
});
