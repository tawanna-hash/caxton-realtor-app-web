/**
 * /api/admin/subscribers/:id
 *   GET    — detail (audit-logged as 'view_detail')
 *   PATCH  — edit (audit-logged with field-level diff)
 *   DELETE — cascade-aware hard delete (transaction; audit after commit)
 *
 * FK strategy (Decision #19):
 *   - email_log.realtor_id (nullable)        -> SET NULL
 *   - giveaways.winner_realtor_id (nullable) -> SET NULL
 *   - event_rsvps.realtor_id (NOT NULL)      -> DELETE child rows
 *   - notification_deliveries.realtor_id     -> DELETE child rows
 *   - magic_links (matched by email)         -> DELETE
 *   - giveaway_entries / mailchimp_subscriptions / notification_preferences /
 *     push_subscriptions: PG ON DELETE CASCADE handles automatically
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import {
  getSubscriberById,
  patchSubscriber,
  deleteSubscriberCascade,
} from '@/lib/server/subscribers-store';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';
import {
  patchSubscriberBodySchema,
  subscriberIdParamSchema,
} from '@/lib/server/schemas/subscribers';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const parsed = subscriberIdParamSchema.safeParse(await ctx.params);
  if (!parsed.success) throw new ApiError(400, 'invalid_id', parsed.error.message);
  const { id } = parsed.data;

  const subscriber = await getSubscriberById(id);
  if (!subscriber) throw new ApiError(404, 'not_found', 'subscriber not found');

  logAudit({
    adminId: admin.adminId,
    action: 'view_detail',
    entityType: 'subscribers',
    entityId: null,
    afterState: { id },
    ipAddress: await getRequestIp(),
  }).catch((err) => {
    logger.warn({ err, id }, 'failed to write subscribers view_detail audit');
  });

  return NextResponse.json({ subscriber });
});

export const PATCH = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const paramsParsed = subscriberIdParamSchema.safeParse(await ctx.params);
  if (!paramsParsed.success) throw new ApiError(400, 'invalid_id', paramsParsed.error.message);
  const { id } = paramsParsed.data;

  const bodyParsed = patchSubscriberBodySchema.safeParse(await req.json());
  if (!bodyParsed.success) throw new ApiError(400, 'invalid_body', bodyParsed.error.message);

  const result = await patchSubscriber(id, bodyParsed.data as Record<string, unknown>);
  if (!result.ok) throw new ApiError(404, 'not_found', 'subscriber not found');

  const { subscriber, changed } = result.result;

  if (Object.keys(changed).length > 0) {
    logAudit({
      adminId: admin.adminId,
      action: 'edit',
      entityType: 'subscribers',
      entityId: null,
      afterState: { id, changed },
      ipAddress: await getRequestIp(),
    }).catch((err) => {
      logger.warn({ err, id }, 'failed to write subscribers edit audit');
    });
  }

  return NextResponse.json({ subscriber, changed: Object.keys(changed) });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const parsed = subscriberIdParamSchema.safeParse(await ctx.params);
  if (!parsed.success) throw new ApiError(400, 'invalid_id', parsed.error.message);
  const { id } = parsed.data;

  const result = await deleteSubscriberCascade(id);
  if (!result.ok) throw new ApiError(404, 'not_found', 'subscriber not found');

  logAudit({
    adminId: admin.adminId,
    action: 'delete',
    entityType: 'subscribers',
    entityId: null,
    afterState: { id, email: result.email, counts: result.counts },
    ipAddress: await getRequestIp(),
  }).catch((err) => {
    logger.warn({ err, id }, 'failed to write subscribers delete audit');
  });

  return NextResponse.json({ deleted: true, counts: result.counts });
});
