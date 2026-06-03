/**
 * /api/admin/events/:id/approve
 *
 * POST — flip a pending event (hidden=true, source ∈ submission|facebook-llm)
 *        to hidden=false so it appears in the public Calendar.
 *
 * Returns 404 if the event isn't actually pending (already approved or
 * a manual admin-hidden event). For edits before approval, call PATCH
 * /api/admin/events/:id first, then POST this.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { approvePendingEvent } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';
import { eventIdParamSchema } from '@/lib/server/schemas/events';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);

  const event = await approvePendingEvent(id, admin.email);
  if (!event) {
    throw new ApiError(
      404,
      'Pending event not found (already approved, rejected, or not a review-queue event)',
    );
  }

  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.approve',
    eventId: id,
    payload: { source: event.externalSource },
    ipAddress: await getRequestIp(),
  });

  return NextResponse.json({ event });
});
