/** POST /api/admin/giveaways/:id/winners/resend { realtorId } - resend a winner email. */
import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { listWinners, sendWinnerEmail } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const { realtorId } = (await req.json()) as { realtorId?: string };
  if (!realtorId) throw new ApiError(400, 'Missing realtorId');
  const winners = await listWinners(id);
  if (!winners.some((w) => w.realtor_id === realtorId)) throw new ApiError(404, 'Not a winner of this giveaway');
  const r = await sendWinnerEmail(id, realtorId);
  await logAudit({
    adminId: admin.adminId, action: 'giveaway.winner.resend', entityType: 'giveaway', entityId: id,
    afterState: { realtorId, ok: r.ok }, ipAddress: await getRequestIp(),
  });
  if (!r.ok) throw new ApiError(502, `Email failed: ${r.error ?? 'unknown error'}`);
  return NextResponse.json({ success: true });
});
