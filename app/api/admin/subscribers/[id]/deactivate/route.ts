/**
 * /api/admin/subscribers/:id/deactivate  POST — flip status to 'inactive'.
 *
 * Note: this only flips the flag. Login is NOT yet gated on status='active'.
 * Follow-up: gate magic-link issuance + JWT refresh on status check.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { deactivateSubscriber } from '@/lib/server/subscribers-store';
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

  const result = await deactivateSubscriber(id);
  if (!result.ok) throw new ApiError(404, 'not_found', 'subscriber not found');

  if (result.changed) {
    logAudit({
      adminId: admin.adminId,
      action: 'deactivate',
      entityType: 'subscribers',
      entityId: null,
      afterState: { id, previous_status: 'active' },
      ipAddress: await getRequestIp(),
    }).catch((err) => {
      logger.warn({ err, id }, 'failed to write subscribers deactivate audit');
    });
  }

  return NextResponse.json({ subscriber: result.subscriber, changed: result.changed });
});
