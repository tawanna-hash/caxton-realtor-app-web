/**
 * Giveaway winners: multi-winner draws, per-winner email status, resend,
 * admin summary notice, and the "winners announced" email to other entrants.
 */
import { query, exec, withNeonTransaction } from './db/neon';
import { getEmailProvider } from '@/lib/server/email';
import { renderGiveawayWinnerEmail, renderGiveawayAnnouncementEmail } from '@/lib/server/email/templates';
import { logger } from '@/lib/server/logger';

const SENDER_NAMES: Record<string, string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
  both: 'RealtyLine Austin / Newsline San Antonio',
};
function senderFor(publication: string): { email: string; name: string } | undefined {
  const email = process.env.EMAIL_FROM_ADDRESS;
  return email ? { email, name: SENDER_NAMES[publication] ?? SENDER_NAMES.both! } : undefined;
}

export const ADMIN_NOTICE_EMAIL = 'tawanna@myrealtyline.com';

export interface WinnerRow {
  realtor_id: string;
  email: string;
  first_name: string;
  last_name: string;
  drawn_at: string;
  email_status: 'sent' | 'failed' | 'pending';
  email_sent_at: string | null;
  email_error: string | null;
}

let ensured = false;
export async function ensureWinnersTable(): Promise<void> {
  if (ensured) return;
  await exec(`
    CREATE TABLE IF NOT EXISTS giveaway_winners (
      giveaway_id   UUID NOT NULL,
      realtor_id    UUID NOT NULL,
      drawn_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      email_status  TEXT NOT NULL DEFAULT 'pending',
      email_sent_at TIMESTAMPTZ,
      email_error   TEXT,
      PRIMARY KEY (giveaway_id, realtor_id)
    )`);
  await exec(`ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS announced_to_entrants_at TIMESTAMPTZ`);
  // Carry over winners drawn before this table existed (email status unknown).
  await exec(`
    INSERT INTO giveaway_winners (giveaway_id, realtor_id, drawn_at, email_status)
    SELECT id, winner_realtor_id, COALESCE(winner_drawn_at, NOW()), 'pending'
      FROM giveaways WHERE winner_realtor_id IS NOT NULL
    ON CONFLICT DO NOTHING`);
  ensured = true;
}

export async function listWinners(giveawayId: string): Promise<WinnerRow[]> {
  await ensureWinnersTable();
  return query<WinnerRow>(
    `SELECT w.realtor_id::text AS realtor_id, r.email, r.first_name, r.last_name,
            w.drawn_at::text AS drawn_at, w.email_status, w.email_sent_at::text AS email_sent_at, w.email_error
       FROM giveaway_winners w JOIN realtors r ON r.id = w.realtor_id
      WHERE w.giveaway_id = $1 ORDER BY w.drawn_at, r.email`,
    [giveawayId],
  );
}

type GiveawayInfo = { id: string; title: string; prize: string; publication: string; winner_realtor_id: string | null; ends_at: string };

