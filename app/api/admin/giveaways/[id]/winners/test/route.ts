/** POST /api/admin/giveaways/:id/winners/test - send test copies of the winner and announcement emails to the admin notice address only. */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { query } from '@/lib/server/db/neon';
import { getEmailProvider } from '@/lib/server/email';
import { renderGiveawayWinnerEmail, renderGiveawayAnnouncementEmail } from '@/lib/server/email/templates';
import { ADMIN_NOTICE_EMAIL, senderFor } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  const g = (await query<{ title: string; prize: string; publication: string }>(
    `SELECT title, prize, publication FROM giveaways WHERE id = $1`, [id]))[0];
  if (!g) throw new ApiError(404, 'Giveaway not found');
  const to = { email: ADMIN_NOTICE_EMAIL, name: 'Tawanna' };
  const w = renderGiveawayWinnerEmail({ firstName: 'Tawanna', giveawayTitle: g.title, prize: g.prize, publication: g.publication });
  const a = renderGiveawayAnnouncementEmail({ firstName: 'Tawanna', giveawayTitle: g.title, prize: g.prize, publication: g.publication, winnerNames: ['Katie W.', 'Sherri M.', 'Vik M.'] });
  const p = getEmailProvider();
  const r1 = await p.send({ from: senderFor(g.publication), to, subject: `[TEST] ${w.subject}`, text: w.text, html: w.html, emailType: 'giveaway_test', tags: ['giveaway_test'] });
  const r2 = await p.send({ from: senderFor(g.publication), to, subject: `[TEST] ${a.subject}`, text: a.text, html: a.html, emailType: 'giveaway_test', tags: ['giveaway_test'] });
  return NextResponse.json({ winner: !!r1.success, announcement: !!r2.success, to: ADMIN_NOTICE_EMAIL });
});
