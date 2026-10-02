/** POST /api/admin/giveaways/:id/winners/correction { test?: boolean } - correction email to every winner (test=true sends one copy to the admin only). */
import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { logAudit } from '@/lib/server/audit';
import { giveawayIdParamSchema } from '@/lib/server/schemas/giveaways';
import { query } from '@/lib/server/db/neon';
import { getEmailProvider } from '@/lib/server/email';
import { renderGiveawayCorrectionEmail } from '@/lib/server/email/templates';
import { ADMIN_NOTICE_EMAIL, listWinners, senderFor } from '@/lib/server/giveaway-winners';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = giveawayIdParamSchema.parse(await ctx.params);
  let test = false;
  try { test = !!(await req.json()).test; } catch { /* default false */ }
  const g = (await query<{ title: string; prize: string; publication: string }>(
    `SELECT title, prize, publication FROM giveaways WHERE id = $1`, [id]))[0];
  if (!g) throw new ApiError(404, 'Giveaway not found');
  const p = getEmailProvider();
  const send = async (email: string, name: string, first: string, prefix: string) => {
    const t = renderGiveawayCorrectionEmail({ firstName: first, giveawayTitle: g.title, prize: g.prize, publication: g.publication });
    const r = await p.send({ from: senderFor(g.publication), to: { email, name }, subject: `${prefix}${t.subject}`, text: t.text, html: t.html, emailType: 'giveaway_correction', tags: ['giveaway_correction'] });
    return !!r.success;
  };
  if (test) {
    const ok = await send(ADMIN_NOTICE_EMAIL, 'Tawanna', 'Tawanna', '[TEST] ');
    return NextResponse.json({ test: true, sent: ok ? 1 : 0, to: ADMIN_NOTICE_EMAIL });
  }
  const winners = await listWinners(id);
  let sent = 0; const failed: string[] = [];
  for (const w of winners) {
    if (await send(w.email, w.first_name, w.first_name, '')) sent++; else failed.push(w.email);
  }
  await logAudit({ adminId: admin.adminId, action: 'giveaway.winner.correction', entityType: 'giveaway', entityId: id, afterState: { sent, failed }, ipAddress: await getRequestIp() });
  await send(ADMIN_NOTICE_EMAIL, 'Tawanna', 'Tawanna', `[Summary: sent to ${sent} winners] `).catch(() => false);
  return NextResponse.json({ sent, failed });
});
