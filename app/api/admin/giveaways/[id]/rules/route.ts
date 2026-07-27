/**
 * /api/admin/giveaways/:id/rules
 *   POST — add a rule to a giveaway
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createGiveawayRule } from '@/lib/server/giveaways-store';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema, ruleSchema } from '@/lib/server/schemas/giveaways';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const input = ruleSchema.parse(await req.json());

  const result = await createGiveawayRule(id, input);
  if (!result.ok) throw new ApiError(404, 'Giveaway not found');

  await logAudit({
    adminId: admin.adminId,
    action: 'giveaway.rule.create',
    entityType: 'giveaway',
    entityId: result.id,
    afterState: input,
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ id: result.id }, { status: 201 });
});
