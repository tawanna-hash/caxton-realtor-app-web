/**
 * /api/admin/events/:id
 *   GET    — single event (newly added; the original API was missing this)
 *   PATCH  — partial update
 *   DELETE — hard-delete a manual event (scraped events: use /hide instead)
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  getEventById,
  updateEvent,
  deleteEvent,
} from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';
import {
  eventIdParamSchema,
  updateEventInputSchema,
} from '@/lib/server/schemas/events';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);
  const event = await getEventById(id);
  if (!event) throw new ApiError(404, 'Event not found');
  return NextResponse.json({ event });
});

export const PATCH = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);
  const input = updateEventInputSchema.parse(await req.json());

  if (input.endDate && input.startDate) {
    if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) {
      throw new ApiError(400, 'endDate must be on or after startDate');
    }
  }

  const event = await updateEvent(id, input, admin.email);
  if (!event) throw new ApiError(404, 'Event not found');

  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.update',
    eventId: id,
    payload: input,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ event });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);

  const deleted = await deleteEvent(id);
  if (!deleted) {
    throw new ApiError(
      400,
      'Event not found, or it is a scraped event. Use POST /admin/events/:id/hide for scraped events — deleting them would just have the next scraper run recreate them.',
    );
  }

  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.delete',
    eventId: id,
    payload: {},
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true });
});
