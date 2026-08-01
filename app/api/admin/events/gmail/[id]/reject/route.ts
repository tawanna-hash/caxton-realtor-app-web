/**
 * /api/admin/events/gmail/:id/reject
 *
 * POST — discard a pending review-queue event the scanner got wrong.
 *
 * Returns 404 when the event isn't pending (already approved or rejected), so
 * a double-click from the review page is a no-op rather than a surprise.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { rejectPendingEvent } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';
import { eventIdParamSchema } from '@/lib/server/schemas/events';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);

  const event = await rejectPendingEvent(id);
  if (!event) {
    throw new ApiError(404, 'Pending event not found (already approved or rejected)');
  }

  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.reject',
    eventId: id,
    payload: {
      source: event.externalSource,
      external_id: event.externalId,
      title: event.title,
      organizer_email: event.organizerEmail,
    },
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ rejected: true, id });
});
