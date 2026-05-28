/**
 * /api/admin/subscribers/:id/send-magic-link  POST
 *   — admin-initiated magic link to the subscriber's email.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getSubscriberLoginInfo } from '@/lib/server/subscribers-store';
import { createAndSendMagicLink } from '@/lib/server/magic-link';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';
import { subscriberIdParamSchema } from '@/lib/server/schemas/subscribers';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const parsed = subscriberIdParamSchema.safeParse(await ctx.params);
  if (!parsed.success) throw new ApiError(400, 'invalid_id', parsed.error.message);
  const { id } = parsed.data;

  const sub = await getSubscriberLoginInfo(id);
  if (!sub) throw new ApiError(404, 'not_found', 'subscriber not found');

  const hdrs = await headers();
  const ip = await getRequestIp();

  await createAndSendMagicLink({
    email: sub.email,
    firstName: sub.first_name || 'there',
    purpose: 'login',
    ipAddress: ip ?? undefined,
    userAgent: hdrs.get('user-agent') ?? undefined,
  });

  logAudit({
    adminId: admin.adminId,
    action: 'send_magic_link',
    entityType: 'subscribers',
    entityId: null,
    afterState: { id, email: sub.email },
    ipAddress: ip,
  }).catch((err) => {
    logger.warn({ err, id }, 'failed to write subscribers send_magic_link audit');
  });

  return NextResponse.json({ sent: true });
});
