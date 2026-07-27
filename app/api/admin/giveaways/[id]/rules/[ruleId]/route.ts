/**
 * /api/admin/giveaways/:id/rules/:ruleId
 *   PATCH  — partial update of a rule (dynamic SET clauses)
 *   DELETE — remove a rule
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  updateGiveawayRule,
  deleteGiveawayRule,
} from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import { ruleIdParamSchema, ruleSchema } from '@/lib/server/schemas/giveaways';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

export const PATCH = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id, ruleId } = ruleIdParamSchema.parse(await ctx.params);
  const input = ruleSchema.partial().parse(await req.json());

  const result = await updateGiveawayRule(id, ruleId, input);
  if (!result.ok) {
    if (result.reason === 'no_fields') throw new ApiError(400, 'No fields to update');
    throw new ApiError(404, 'Rule not found');
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.rule.update',
    entityType: 'giveaway',
    entityId: ruleId,
    afterState: input,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true });
});

export const DELETE = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id, ruleId } = ruleIdParamSchema.parse(await ctx.params);

  const result = await deleteGiveawayRule(id, ruleId);
  if (!result.ok) throw new ApiError(404, 'Rule not found');

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.rule.delete',
    entityType: 'giveaway',
    entityId: ruleId,
    afterState: {},
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true });
});
