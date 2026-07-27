/**
 * /api/admin/events
 *   GET    — list all events (admins see hidden + past)
 *   POST   — create manual event
 *
 * Replaces Express GET/POST /admin/events.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  listAllEventsForAdmin,
  createManualEvent,
  type Publication,
} from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';
import {
  manualEventInputSchema,
  publicationSchema,
} from '@/lib/server/schemas/events';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const pubParam = url.searchParams.get('publication');
  const publication = pubParam
    ? (publicationSchema.parse(pubParam) as Publication)
    : undefined;
  const events = await listAllEventsForAdmin(publication);
  return NextResponse.json({ events });
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await req.json();
  const input = manualEventInputSchema.parse(body);

  if (input.endDate && input.startDate) {
    if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) {
      throw new ApiError(400, 'endDate must be on or after startDate');
    }
  }

  const event = await createManualEvent(input, admin.email);
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.create',
    eventId: event.id,
    payload: input,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ event }, { status: 201 });
});