async function getGiveaway(id: string): Promise<GiveawayInfo | null> {
  const rows = await query<GiveawayInfo>(
    `SELECT id::text AS id, title, prize, publication, winner_realtor_id::text AS winner_realtor_id, ends_at::text AS ends_at FROM giveaways WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export type DrawOutcome =
  | { ok: true; winners: string[] }
  | { ok: false; error: 'not_found' | 'already_drawn' | 'not_ended' | 'no_entries' };

export async function drawWinners(
  giveawayId: string, adminId: string, count: number, additional: boolean,
): Promise<DrawOutcome> {
  await ensureWinnersTable();
  return withNeonTransaction(async (client) => {
    const g = (await client.query(
      `SELECT id, winner_realtor_id, ends_at FROM giveaways WHERE id = $1 FOR UPDATE`, [giveawayId],
    )).rows[0] as { winner_realtor_id: string | null; ends_at: Date } | undefined;
    if (!g) return { ok: false as const, error: 'not_found' as const };
    const existing = (await client.query(
      `SELECT realtor_id::text AS id FROM giveaway_winners WHERE giveaway_id = $1`, [giveawayId],
    )).rows.map((r: { id: string }) => r.id);
    if ((g.winner_realtor_id || existing.length) && !additional)
      return { ok: false as const, error: 'already_drawn' as const };
    if (new Date(g.ends_at).getTime() > Date.now())
      return { ok: false as const, error: 'not_ended' as const };

    const exclude = [...existing];
    const picked: string[] = [];
    for (let i = 0; i < count; i++) {
      // One row per ticket, so odds scale with ticket count.
      const pick = (await client.query(
        `SELECT realtor_id::text AS id FROM giveaway_entries
          WHERE giveaway_id = $1 AND realtor_id::text <> ALL($2::text[])
          ORDER BY random() LIMIT 1`, [giveawayId, exclude],
      )).rows[0] as { id: string } | undefined;
      if (!pick) break;
      picked.push(pick.id); exclude.push(pick.id);
    }
    if (!picked.length) return { ok: false as const, error: 'no_entries' as const };
    for (const id of picked) {
      await client.query(`INSERT INTO giveaway_winners (giveaway_id, realtor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [giveawayId, id]);
    }
    await client.query(
      `UPDATE giveaways SET winner_realtor_id = COALESCE(winner_realtor_id, $1),
              winner_drawn_at = COALESCE(winner_drawn_at, NOW()),
              drawn_by_admin_id = COALESCE(drawn_by_admin_id, $2),
              status = 'closed', updated_at = NOW() WHERE id = $3`,
      [picked[0], adminId, giveawayId],
    );
    return { ok: true as const, winners: picked };
  });
}

export async function sendWinnerEmail(giveawayId: string, realtorId: string): Promise<{ ok: boolean; error?: string }> {
  await ensureWinnersTable();
  const g = await getGiveaway(giveawayId);
  const r = (await query<{ email: string; first_name: string }>(`SELECT email, first_name FROM realtors WHERE id = $1`, [realtorId]))[0];
  if (!g || !r) return { ok: false, error: 'not found' };
  let ok = false; let error: string | undefined;
  try {
    const t = renderGiveawayWinnerEmail({ firstName: r.first_name, giveawayTitle: g.title, prize: g.prize, publication: g.publication });
    const res = await getEmailProvider().send({
      from: senderFor(g.publication),
      to: { email: r.email, name: r.first_name }, subject: t.subject, text: t.text, html: t.html,
      emailType: 'giveaway_winner', tags: ['giveaway_winner'],
    });
    ok = !!res.success; if (!ok) error = String(res.error ?? 'send failed');
  } catch (err) { error = err instanceof Error ? err.message : String(err); }
  if (!ok) logger.warn({ giveawayId, realtorId, error }, 'Giveaway winner email failed');
  await exec(
    `UPDATE giveaway_winners SET email_status = $3, email_sent_at = CASE WHEN $3 = 'sent' THEN NOW() ELSE email_sent_at END, email_error = $4
      WHERE giveaway_id = $1 AND realtor_id = $2`,
    [giveawayId, realtorId, ok ? 'sent' : 'failed', ok ? null : (error ?? 'send failed')],
  );
  return { ok, error };
}

