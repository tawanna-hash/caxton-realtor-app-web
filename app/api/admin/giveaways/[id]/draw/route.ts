/**
 * /api/admin/giveaways/:id/draw
 *   POST { count?: 1-20, additional?: boolean } - draw winner(s) weighted by
 *   ticket count, email each winner, record send status, and send an
 *   internal summary to the admin notice address.
 */
import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { drawWinners, sendWinnerEmail, notifyAdminOfWinners, listWinners } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  let body: { count?: number; additional?: boolean } = {};
  try { body = await req.json(); } catch { /* no body = single draw */ }
  const count = Math.min(20, Math.max(1, Math.floor(Number(body.count) || 1)));

  const drawn = await drawWinners(id, admin.adminId, count, !!body.additional);
  if (!drawn.ok) {
    switch (drawn.error) {
      case 'not_found': throw new ApiError(404, 'Giveaway not found');
      case 'already_drawn': throw new ApiError(400, 'A winner has already been drawn for this giveaway');
      case 'not_ended': throw new ApiError(400, 'Cannot draw a winner before the giveaway ends');
      case 'no_entries': throw new ApiError(400, 'No remaining entries to draw from');
    }
  }
  await logAudit({
    adminId: admin.adminId, action: 'giveaway.draw', entityType: 'giveaway', entityId: id,
    afterState: { winnerRealtorIds: drawn.winners, additional: !!body.additional },
    ipAddress: await getRequestIp(),
  });
  for (const rid of drawn.winners) await sendWinnerEmail(id, rid);
  await notifyAdminOfWinners(id, drawn.winners);
  const winners = await listWinners(id);
  return NextResponse.json({ success: true, drawn: drawn.winners.length, requested: count, winners });
});
