/**
 * POST /api/admin/events/gmail/bulk-reject
 * Body: { ids: number[] } (1..500)
 *
 * Hard-deletes a batch of pending Gmail review-queue events.
 * rejectPendingEvent is already guarded to hidden=true +
 * external_source in REVIEW_QUEUE_SOURCES, so any stray non-Gmail
 * id becomes a silent no-op.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { rejectPendingEvent } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

const bodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export const POST = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const ip = await getRequestIp();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(400, 'ids must be an array of 1..500 positive integers');
  }

  const deleted: number[] = [];
  let missing = 0;
  for (const id of parsed.data.ids) {
    const ev = await rejectPendingEvent(id);
    if (ev) {
      deleted.push(id);
      await logEventAudit({
        eventId: id,
        action: 'event.reject',
        adminId: admin.adminId,
        ipAddress: ip,
        payload: { bulk: true },
      });
    } else {
      missing += 1;
    }
  }

  return NextResponse.json({ deleted: deleted.length, missing, ids: deleted });
});
