import { randomBytes, randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { ensureAssistSchema, requireDeal } from '@/lib/server/closing-time-assist';
import { logDealEvent } from '@/lib/server/closing-time-events';
import { sendEmail } from '@/lib/email';

/**
 * Scheduling polls on a deal. The agent proposes times (inspection, walkthrough, closing, anything),
 * each invitee gets a private no-sign-in link and answers Yes / Maybe / No per time, and the agent
 * picks the final time. Times are Central Time wall-clock values (date + HH:MM), matching how the
 * rest of Closing Time treats dates.
 */

export type PollAnswer = 'yes' | 'maybe' | 'no';
export type PollOption = { id: string; date: string; time: string };
export type PollInvitee = { id: string; name: string; email: string; token: string; respondedAt: string | null; comment: string; votes: Record<string, PollAnswer> };
export type Poll = {
  id: string; dealId: string; title: string; location: string; durationMin: number; note: string;
  status: 'open' | 'closed'; finalOptionId: string | null; createdAt: string; closedAt: string | null;
  options: PollOption[]; invitees: PollInvitee[];
};

let ready: Promise<void> | null = null;
function ensurePollSchema(): Promise<void> {
  ready ??= (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_polls (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', duration_min INTEGER NOT NULL DEFAULT 60, note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', final_option_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_polls_deal_idx ON closing_time_polls (realtor_id, deal_id, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_poll_options (
      id UUID PRIMARY KEY, poll_id UUID NOT NULL REFERENCES closing_time_polls(id) ON DELETE CASCADE,
      slot_date TEXT NOT NULL, slot_time TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_poll_options_poll_idx ON closing_time_poll_options (poll_id, position)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_poll_invitees (
      id UUID PRIMARY KEY, poll_id UUID NOT NULL REFERENCES closing_time_polls(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', token TEXT NOT NULL UNIQUE, comment TEXT NOT NULL DEFAULT '',
      responded_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_poll_invitees_poll_idx ON closing_time_poll_invitees (poll_id)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_poll_votes (
      invitee_id UUID NOT NULL REFERENCES closing_time_poll_invitees(id) ON DELETE CASCADE,
      option_id UUID NOT NULL REFERENCES closing_time_poll_options(id) ON DELETE CASCADE,
      answer TEXT NOT NULL, PRIMARY KEY (invitee_id, option_id))`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** "Thu, Oct 8 at 2:00 PM CT" from a Central wall-clock date and time. */
export function slotLabel(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const hr = ((h + 11) % 12) + 1;
  return `${day} at ${hr}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} CT`;
}

/** Converts a Central wall-clock time to a UTC Date (handles daylight saving). */
export function chicagoToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asChicago = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  return new Date(guess + (guess - asChicago));
}

export async function agentOf(realtorId: string): Promise<{ name: string; email: string }> {
  const rows = await query<{ first_name: string | null; last_name: string | null; email: string }>(
    `SELECT r.first_name, r.last_name, COALESCE(NULLIF((SELECT w.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w WHERE w.realtor_id=r.id),''), r.email) AS email FROM realtors r WHERE r.id=$1 LIMIT 1`, [realtorId]);
  return { name: [rows[0]?.first_name, rows[0]?.last_name].filter(Boolean).join(' ') || 'Your agent', email: rows[0]?.email ?? '' };
}

type PollRow = { id: string; deal_id: string; title: string; location: string; duration_min: number; note: string; status: string; final_option_id: string | null; created_at: Date | string; closed_at: Date | string | null };

async function hydrate(polls: PollRow[]): Promise<Poll[]> {
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);
  const [opts, people, votes] = await Promise.all([
    query<{ id: string; poll_id: string; slot_date: string; slot_time: string }>(`SELECT id, poll_id, slot_date, slot_time FROM closing_time_poll_options WHERE poll_id = ANY($1::uuid[]) ORDER BY position, slot_date, slot_time`, [ids]),
    query<{ id: string; poll_id: string; name: string; email: string; token: string; comment: string; responded_at: Date | string | null }>(`SELECT id, poll_id, name, email, token, comment, responded_at FROM closing_time_poll_invitees WHERE poll_id = ANY($1::uuid[]) ORDER BY created_at, name`, [ids]),
    query<{ invitee_id: string; option_id: string; answer: string }>(`SELECT v.invitee_id, v.option_id, v.answer FROM closing_time_poll_votes v JOIN closing_time_poll_invitees i ON i.id=v.invitee_id WHERE i.poll_id = ANY($1::uuid[])`, [ids]),
  ]);
  return polls.map((p) => ({
    id: p.id, dealId: p.deal_id, title: p.title, location: p.location, durationMin: p.duration_min, note: p.note,
    status: p.status === 'closed' ? 'closed' : 'open', finalOptionId: p.final_option_id, createdAt: iso(p.created_at)!, closedAt: iso(p.closed_at),
    options: opts.filter((o) => o.poll_id === p.id).map((o) => ({ id: o.id, date: o.slot_date, time: o.slot_time })),
    invitees: people.filter((i) => i.poll_id === p.id).map((i) => ({
      id: i.id, name: i.name, email: i.email, token: i.token, comment: i.comment, respondedAt: iso(i.responded_at),
      votes: Object.fromEntries(votes.filter((v) => v.invitee_id === i.id).map((v) => [v.option_id, v.answer as PollAnswer])),
    })),
  }));
}

export async function listPolls(realtorId: string, dealId: string): Promise<Poll[]> {
  await ensurePollSchema();
  const rows = await query<PollRow>(`SELECT id, deal_id, title, location, duration_min, note, status, final_option_id, created_at, closed_at FROM closing_time_polls WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 50`, [realtorId, dealId]);
  return hydrate(rows);
}

async function ownPoll(realtorId: string, pollId: string): Promise<Poll> {
  await ensurePollSchema();
  const rows = await query<PollRow>(`SELECT id, deal_id, title, location, duration_min, note, status, final_option_id, created_at, closed_at FROM closing_time_polls WHERE id=$1 AND realtor_id=$2`, [pollId, realtorId]);
  if (!rows[0]) throw new ApiError(404, 'Poll not found.');
  return (await hydrate(rows))[0];
}

function inviteHtml(o: { first: string; agent: string; title: string; property: string; location: string; note: string; href: string; slots: string[]; reminder?: boolean }) {
  return `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:560px"><p>Hello ${esc(o.first)},</p>`
    + `<p>${o.reminder ? 'A quick reminder: ' : ''}${esc(o.agent)} is scheduling <strong>${esc(o.title)}</strong> for ${esc(o.property)} and would like to know which times work for you.</p>`
    + `<ul style="padding-left:18px;margin:8px 0">${o.slots.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    + (o.location ? `<p style="margin:4px 0"><strong>Where:</strong> ${esc(o.location)}</p>` : '')
    + (o.note ? `<p>${esc(o.note)}</p>` : '')
    + `<p><a href="${o.href}" style="display:inline-block;padding:10px 16px;background:#301D5D;color:#ffffff;text-decoration:none;border-radius:8px">Choose Your Times</a></p>`
    + `<p style="color:#7A7787;font-size:13px">This link is private to you. No sign-in needed. Reply to this email with any questions.</p></div>`;
}

export async function createPoll(realtorId: string, dealId: string, input: {
  title: string; location: string; durationMin: number; note: string;
  options: { date: string; time: string }[]; invitees: { name: string; email: string }[]; email: boolean; origin: string; replyTo: string;
}): Promise<{ poll: Poll; emailed: number }> {
  const deal = await requireDeal(realtorId, dealId);
  await ensurePollSchema();
  const slots = Array.from(new Map(input.options.map((o) => [`${o.date} ${o.time}`, o])).values()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (!slots.length) throw new ApiError(400, 'Add at least one time.');
  const people = Array.from(new Map(input.invitees.map((p) => [p.name.trim().toLowerCase(), p])).values());
  if (!people.length) throw new ApiError(400, 'Choose at least one person.');
  const id = randomUUID();
  await query(`INSERT INTO closing_time_polls (id, realtor_id, deal_id, title, location, duration_min, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, realtorId, dealId, input.title, input.location, input.durationMin, input.note]);
  for (const [i, s] of slots.entries()) await query(`INSERT INTO closing_time_poll_options (id, poll_id, slot_date, slot_time, position) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, s.date, s.time, i]);
  for (const p of people) await query(`INSERT INTO closing_time_poll_invitees (id, poll_id, name, email, token) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, p.name.trim(), p.email.trim(), randomBytes(32).toString('base64url')]);
  await logDealEvent(realtorId, dealId, 'poll', `Scheduling poll created: ${input.title} (${slots.length} time${slots.length === 1 ? '' : 's'}, ${people.length} ${people.length === 1 ? 'person' : 'people'})`);
  const poll = await ownPoll(realtorId, id);
  const emailed = input.email ? await emailInvitees(realtorId, poll, deal.propertyAddress || deal.title || 'your deal', input.origin, input.replyTo, false) : 0;
  return { poll: await ownPoll(realtorId, id), emailed };
}

async function emailInvitees(realtorId: string, poll: Poll, property: string, origin: string, replyTo: string, reminder: boolean): Promise<number> {
  const agent = await agentOf(realtorId);
  const slots = poll.options.map((o) => slotLabel(o.date, o.time));
  let sent = 0;
  for (const p of poll.invitees) {
    if (!validEmail(p.email) || (reminder && p.respondedAt)) continue;
    const r = await sendEmail({ to: p.email, replyTo: replyTo || agent.email || undefined, subject: `${reminder ? 'Reminder: ' : ''}When works for ${poll.title}? - ${property}`,
      html: inviteHtml({ first: p.name.split(/\s+/)[0], agent: agent.name, title: poll.title, property, location: poll.location, note: poll.note, href: `${origin}/schedule/${p.token}`, slots, reminder }) }).catch(() => ({ ok: false }));
    if ((r as { ok?: boolean }).ok !== false) { sent += 1; await logDealEvent(realtorId, poll.dealId, 'email', `Scheduling poll ${reminder ? 'reminder' : 'invite'} emailed to ${p.name} <${p.email}>: ${poll.title}`); }
  }
  return sent;
}

export async function remindPoll(realtorId: string, pollId: string, origin: string, replyTo: string): Promise<number> {
  const poll = await ownPoll(realtorId, pollId);
  if (poll.status !== 'open') throw new ApiError(400, 'This poll is closed.');
  const deal = await requireDeal(realtorId, poll.dealId);
  return emailInvitees(realtorId, poll, deal.propertyAddress || deal.title || 'your deal', origin, replyTo, true);
}

/** Picks the final time and closes the poll. Optionally emails everyone the confirmed time with a calendar link. */
export async function finalizePoll(realtorId: string, pollId: string, optionId: string, notify: boolean, origin: string, replyTo: string): Promise<number> {
  const poll = await ownPoll(realtorId, pollId);
  const opt = poll.options.find((o) => o.id === optionId);
  if (!opt) throw new ApiError(400, 'That time is not on this poll.');
  await query(`UPDATE closing_time_polls SET status='closed', final_option_id=$3, closed_at=NOW() WHERE id=$1 AND realtor_id=$2`, [pollId, realtorId, optionId]);
  const when = slotLabel(opt.date, opt.time);
  await logDealEvent(realtorId, poll.dealId, 'poll', `Scheduling poll closed: ${poll.title} set for ${when}`);
  if (!notify) return 0;
  const deal = await requireDeal(realtorId, poll.dealId);
  const agent = await agentOf(realtorId);
  const property = deal.propertyAddress || deal.title || 'your deal';
  let sent = 0;
  for (const p of poll.invitees) {
    if (!validEmail(p.email)) continue;
    const href = `${origin}/api/schedule/${p.token}/ics`;
    const r = await sendEmail({ to: p.email, replyTo: replyTo || agent.email || undefined, subject: `Confirmed: ${poll.title} on ${when} - ${property}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:560px"><p>Hello ${esc(p.name.split(/\s+/)[0])},</p><p><strong>${esc(poll.title)}</strong> for ${esc(property)} is set for <strong>${esc(when)}</strong>${poll.durationMin ? ` (about ${poll.durationMin} minutes)` : ''}.</p>${poll.location ? `<p style="margin:4px 0"><strong>Where:</strong> ${esc(poll.location)}</p>` : ''}<p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#301D5D;color:#ffffff;text-decoration:none;border-radius:8px">Add To Calendar</a></p><p style="color:#7A7787;font-size:13px">Sent by ${esc(agent.name)}. Reply to this email with any questions.</p></div>` }).catch(() => ({ ok: false }));
    if ((r as { ok?: boolean }).ok !== false) { sent += 1; await logDealEvent(realtorId, poll.dealId, 'email', `Scheduling confirmation emailed to ${p.name} <${p.email}>: ${poll.title} on ${when}`); }
  }
  return sent;
}

export async function reopenPoll(realtorId: string, pollId: string): Promise<void> {
  const poll = await ownPoll(realtorId, pollId);
  await query(`UPDATE closing_time_polls SET status='open', final_option_id=NULL, closed_at=NULL WHERE id=$1 AND realtor_id=$2`, [pollId, realtorId]);
  await logDealEvent(realtorId, poll.dealId, 'poll', `Scheduling poll reopened: ${poll.title}`);
}

export async function deletePoll(realtorId: string, pollId: string): Promise<void> {
  const poll = await ownPoll(realtorId, pollId);
  await query(`DELETE FROM closing_time_polls WHERE id=$1 AND realtor_id=$2`, [pollId, realtorId]);
  await logDealEvent(realtorId, poll.dealId, 'poll', `Scheduling poll deleted: ${poll.title}`);
}

/* ---------- Public side: one private link per invitee ---------- */

export type PublicPoll = {
  title: string; location: string; durationMin: number; note: string; property: string; agentName: string; agentEmail: string;
  status: 'open' | 'closed'; finalOptionId: string | null; name: string; comment: string; responded: boolean;
  options: (PollOption & { yes: number; maybe: number })[]; votes: Record<string, PollAnswer>; invited: number; responses: number;
};

async function byToken(token: string): Promise<{ realtorId: string; poll: Poll; me: PollInvitee } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  await ensurePollSchema();
  const rows = await query<PollRow & { realtor_id: string }>(`SELECT p.id, p.realtor_id, p.deal_id, p.title, p.location, p.duration_min, p.note, p.status, p.final_option_id, p.created_at, p.closed_at
    FROM closing_time_poll_invitees i JOIN closing_time_polls p ON p.id=i.poll_id WHERE i.token=$1 LIMIT 1`, [token]);
  if (!rows[0]) return null;
  const poll = (await hydrate(rows))[0];
  const me = poll.invitees.find((i) => i.token === token);
  return me ? { realtorId: rows[0].realtor_id, poll, me } : null;
}

/** What one invitee sees: the times, their own answers, and anonymous tallies. Other people's names and answers stay private. */
export async function getPublicPoll(token: string): Promise<PublicPoll | null> {
  const found = await byToken(token);
  if (!found) return null;
  const { poll, me, realtorId } = found;
  const deal = await requireDeal(realtorId, poll.dealId).catch(() => null);
  if (!deal) return null;
  const agent = await agentOf(realtorId);
  return {
    title: poll.title, location: poll.location, durationMin: poll.durationMin, note: poll.note,
    property: deal.propertyAddress || deal.title || '', agentName: agent.name, agentEmail: agent.email,
    status: poll.status, finalOptionId: poll.finalOptionId, name: me.name, comment: me.comment, responded: Boolean(me.respondedAt),
    options: poll.options.map((o) => ({ ...o, yes: poll.invitees.filter((i) => i.votes[o.id] === 'yes').length, maybe: poll.invitees.filter((i) => i.votes[o.id] === 'maybe').length })),
    votes: me.votes, invited: poll.invitees.length, responses: poll.invitees.filter((i) => i.respondedAt).length,
  };
}

export async function submitVotes(token: string, votes: Record<string, PollAnswer>, comment: string): Promise<{ ok: boolean; error?: string }> {
  const found = await byToken(token);
  if (!found) return { ok: false, error: 'This link is no longer active.' };
  const { poll, me, realtorId } = found;
  if (poll.status !== 'open') return { ok: false, error: 'This poll is closed.' };
  const valid = new Set(poll.options.map((o) => o.id));
  await query(`DELETE FROM closing_time_poll_votes WHERE invitee_id=$1`, [me.id]);
  for (const [optionId, answer] of Object.entries(votes)) {
    if (!valid.has(optionId)) continue;
    await query(`INSERT INTO closing_time_poll_votes (invitee_id, option_id, answer) VALUES ($1,$2,$3)`, [me.id, optionId, answer]);
  }
  await query(`UPDATE closing_time_poll_invitees SET comment=$2, responded_at=NOW() WHERE id=$1`, [me.id, comment.slice(0, 500)]);
  const yes = poll.options.filter((o) => votes[o.id] === 'yes').map((o) => slotLabel(o.date, o.time));
  await logDealEvent(realtorId, poll.dealId, 'poll', `${me.name} answered the ${poll.title} poll${yes.length ? `: available ${yes.join('; ')}` : ': none of the times work'}${comment.trim() ? ` (note: ${comment.trim().slice(0, 160)})` : ''}`);
  return { ok: true };
}

/** Calendar file for the confirmed time, addressed by the invitee's link. */
export async function pollIcs(token: string): Promise<string | null> {
  const found = await byToken(token);
  if (!found || !found.poll.finalOptionId) return null;
  const { poll, realtorId } = found;
  const opt = poll.options.find((o) => o.id === poll.finalOptionId);
  if (!opt) return null;
  const deal = await requireDeal(realtorId, poll.dealId).catch(() => null);
  const start = chicagoToUtc(opt.date, opt.time);
  const end = new Date(start.getTime() + Math.max(15, poll.durationMin) * 60_000);
  const stamp = (d: Date) => d.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const icsEsc = (v: string) => v.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
  const property = deal?.propertyAddress || deal?.title || '';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Realty News Now//Closing Time Scheduling//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:poll-${poll.id}@realtynewsnow.app`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEsc(`${poll.title}${property ? ` - ${property}` : ''}`)}`,
    ...(poll.location ? [`LOCATION:${icsEsc(poll.location)}`] : []),
    ...(poll.note ? [`DESCRIPTION:${icsEsc(poll.note)}`] : []),
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}
