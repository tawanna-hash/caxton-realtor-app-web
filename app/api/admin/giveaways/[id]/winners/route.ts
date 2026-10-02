/** GET /api/admin/giveaways/:id/winners - winners with email status + announcement state. */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { listWinners, getAnnouncementState } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const [winners, announcedAt] = await Promise.all([listWinners(id), getAnnouncementState(id)]);
  return NextResponse.json({ winners, announcedAt });
});