export async function notifyAdminOfWinners(giveawayId: string, newIds: string[]): Promise<void> {
  try {
    const g = await getGiveaway(giveawayId);
    if (!g) return;
    const all = await listWinners(giveawayId);
    const fresh = all.filter((w) => newIds.includes(w.realtor_id));
    const line = (w: WinnerRow) => `${w.first_name} ${w.last_name} <${w.email}> - winner email: ${w.email_status}${w.email_error ? ` (${w.email_error})` : ''}`;
    const text = `Winner(s) drawn for "${g.title}" (${g.prize}):\n\n${fresh.map(line).join('\n')}\n\nTotal winners so far: ${all.length}\nManage: https://realtynewsnow.app/admin/giveaways/${g.id}`;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<p>Winner(s) drawn for <strong>${esc(g.title)}</strong> (${esc(g.prize)}):</p><ul>${fresh.map((w) => `<li>${esc(line(w))}</li>`).join('')}</ul><p>Total winners so far: ${all.length}</p><p><a href="https://realtynewsnow.app/admin/giveaways/${g.id}">Open giveaway</a></p>`;
    await getEmailProvider().send({
      to: { email: ADMIN_NOTICE_EMAIL, name: 'Tawanna' }, subject: `Giveaway winner drawn: ${g.title}`,
      text, html, emailType: 'giveaway_admin_notice', tags: ['giveaway_admin_notice'],
    });
  } catch (err) { logger.warn({ err, giveawayId }, 'Giveaway admin notice failed'); }
}

export async function announceToEntrants(giveawayId: string): Promise<{ sent: number; failed: number; skipped?: string }> {
  await ensureWinnersTable();
  const g = await getGiveaway(giveawayId);
  if (!g) return { sent: 0, failed: 0, skipped: 'not_found' };
  const done = (await query<{ a: string | null }>(`SELECT announced_to_entrants_at::text AS a FROM giveaways WHERE id = $1`, [giveawayId]))[0]?.a;
  if (done) return { sent: 0, failed: 0, skipped: 'already_sent' };
  const winners = await listWinners(giveawayId);
  if (!winners.length) return { sent: 0, failed: 0, skipped: 'no_winners' };
  const entrants = await query<{ email: string; first_name: string }>(
    `SELECT DISTINCT ON (lower(r.email)) r.email, r.first_name
       FROM giveaway_entries e JOIN realtors r ON r.id = e.realtor_id
      WHERE e.giveaway_id = $1 AND r.email IS NOT NULL
        AND r.id::text <> ALL($2::text[])
        AND lower(r.email) NOT LIKE '%@caxton.test'
        AND NOT EXISTS (SELECT 1 FROM email_suppressions s WHERE lower(s.email) = lower(r.email))`,
    [giveawayId, winners.map((w) => w.realtor_id)],
  );
  const winnerNames = winners.map((w) => `${w.first_name} ${w.last_name.slice(0, 1)}.`.trim());
  let sent = 0; let failed = 0;
  for (const e of entrants) {
    try {
      const t = renderGiveawayAnnouncementEmail({ firstName: e.first_name, giveawayTitle: g.title, prize: g.prize, publication: g.publication, winnerNames });
      const res = await getEmailProvider().send({
        from: senderFor(g.publication),
        to: { email: e.email, name: e.first_name }, subject: t.subject, text: t.text, html: t.html,
        emailType: 'giveaway_announcement', tags: ['giveaway_announcement'],
      });
      if (res.success) sent++; else failed++;
    } catch { failed++; }
  }
  await exec(`UPDATE giveaways SET announced_to_entrants_at = NOW() WHERE id = $1`, [giveawayId]);
  try {
    await getEmailProvider().send({
      to: { email: ADMIN_NOTICE_EMAIL, name: 'Tawanna' }, subject: `Giveaway announcement sent: ${g.title}`,
      text: `Winners-announced email sent to ${sent} entrants (${failed} failed).`,
      html: `<p>Winners-announced email sent to ${sent} entrants (${failed} failed).</p>`,
      emailType: 'giveaway_admin_notice', tags: ['giveaway_admin_notice'],
    });
  } catch { /* best effort */ }
  return { sent, failed };
}

export async function getAnnouncementState(giveawayId: string): Promise<string | null> {
  await ensureWinnersTable();
  return (await query<{ a: string | null }>(`SELECT announced_to_entrants_at::text AS a FROM giveaways WHERE id = $1`, [giveawayId]))[0]?.a ?? null;
}
