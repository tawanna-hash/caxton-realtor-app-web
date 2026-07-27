import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { setHidden } from '@/lib/server/events-store';
import { logEventAudit } from '@/lib/server/audit';
import { eventIdParamSchema } from '@/lib/server/schemas/events';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = eventIdParamSchema.parse(await ctx.params);
  const event = await setHidden(id, false, admin.email);
  if (!event) throw new ApiError(404, 'Event not found');
  await logEventAudit({
    adminId: admin.adminId,
    action: 'event.unhide',
    eventId: id,
    payload: {},
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ event });
});
