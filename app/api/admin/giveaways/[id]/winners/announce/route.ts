/** POST /api/admin/giveaways/:id/winners/announce - one-time "winners announced" email to non-winning entrants. */
import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { announceToEntrants } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const r = await announceToEntrants(id);
  if (r.skipped === 'already_sent') throw new ApiError(400, 'The announcement was already sent for this giveaway');
  if (r.skipped === 'no_winners') throw new ApiError(400, 'Draw a winner first');
  if (r.skipped) throw new ApiError(404, 'Giveaway not found');
  await logAudit({
    adminId: admin.adminId, action: 'giveaway.announce', entityType: 'giveaway', entityId: id,
    afterState: r, ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ success: true, ...r });
});
