import { randomBytes, randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { ensureAssistSchema, requireDeal } from '@/lib/server/closing-time-assist';
import { logDealEvent } from '@/lib/server/closing-time-events';
import { agentOf } from '@/lib/server/closing-time-schedulers';
import { dealPeople } from '@/lib/closing-time-people';
import { sendEmail } from '@/lib/email';
import { wallToUtc } from '@/lib/scheduler-shared';

/**
 * Closing scheduling: the title company is emailed first and enters the dates and times it can host the closing.
 * The buyer or seller (the agent's client side) then picks one of those times. The confirmed closing, with a calendar
 * file, goes to everyone selected on the request. Both public pages are reached by an unguessable link.
 */

export const CLOSING_TZ = 'America/Chicago';
export type Person = { name: string; email: string; role: string };
export type Slot = { startUtc: string; endUtc: string };
type Status = 'awaiting_title' | 'awaiting_choice' | 'scheduled' | 'cancelled';
type Row = { id: string; realtor_id: string; deal_id: string; status: Status; title_name: string; title_email: string; title_token: string; chooser_token: string; choosers: Person[]; recipients: Person[]; slots: Slot[]; location: string; note: string; chosen_start: Date | string | null; chosen_end: Date | string | null; created_at: Date | string };

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_closing_requests (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting_title', title_name TEXT NOT NULL DEFAULT '', title_email TEXT NOT NULL,
      title_token TEXT NOT NULL UNIQUE, chooser_token TEXT NOT NULL UNIQUE,
      choosers JSONB NOT NULL DEFAULT '[]'::jsonb, recipients JSONB NOT NULL DEFAULT '[]'::jsonb, slots JSONB NOT NULL DEFAULT '[]'::jsonb,
      location TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', chosen_start TIMESTAMPTZ, chosen_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_closing_requests_deal_idx ON closing_time_closing_requests (realtor_id, deal_id, created_at)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const token = () => randomBytes(24).toString('base64url');
const whenText = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: CLOSING_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
const shell = (inner: string) => `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px">${inner}</div>`;
const button = (href: string, label: string) => `<p><a href="${esc(href)}" style="display:inline-block;background:#005a8f;color:#fff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:8px">${esc(label)}</a></p>`;

function icsText(id: string, start: Date, end: Date, title: string, location: string, description: string): string {
  const stamp = (d: Date) => d.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const e = (v: string) => v.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Realty News Now//Closing Time Closing//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:closing-${id}@realtynewsnow.app`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${e(title)}`, ...(location ? [`LOCATION:${e(location)}`] : []), ...(description ? [`DESCRIPTION:${e(description)}`] : []), 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

const dealLabel = (d: { propertyAddress?: string; title?: string }) => (d.propertyAddress || d.title || 'Your deal').trim();

/** Who can be asked: the title company, the clients who choose, and everyone else the agent may message on the deal. */
export async function closingContext(realtorId: string, dealId: string) {
  const deal = await requireDeal(realtorId, dealId);
  const people = dealPeople(deal).filter((p) => validEmail(p.email));
  const title = people.find((p) => /title|escrow/i.test(p.role));
  const clients = people.filter((p) => p.kind === 'client' && /buyer|seller|client/i.test(p.role));
  const recipients = people.filter((p) => p.kind !== 'other-side');
  return {
    property: dealLabel(deal),
    title: title ? { name: title.name, email: title.email } : null,
    choosers: clients.map((p) => ({ name: p.name, email: p.email, role: p.role })),
    recipients: recipients.map((p) => ({ name: p.name, email: p.email, role: p.role })),
    otherSide: dealPeople(deal).filter((p) => p.kind === 'other-side' && validEmail(p.email)).map((p) => ({ name: p.name, email: p.email, role: p.role })),
    requests: await listRequests(realtorId, dealId),
  };
}

export type RequestView = { id: string; status: Status; titleName: string; titleEmail: string; choosers: Person[]; recipients: Person[]; slots: Slot[]; location: string; chosenStart: string | null; createdAt: string };
const view = (r: Row): RequestView => ({ id: r.id, status: r.status, titleName: r.title_name, titleEmail: r.title_email, choosers: r.choosers, recipients: r.recipients, slots: r.slots, location: r.location, chosenStart: r.chosen_start ? new Date(r.chosen_start).toISOString() : null, createdAt: new Date(r.created_at).toISOString() });

export async function listRequests(realtorId: string, dealId: string): Promise<RequestView[]> {
  await ensure();
  const rows = await query<Row>(`SELECT * FROM closing_time_closing_requests WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at DESC LIMIT 10`, [realtorId, dealId]);
  return rows.map(view);
}

const clean = (list: Person[]) => { const seen = new Set<string>(); return list.filter((p) => { const k = p.email.trim().toLowerCase(); if (!validEmail(p.email.trim()) || seen.has(k)) return false; seen.add(k); return true; }).map((p) => ({ name: p.name.trim(), email: p.email.trim(), role: p.role.trim() })); };

export async function createRequest(realtorId: string, dealId: string, input: { titleName: string; titleEmail: string; choosers: Person[]; recipients: Person[]; origin: string }): Promise<void> {
  await ensure();
  const deal = await requireDeal(realtorId, dealId);
  if (!validEmail(input.titleEmail.trim())) throw new ApiError(400, 'Enter the title company email.');
  const choosers = clean(input.choosers);
  if (!choosers.length) throw new ApiError(400, 'Choose at least one buyer or seller who will pick the closing time.');
  const open = await query<{ id: string }>(`SELECT id FROM closing_time_closing_requests WHERE realtor_id=$1 AND deal_id=$2 AND status IN ('awaiting_title','awaiting_choice')`, [realtorId, dealId]);
  if (open[0]) throw new ApiError(409, 'A closing request is already open on this deal. Cancel it first.');
  const id = randomUUID(); const tt = token(); const ct = token();
  await query(`INSERT INTO closing_time_closing_requests (id, realtor_id, deal_id, title_name, title_email, title_token, chooser_token, choosers, recipients) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
    [id, realtorId, dealId, input.titleName.trim(), input.titleEmail.trim(), tt, ct, JSON.stringify(choosers), JSON.stringify(clean(input.recipients))]);
  const agent = await agentOf(realtorId); const property = dealLabel(deal);
  const link = `${input.origin}/book/closing/title/${tt}`;
  await sendEmail({ to: input.titleEmail.trim(), cc: validEmail(agent.email) ? agent.email : undefined, replyTo: validEmail(agent.email) ? agent.email : undefined, subject: `${property}: Closing Times Needed`,
    html: shell(`<p>Hello${input.titleName.trim() ? ` ${esc(input.titleName.trim().split(/\s+/)[0])}` : ''},</p><p>${esc(agent.name)} is scheduling the closing for <strong>${esc(property)}</strong>. Please enter the dates and times your office can host the closing. The buyer or seller will then choose from your list.</p>${button(link, 'Enter Available Times')}<p style="color:#51555b;font-size:13px">This private link works only for this closing.</p>`) }).catch(() => undefined);
  await logDealEvent(realtorId, dealId, 'email', `Closing times requested from title company <${input.titleEmail.trim()}> for ${property}`);
}

export async function cancelRequest(realtorId: string, id: string): Promise<void> {
  await ensure();
  const r = await query<{ deal_id: string }>(`UPDATE closing_time_closing_requests SET status='cancelled', updated_at=NOW() WHERE id=$1 AND realtor_id=$2 AND status IN ('awaiting_title','awaiting_choice') RETURNING deal_id`, [id, realtorId]);
  if (r[0]) await logDealEvent(realtorId, r[0].deal_id, 'closing', 'Closing scheduling request cancelled');
}

/* ---------- Public side ---------- */

export type PublicRequest = { role: 'title' | 'choose'; status: Status; property: string; agentName: string; titleName: string; slots: { index: number; startUtc: string; endUtc: string; label: string }[]; location: string; note: string; chosen: string | null; tz: string };

async function byToken(tok: string): Promise<{ row: Row; role: 'title' | 'choose' } | null> {
  await ensure();
  const rows = await query<Row>(`SELECT * FROM closing_time_closing_requests WHERE title_token=$1 OR chooser_token=$1`, [tok]);
  const row = rows[0]; if (!row) return null;
  return { row, role: row.title_token === tok ? 'title' : 'choose' };
}

export async function publicRequest(tok: string): Promise<PublicRequest | null> {
  const f = await byToken(tok); if (!f) return null;
  const { row, role } = f;
  const deal = await requireDeal(row.realtor_id, row.deal_id).catch(() => null);
  const agent = await agentOf(row.realtor_id);
  return { role, status: row.status, property: deal ? dealLabel(deal) : 'This closing', agentName: agent.name, titleName: row.title_name, location: row.location, note: row.note, tz: CLOSING_TZ,
    chosen: row.chosen_start ? whenText(new Date(row.chosen_start)) : null,
    slots: row.slots.map((s, index) => ({ index, startUtc: s.startUtc, endUtc: s.endUtc, label: whenText(new Date(s.startUtc)) })) };
}

export async function submitTimes(tok: string, input: { slots: { date: string; time: string }[]; durationMin: number; location: string; note: string; origin: string }): Promise<void> {
  const f = await byToken(tok);
  if (!f || f.role !== 'title') throw new ApiError(404, 'This link is not valid.');
  const { row } = f;
  if (row.status === 'scheduled' || row.status === 'cancelled') throw new ApiError(409, row.status === 'scheduled' ? 'This closing is already scheduled.' : 'This request was cancelled.');
  const dur = Math.min(480, Math.max(15, Math.round(input.durationMin) || 60));
  const slots: Slot[] = []; const seen = new Set<number>();
  for (const s of input.slots) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) continue;
    const start = wallToUtc(s.date, s.time, CLOSING_TZ);
    if (start.getTime() < Date.now() || seen.has(start.getTime())) continue;
    seen.add(start.getTime()); slots.push({ startUtc: start.toISOString(), endUtc: new Date(start.getTime() + dur * 60_000).toISOString() });
  }
  if (!slots.length) throw new ApiError(400, 'Add at least one future date and time.');
  slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  await query(`UPDATE closing_time_closing_requests SET slots=$2::jsonb, location=$3, note=$4, status='awaiting_choice', updated_at=NOW() WHERE id=$1`, [row.id, JSON.stringify(slots.slice(0, 20)), input.location.trim().slice(0, 300), input.note.trim().slice(0, 1000)]);
  const deal = await requireDeal(row.realtor_id, row.deal_id); const agent = await agentOf(row.realtor_id); const property = dealLabel(deal);
  const link = `${input.origin}/book/closing/choose/${row.chooser_token}`;
  const lines = slots.slice(0, 20).map((s) => `<li>${esc(whenText(new Date(s.startUtc)))}</li>`).join('');
  for (const c of row.choosers) {
    await sendEmail({ to: c.email, cc: validEmail(agent.email) ? agent.email : undefined, replyTo: validEmail(agent.email) ? agent.email : undefined, subject: `${property}: Choose Your Closing Time`,
      html: shell(`<p>Hello ${esc(c.name.split(/\s+/)[0] || 'there')},</p><p>${esc(row.title_name || 'The title company')} has offered these times to close on <strong>${esc(property)}</strong>:</p><ul>${lines}</ul>${button(link, 'Choose A Closing Time')}<p style="color:#51555b;font-size:13px">Only one person needs to choose. Everyone on the deal is emailed once a time is picked.</p>`) }).catch(() => undefined);
  }
  await logDealEvent(row.realtor_id, row.deal_id, 'email', `Title company offered ${slots.length} closing time${slots.length === 1 ? '' : 's'}; ${row.choosers.map((c) => c.email).join(', ')} emailed to choose`);
}

export async function chooseTime(tok: string, index: number): Promise<{ label: string }> {
  const f = await byToken(tok);
  if (!f || f.role !== 'choose') throw new ApiError(404, 'This link is not valid.');
  const { row } = f;
  if (row.status === 'scheduled') throw new ApiError(409, 'A closing time has already been chosen.');
  if (row.status !== 'awaiting_choice') throw new ApiError(409, 'This request is not open for choosing.');
  const slot = row.slots[index]; if (!slot) throw new ApiError(400, 'Choose one of the listed times.');
  const claimed = await query<{ id: string }>(`UPDATE closing_time_closing_requests SET status='scheduled', chosen_start=$2, chosen_end=$3, updated_at=NOW() WHERE id=$1 AND status='awaiting_choice' RETURNING id`, [row.id, slot.startUtc, slot.endUtc]);
  if (!claimed[0]) throw new ApiError(409, 'A closing time has already been chosen.');
  const deal = await requireDeal(row.realtor_id, row.deal_id); const agent = await agentOf(row.realtor_id); const property = dealLabel(deal);
  const start = new Date(slot.startUtc); const end = new Date(slot.endUtc); const label = whenText(start);
  const ics = Buffer.from(icsText(row.id, start, end, `Closing: ${property}`, row.location || row.title_name, `Closing for ${property}`)).toString('base64');
  const all = clean([...row.recipients, ...row.choosers, { name: row.title_name, email: row.title_email, role: 'Title And Escrow' }, { name: agent.name, email: agent.email, role: 'Agent' }]);
  for (const p of all) {
    await sendEmail({ to: p.email, replyTo: validEmail(agent.email) ? agent.email : undefined, subject: `${property}: Closing Scheduled ${label}`,
      attachments: [{ filename: 'closing.ics', content: ics, contentType: 'text/calendar' }],
      html: shell(`<p>Hello ${esc(p.name.split(/\s+/)[0] || 'there')},</p><p>The closing for <strong>${esc(property)}</strong> is scheduled.</p><p><strong>${esc(label)}</strong>${row.location ? `<br>${esc(row.location)}` : ''}${row.title_name ? `<br>${esc(row.title_name)}` : ''}</p>${row.note ? `<p>${esc(row.note)}</p>` : ''}<p style="color:#51555b;font-size:13px">The attached file adds the closing to your calendar.</p>`) }).catch(() => undefined);
  }
  await logDealEvent(row.realtor_id, row.deal_id, 'closing', `Closing scheduled for ${label}; confirmation emailed to ${all.map((p) => p.email).join(', ')}`);
  return { label };
}
