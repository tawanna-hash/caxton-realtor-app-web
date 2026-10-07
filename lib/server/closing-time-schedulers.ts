import { randomBytes, randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';
import { ApiError } from '@/lib/server/error';
import { ensureAssistSchema, requireDeal } from '@/lib/server/closing-time-assist';
import { logDealEvent } from '@/lib/server/closing-time-events';
import { CALENDAR_SLUGS } from '@/lib/server/closing-time-connected';
import { accountFor, proxyCall } from '@/lib/server/composio';
import { sendEmail } from '@/lib/email';
import { addDays, defaultConfig, fillTemplate, openSlots, slugify, timeLabel, zoned, type Busy, type SchedulerConfig } from '@/lib/scheduler-shared';

/** Agent display name and notification email (falls back to the account email). */
export async function agentOf(realtorId: string): Promise<{ name: string; email: string }> {
  const rows = await query<{ first_name: string | null; last_name: string | null; email: string }>(
    `SELECT r.first_name, r.last_name, COALESCE(NULLIF((SELECT w.workspace->'notificationPreferences'->>'notificationEmail' FROM agent_command_center_workspaces w WHERE w.realtor_id=r.id),''), r.email) AS email FROM realtors r WHERE r.id=$1 LIMIT 1`, [realtorId]);
  return { name: [rows[0]?.first_name, rows[0]?.last_name].filter(Boolean).join(' ') || 'Your agent', email: rows[0]?.email ?? '' };
}

/**
 * Closing Time Schedulers: booking pages per deal. Every deal has one custom URL slug
 * (/book/<slug>); each scheduler lives at the root or under an alias (/book/<slug>/<alias>).
 * Bookings check the agent's other bookings plus any connected Google or Outlook calendars,
 * create the event on the chosen booking calendar, and drive reminder and follow-up emails.
 */

export const RESERVED = new Set(['manage', 's', 'api', 'admin', 'all', 'closing']);

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await ensureAssistSchema();
    await query(`CREATE TABLE IF NOT EXISTS closing_time_scheduler_links (
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (realtor_id, deal_id))`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_schedulers (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      alias TEXT NOT NULL DEFAULT '', config JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      banner_type TEXT NOT NULL DEFAULT '', banner_b64 TEXT NOT NULL DEFAULT '', avatar_type TEXT NOT NULL DEFAULT '', avatar_b64 TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS closing_time_schedulers_alias_idx ON closing_time_schedulers (realtor_id, deal_id, alias)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_scheduler_combos (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      alias TEXT NOT NULL, title TEXT NOT NULL, scheduler_ids JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS closing_time_scheduler_combos_alias_idx ON closing_time_scheduler_combos (realtor_id, deal_id, alias)`);
    await query(`CREATE TABLE IF NOT EXISTS closing_time_scheduler_bookings (
      id UUID PRIMARY KEY, scheduler_id UUID NOT NULL REFERENCES closing_time_schedulers(id) ON DELETE CASCADE,
      realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE, deal_id TEXT NOT NULL,
      start_utc TIMESTAMPTZ NOT NULL, end_utc TIMESTAMPTZ NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
      answers JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'booked', token TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL DEFAULT '', event_id TEXT NOT NULL DEFAULT '', calendar_id TEXT NOT NULL DEFAULT '', meeting_url TEXT NOT NULL DEFAULT '',
      reminders_sent JSONB NOT NULL DEFAULT '[]'::jsonb, followup_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), cancelled_at TIMESTAMPTZ)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_scheduler_bookings_time_idx ON closing_time_scheduler_bookings (realtor_id, status, start_utc)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS closing_time_scheduler_bookings_slot_idx ON closing_time_scheduler_bookings (realtor_id, start_utc) WHERE status='booked'`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Schedulers that belong to the agent rather than to one deal use this reserved deal id. */
export const PERSONAL_ID = '__personal__';
async function dealOrPersonal(realtorId: string, dealId: string): Promise<{ propertyAddress: string; title: string }> {
  if (dealId === PERSONAL_ID) { const a = await agentOf(realtorId); return { propertyAddress: '', title: a.name === 'Your agent' ? '' : a.name }; }
  const d = await requireDeal(realtorId, dealId);
  return { propertyAddress: d.propertyAddress ?? '', title: d.title ?? '' };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const merge = (c: Partial<SchedulerConfig> | null | undefined): SchedulerConfig => {
  const d = defaultConfig();
  return { ...d, ...(c ?? {}), hours: { ...d.hours, ...(c?.hours ?? {}) } };
};

/* ---------- Deal URL slug ---------- */

export async function getLink(realtorId: string, dealId: string): Promise<string> {
  await ensure();
  const rows = await query<{ slug: string }>(`SELECT slug FROM closing_time_scheduler_links WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
  if (rows[0]) return rows[0].slug;
  const deal = await dealOrPersonal(realtorId, dealId);
  const base = slugify(deal.propertyAddress || deal.title || '') || `${dealId === PERSONAL_ID ? 'me' : 'deal'}${randomBytes(3).toString('hex')}`;
  for (let i = 0; i < 20; i += 1) {
    const slug = i === 0 && !RESERVED.has(base) ? base : `${base}${i + 1}`;
    const done = await query<{ slug: string }>(`INSERT INTO closing_time_scheduler_links (realtor_id, deal_id, slug) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING slug`, [realtorId, dealId, slug]);
    if (done[0]) return done[0].slug;
    const mine = await query<{ slug: string }>(`SELECT slug FROM closing_time_scheduler_links WHERE realtor_id=$1 AND deal_id=$2`, [realtorId, dealId]);
    if (mine[0]) return mine[0].slug;
  }
  throw new ApiError(409, 'Could not reserve a URL for this deal.');
}

export async function setSlug(realtorId: string, dealId: string, raw: string): Promise<string> {
  await ensure();
  await dealOrPersonal(realtorId, dealId);
  const slug = slugify(raw);
  if (slug.length < 3) throw new ApiError(400, 'Use at least 3 letters or numbers.');
  if (RESERVED.has(slug)) throw new ApiError(400, 'That URL is reserved. Pick another.');
  const taken = await query<{ realtor_id: string; deal_id: string }>(`SELECT realtor_id, deal_id FROM closing_time_scheduler_links WHERE slug=$1`, [slug]);
  if (taken[0] && (taken[0].realtor_id !== realtorId || taken[0].deal_id !== dealId)) throw new ApiError(409, 'That URL is taken. Pick another.');
  await query(`INSERT INTO closing_time_scheduler_links (realtor_id, deal_id, slug) VALUES ($1,$2,$3) ON CONFLICT (realtor_id, deal_id) DO UPDATE SET slug=EXCLUDED.slug`, [realtorId, dealId, slug]);
  return slug;
}

/* ---------- Connected calendars ---------- */

export type CalendarChoice = { id: string; name: string; primary?: boolean };
export async function calendarsFor(realtorId: string): Promise<{ account: { provider: string; name: string } | null; calendars: CalendarChoice[] }> {
  const acct = await accountFor(realtorId, CALENDAR_SLUGS);
  if (!acct) return { account: null, calendars: [] };
  const google = acct.appSlug === 'google_calendar';
  try {
    if (google) {
      const r = await proxyCall(realtorId, acct.id, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100', { method: 'GET' });
      const items = ((r.data as { items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean }[] })?.items ?? []);
      return { account: { provider: acct.appSlug, name: acct.appName }, calendars: items.map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: Boolean(c.primary) })) };
    }
    const r = await proxyCall(realtorId, acct.id, 'https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar&$top=100', { method: 'GET' });
    const items = ((r.data as { value?: { id: string; name?: string; isDefaultCalendar?: boolean }[] })?.value ?? []);
    return { account: { provider: acct.appSlug, name: acct.appName }, calendars: items.map((c) => ({ id: c.id, name: c.name || 'Calendar', primary: Boolean(c.isDefaultCalendar) })) };
  } catch {
    return { account: { provider: acct.appSlug, name: acct.appName }, calendars: [] };
  }
}

async function externalBusy(realtorId: string, ids: string[], from: Date, to: Date): Promise<Busy[]> {
  const cal = ids.filter((id) => id && id !== 'closing_time');
  if (!cal.length) return [];
  const acct = await accountFor(realtorId, CALENDAR_SLUGS);
  if (!acct) return [];
  const out: Busy[] = [];
  try {
    if (acct.appSlug === 'google_calendar') {
      const r = await proxyCall(realtorId, acct.id, 'https://www.googleapis.com/calendar/v3/freeBusy', { json: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: cal.map((id) => ({ id })) } });
      const cals = (r.data as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> })?.calendars ?? {};
      for (const c of Object.values(cals)) for (const b of c.busy ?? []) out.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
    } else {
      for (const id of cal) {
        const r = await proxyCall(realtorId, acct.id, `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(id)}/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end,showAs&$top=500`, { method: 'GET', headers: { Prefer: 'outlook.timezone="UTC"' } });
        for (const e of ((r.data as { value?: { start: { dateTime: string }; end: { dateTime: string }; showAs?: string }[] })?.value ?? [])) {
          if (e.showAs === 'free') continue;
          out.push({ start: Date.parse(`${e.start.dateTime.replace(/Z?$/, '')}Z`), end: Date.parse(`${e.end.dateTime.replace(/Z?$/, '')}Z`) });
        }
      }
    }
  } catch { /* a calendar outage must not block booking pages */ }
  return out;
}

/* ---------- Agent side ---------- */

export type SchedulerRow = { id: string; alias: string; active: boolean; config: SchedulerConfig; hasBanner: boolean; hasAvatar: boolean; createdAt: string; upcoming: number };
export type BookingRow = { id: string; schedulerId: string; schedulerName: string; start: string; end: string; name: string; email: string; answers: { label: string; value: string }[]; status: string; meetingUrl: string; timezone: string; timeFormat: '12h' | '24h'; past: boolean };
export type ComboRow = { id: string; alias: string; title: string; schedulerIds: string[] };

export async function listSchedulers(realtorId: string, dealId: string) {
  await ensure();
  const slug = await getLink(realtorId, dealId);
  const [rows, combos, bookings] = await Promise.all([
    query<{ id: string; alias: string; active: boolean; config: SchedulerConfig; has_banner: boolean; has_avatar: boolean; created_at: Date | string; upcoming: number }>(
      `SELECT s.id, s.alias, s.active, s.config, s.banner_b64<>'' AS has_banner, s.avatar_b64<>'' AS has_avatar, s.created_at,
        (SELECT COUNT(*)::int FROM closing_time_scheduler_bookings b WHERE b.scheduler_id=s.id AND b.status='booked' AND b.start_utc>NOW()) AS upcoming
       FROM closing_time_schedulers s WHERE s.realtor_id=$1 AND s.deal_id=$2 ORDER BY s.created_at`, [realtorId, dealId]),
    query<{ id: string; alias: string; title: string; scheduler_ids: string[] }>(`SELECT id, alias, title, scheduler_ids FROM closing_time_scheduler_combos WHERE realtor_id=$1 AND deal_id=$2 ORDER BY created_at`, [realtorId, dealId]),
    query<{ id: string; scheduler_id: string; config: SchedulerConfig; start_utc: Date | string; end_utc: Date | string; name: string; email: string; answers: { label: string; value: string }[]; status: string; meeting_url: string }>(
      `SELECT b.id, b.scheduler_id, s.config, b.start_utc, b.end_utc, b.name, b.email, b.answers, b.status, b.meeting_url FROM closing_time_scheduler_bookings b JOIN closing_time_schedulers s ON s.id=b.scheduler_id
       WHERE b.realtor_id=$1 AND b.deal_id=$2 AND b.start_utc > NOW() - INTERVAL '30 days' ORDER BY b.start_utc LIMIT 100`, [realtorId, dealId]),
  ]);
  return {
    slug,
    schedulers: rows.map((r): SchedulerRow => ({ id: r.id, alias: r.alias, active: r.active, config: merge(r.config), hasBanner: r.has_banner, hasAvatar: r.has_avatar, createdAt: new Date(r.created_at).toISOString(), upcoming: r.upcoming })),
    combos: combos.map((c): ComboRow => ({ id: c.id, alias: c.alias, title: c.title, schedulerIds: c.scheduler_ids ?? [] })),
    bookings: bookings.map((b): BookingRow => ({ id: b.id, schedulerId: b.scheduler_id, schedulerName: merge(b.config).name, start: new Date(b.start_utc).toISOString(), end: new Date(b.end_utc).toISOString(), name: b.name, email: b.email, answers: b.answers ?? [], status: b.status, meetingUrl: b.meeting_url, timezone: merge(b.config).timezone, timeFormat: merge(b.config).timeFormat, past: new Date(b.start_utc).getTime() < Date.now() })),
  };
}

async function aliasTaken(realtorId: string, dealId: string, alias: string, exceptId: string | null): Promise<boolean> {
  const a = await query<{ id: string }>(`SELECT id FROM closing_time_schedulers WHERE realtor_id=$1 AND deal_id=$2 AND alias=$3`, [realtorId, dealId, alias]);
  const c = await query<{ id: string }>(`SELECT id FROM closing_time_scheduler_combos WHERE realtor_id=$1 AND deal_id=$2 AND alias=$3`, [realtorId, dealId, alias]);
  return a.some((r) => r.id !== exceptId) || c.some((r) => r.id !== exceptId);
}

export async function saveScheduler(realtorId: string, dealId: string, id: string | null, cfg: SchedulerConfig): Promise<string> {
  await ensure();
  await dealOrPersonal(realtorId, dealId);
  const alias = cfg.urlMode === 'root' ? '' : cfg.alias;
  if (cfg.urlMode === 'alias' && !alias) throw new ApiError(400, 'Pick an alias for this scheduler.');
  if (RESERVED.has(alias)) throw new ApiError(400, 'That alias is reserved. Pick another.');
  if (await aliasTaken(realtorId, dealId, alias, id)) throw new ApiError(409, alias ? 'Another scheduler already uses that alias.' : 'Another scheduler already uses the root URL. You can only use the root for one scheduler.');
  const config = { ...cfg, alias };
  if (id) {
    const r = await query<{ id: string }>(`UPDATE closing_time_schedulers SET alias=$4, config=$5::jsonb, updated_at=NOW() WHERE id=$1 AND realtor_id=$2 AND deal_id=$3 RETURNING id`, [id, realtorId, dealId, alias, JSON.stringify(config)]);
    if (!r[0]) throw new ApiError(404, 'Scheduler not found.');
    await logDealEvent(realtorId, dealId, 'scheduler', `Scheduler updated: ${cfg.name}`);
    return id;
  }
  const newId = randomUUID();
  await query(`INSERT INTO closing_time_schedulers (id, realtor_id, deal_id, alias, config) VALUES ($1,$2,$3,$4,$5::jsonb)`, [newId, realtorId, dealId, alias, JSON.stringify(config)]);
  await logDealEvent(realtorId, dealId, 'scheduler', `Scheduler created: ${cfg.name}`);
  return newId;
}

export async function setImage(realtorId: string, id: string, kind: 'banner' | 'avatar', file: { type: string; bytes: Buffer } | null): Promise<void> {
  await ensure();
  const col = kind === 'banner' ? 'banner' : 'avatar';
  const r = await query<{ config: SchedulerConfig }>(`UPDATE closing_time_schedulers SET ${col}_type=$3, ${col}_b64=$4, updated_at=NOW() WHERE id=$1 AND realtor_id=$2 RETURNING config`,
    [id, realtorId, file?.type ?? '', file ? file.bytes.toString('base64') : '']);
  if (!r[0]) throw new ApiError(404, 'Scheduler not found.');
  const cfg = merge(r[0].config);
  await query(`UPDATE closing_time_schedulers SET config=$3::jsonb WHERE id=$1 AND realtor_id=$2`, [id, realtorId, JSON.stringify({ ...cfg, [kind === 'banner' ? 'hasBanner' : 'hasAvatar']: Boolean(file) })]);
}

export async function getImage(id: string, kind: 'banner' | 'avatar'): Promise<{ type: string; bytes: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensure();
  const r = await query<{ t: string; b: string }>(`SELECT ${kind}_type AS t, ${kind}_b64 AS b FROM closing_time_schedulers WHERE id=$1`, [id]);
  return r[0]?.b ? { type: r[0].t || 'image/png', bytes: Buffer.from(r[0].b, 'base64') } : null;
}

export async function setActive(realtorId: string, id: string, active: boolean) {
  await ensure();
  await query(`UPDATE closing_time_schedulers SET active=$3, updated_at=NOW() WHERE id=$1 AND realtor_id=$2`, [id, realtorId, active]);
}

export async function deleteScheduler(realtorId: string, id: string) {
  await ensure();
  const r = await query<{ deal_id: string; config: SchedulerConfig }>(`DELETE FROM closing_time_schedulers WHERE id=$1 AND realtor_id=$2 RETURNING deal_id, config`, [id, realtorId]);
  if (r[0]) await logDealEvent(realtorId, r[0].deal_id, 'scheduler', `Scheduler deleted: ${merge(r[0].config).name}`);
}

export async function saveCombo(realtorId: string, dealId: string, input: { id?: string; title: string; alias: string; schedulerIds: string[] }): Promise<void> {
  await ensure();
  await dealOrPersonal(realtorId, dealId);
  if (!input.alias || RESERVED.has(input.alias)) throw new ApiError(400, 'Pick an alias for the combined link.');
  if (await aliasTaken(realtorId, dealId, input.alias, input.id ?? null)) throw new ApiError(409, 'That alias is already used on this deal.');
  const mine = await query<{ id: string }>(`SELECT id FROM closing_time_schedulers WHERE realtor_id=$1 AND deal_id=$2 AND id = ANY($3::uuid[])`, [realtorId, dealId, input.schedulerIds]);
  if (mine.length < 2) throw new ApiError(400, 'Choose at least two schedulers.');
  const ids = input.schedulerIds.filter((s) => mine.some((m) => m.id === s));
  if (input.id) await query(`UPDATE closing_time_scheduler_combos SET title=$4, alias=$5, scheduler_ids=$6::jsonb WHERE id=$1 AND realtor_id=$2 AND deal_id=$3`, [input.id, realtorId, dealId, input.title, input.alias, JSON.stringify(ids)]);
  else await query(`INSERT INTO closing_time_scheduler_combos (id, realtor_id, deal_id, alias, title, scheduler_ids) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [randomUUID(), realtorId, dealId, input.alias, input.title, JSON.stringify(ids)]);
}

export async function deleteCombo(realtorId: string, id: string) {
  await ensure();
  await query(`DELETE FROM closing_time_scheduler_combos WHERE id=$1 AND realtor_id=$2`, [id, realtorId]);
}

/* ---------- Public side ---------- */

export type PublicScheduler = {
  id: string; config: SchedulerConfig; agentName: string; agentEmail: string; property: string; slug: string;
};
type SchedRow = { id: string; realtor_id: string; deal_id: string; alias: string; active: boolean; config: SchedulerConfig };

async function schedulerById(id: string): Promise<SchedRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensure();
  const r = await query<SchedRow>(`SELECT id, realtor_id, deal_id, alias, active, config FROM closing_time_schedulers WHERE id=$1`, [id]);
  return r[0] ?? null;
}

async function toPublic(s: SchedRow, slug: string): Promise<PublicScheduler> {
  const agent = await agentOf(s.realtor_id);
  const deal = await dealOrPersonal(s.realtor_id, s.deal_id).catch(() => null);
  const cfg = merge(s.config);
  // Only booking-page fields leave the server: calendar ids and workflow text stay private.
  const safe: SchedulerConfig = { ...cfg, bookingCalendar: '', bookingCalendarName: '', additionalCalendars: [], attendees: '', reminders: [], followUp: null, description: '', subject: '' };
  return { id: s.id, config: safe, agentName: cfg.yourName, agentEmail: agent.email, property: deal?.propertyAddress || deal?.title || '', slug };
}

export type Resolved =
  | { kind: 'scheduler'; scheduler: PublicScheduler }
  | { kind: 'list'; title: string; slug: string; items: { href: string; name: string; lengths: number[]; welcome: string }[]; agentName: string }
  | { kind: 'none' };

/** Resolves /book/<slug> and /book/<slug>/<alias>. */
export async function resolveBooking(slug: string, alias: string): Promise<Resolved | null> {
  await ensure();
  const link = await query<{ realtor_id: string; deal_id: string; slug: string }>(`SELECT realtor_id, deal_id, slug FROM closing_time_scheduler_links WHERE slug=$1`, [slugify(slug)]);
  if (!link[0]) return null;
  const { realtor_id, deal_id } = link[0];
  const all = await query<SchedRow>(`SELECT id, realtor_id, deal_id, alias, active, config FROM closing_time_schedulers WHERE realtor_id=$1 AND deal_id=$2 AND active=TRUE ORDER BY created_at`, [realtor_id, deal_id]);
  const href = (s: SchedRow) => `/book/${link[0].slug}${s.alias ? `/${s.alias}` : ''}`;
  const list = (title: string, items: SchedRow[]): Resolved => ({ kind: 'list', title, slug: link[0].slug, agentName: merge(items[0]?.config).yourName, items: items.map((s) => ({ href: href(s), name: merge(s.config).name, lengths: merge(s.config).lengths, welcome: merge(s.config).welcome })) });
  const hit = all.find((s) => s.alias === alias);
  if (hit) return { kind: 'scheduler', scheduler: await toPublic(hit, link[0].slug) };
  if (alias === 'all') return all.length ? list('All Meeting Types', all) : { kind: 'none' };
  if (alias) {
    const combo = await query<{ title: string; scheduler_ids: string[] }>(`SELECT title, scheduler_ids FROM closing_time_scheduler_combos WHERE realtor_id=$1 AND deal_id=$2 AND alias=$3`, [realtor_id, deal_id, alias]);
    if (!combo[0]) return null;
    return list(combo[0].title, (combo[0].scheduler_ids ?? []).map((id) => all.find((s) => s.id === id)).filter((s): s is SchedRow => Boolean(s)));
  }
  if (!all.length) return { kind: 'none' };
  return all.length === 1 ? { kind: 'scheduler', scheduler: await toPublic(all[0], link[0].slug) } : list('', all);
}

async function busyFor(s: SchedRow, from: Date, to: Date): Promise<Busy[]> {
  const cfg = merge(s.config);
  const own = await query<{ start_utc: Date | string; end_utc: Date | string }>(`SELECT start_utc, end_utc FROM closing_time_scheduler_bookings WHERE realtor_id=$1 AND status='booked' AND end_utc > $2 AND start_utc < $3`, [s.realtor_id, from.toISOString(), to.toISOString()]);
  const ext = await externalBusy(s.realtor_id, [cfg.bookingCalendar, ...cfg.additionalCalendars.map((c) => c.id)], from, to);
  return [...own.map((b) => ({ start: new Date(b.start_utc).getTime(), end: new Date(b.end_utc).getTime() })), ...ext];
}

/** Open times for one month (YYYY-MM) at a meeting length, keyed by date in the scheduler's time zone. */
export async function publicSlots(id: string, length: number, month: string): Promise<Record<string, { start: number; time: string }[]> | null> {
  const s = await schedulerById(id);
  if (!s || !s.active) return null;
  const cfg = merge(s.config);
  const len = cfg.lengths.includes(length) ? length : cfg.defaultLength;
  const from = `${month}-01`;
  const to = addDays(addDays(from, 31).slice(0, 7) + '-01', -1);
  const busy = await busyFor(s, new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000), new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000));
  return openSlots(cfg, len, from, to, busy);
}

function bookingIcsText(b: { id: string; start: Date; end: Date; title: string; location: string; description: string; cancelled?: boolean }): string {
  const stamp = (d: Date) => d.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const e = (v: string) => v.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Realty News Now//Closing Time Scheduler//EN', `METHOD:${b.cancelled ? 'CANCEL' : 'PUBLISH'}`, 'BEGIN:VEVENT',
    `UID:booking-${b.id}@realtynewsnow.app`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(b.start)}`, `DTEND:${stamp(b.end)}`, `SUMMARY:${e(b.title)}`,
    ...(b.location ? [`LOCATION:${e(b.location)}`] : []), ...(b.description ? [`DESCRIPTION:${e(b.description)}`] : []), ...(b.cancelled ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

const whenText = (at: Date, cfg: SchedulerConfig) => {
  const z = zoned(at, cfg.timezone);
  const day = new Date(`${z.date}T12:00:00Z`).toLocaleDateString(cfg.language === 'es' ? 'es-US' : 'en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return `${day}, ${timeLabel(z.time, cfg.timeFormat)} (${cfg.timezone})`;
};

export async function createBooking(id: string, input: { start: number; length: number; name: string; email: string; answers: Record<string, string>; origin: string }): Promise<{ ok: true; token: string; redirectUrl: string; meetingUrl: string } | { ok: false; error: string }> {
  const s = await schedulerById(id);
  if (!s || !s.active) return { ok: false, error: 'This booking page is not available.' };
  const cfg = merge(s.config);
  const len = cfg.lengths.includes(input.length) ? input.length : cfg.defaultLength;
  for (const q of cfg.questions) if (q.required && !(input.answers[q.id] ?? '').trim()) return { ok: false, error: `${q.label} is required.` };
  const z = zoned(new Date(input.start), cfg.timezone);
  const open = await publicSlots(id, len, z.date.slice(0, 7));
  if (!open?.[z.date]?.some((x) => x.start === input.start)) return { ok: false, error: 'That time was just taken. Please pick another.' };
  const start = new Date(input.start), end = new Date(input.start + len * 60_000);
  const agent = await agentOf(s.realtor_id);
  const deal = await dealOrPersonal(s.realtor_id, s.deal_id).catch(() => null);
  const property = deal?.propertyAddress || deal?.title || '';
  const title = fillTemplate(cfg.subject || '{invitee_name} and {my_name} - {subject}', { invitee_name: input.name, invitee_email: input.email, my_name: cfg.yourName || agent.name, subject: cfg.name });
  const answers = cfg.questions.map((q) => ({ label: q.label, value: (input.answers[q.id] ?? '').trim().slice(0, 1000) })).filter((a) => a.value);
  const guests = cfg.attendees.split(/[\s,;]+/).map((x) => x.trim()).filter(validEmail);
  const description = [cfg.description, property && `Property: ${property}`, ...answers.map((a) => `${a.label}: ${a.value}`), `Booked by ${input.name} <${input.email}>`].filter(Boolean).join('\n');
  const bookingId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  // Reminders whose send time has already passed (a last-minute booking) are skipped.
  const skipped = cfg.reminders.map((r, i) => (start.getTime() - offsetMs(r) <= Date.now() ? i : -1)).filter((i) => i >= 0);
  try {
    await query(`INSERT INTO closing_time_scheduler_bookings (id, scheduler_id, realtor_id, deal_id, start_utc, end_utc, name, email, answers, token, reminders_sent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)`,
      [bookingId, s.id, s.realtor_id, s.deal_id, start.toISOString(), end.toISOString(), input.name.slice(0, 200), input.email.slice(0, 320), JSON.stringify(answers), token, JSON.stringify(skipped)]);
  } catch { return { ok: false, error: 'That time was just taken. Please pick another.' }; }

  let meetingUrl = cfg.meeting === 'custom' ? cfg.meetingLink : '';
  if (cfg.bookingCalendar && cfg.bookingCalendar !== 'closing_time') {
    try {
      const acct = await accountFor(s.realtor_id, CALENDAR_SLUGS);
      if (acct?.appSlug === 'google_calendar') {
        const body: Record<string, unknown> = { summary: title, description: meetingUrl ? `${description}\n\nJoin: ${meetingUrl}` : description, location: meetingUrl || property || undefined,
          start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, attendees: [{ email: input.email, displayName: input.name }, ...guests.map((g) => ({ email: g }))], ...(cfg.color ? { colorId: cfg.color } : {}) };
        if (cfg.meeting === 'google_meet') body.conferenceData = { createRequest: { requestId: bookingId, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
        const r = await proxyCall(s.realtor_id, acct.id, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.bookingCalendar)}/events?conferenceDataVersion=1&sendUpdates=none`, { json: body });
        const d = r.data as { id?: string; hangoutLink?: string } | null;
        if (r.ok && d?.id) { meetingUrl = d.hangoutLink || meetingUrl; await query(`UPDATE closing_time_scheduler_bookings SET provider='google_calendar', event_id=$2, calendar_id=$3, meeting_url=$4 WHERE id=$1`, [bookingId, d.id, cfg.bookingCalendar, meetingUrl]); }
      } else if (acct?.appSlug === 'outlook') {
        const body = { subject: title, body: { contentType: 'Text', content: meetingUrl ? `${description}\n\nJoin: ${meetingUrl}` : description }, location: { displayName: meetingUrl || property },
          start: { dateTime: start.toISOString().replace('Z', ''), timeZone: 'UTC' }, end: { dateTime: end.toISOString().replace('Z', ''), timeZone: 'UTC' },
          attendees: [{ emailAddress: { address: input.email, name: input.name }, type: 'required' }, ...guests.map((g) => ({ emailAddress: { address: g }, type: 'optional' }))],
          ...(cfg.meeting === 'teams' ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}) };
        const r = await proxyCall(s.realtor_id, acct.id, `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(cfg.bookingCalendar)}/events`, { json: body });
        const d = r.data as { id?: string; onlineMeeting?: { joinUrl?: string } } | null;
        if (r.ok && d?.id) { meetingUrl = d.onlineMeeting?.joinUrl || meetingUrl; await query(`UPDATE closing_time_scheduler_bookings SET provider='outlook', event_id=$2, calendar_id=$3, meeting_url=$4 WHERE id=$1`, [bookingId, d.id, cfg.bookingCalendar, meetingUrl]); }
      }
    } catch { /* the booking stands; the agent is emailed below either way */ }
  } else if (meetingUrl) {
    await query(`UPDATE closing_time_scheduler_bookings SET meeting_url=$2 WHERE id=$1`, [bookingId, meetingUrl]);
  }

  // The booker is usually a subscriber: use the name and brokerage affiliation on their profile.
  const sub = await query<{ first_name: string | null; last_name: string | null; brokerage_name: string | null }>(`SELECT first_name, last_name, brokerage_name FROM realtors WHERE LOWER(email)=LOWER($1) LIMIT 1`, [input.email]).catch(() => []);
  const subName = [sub[0]?.first_name, sub[0]?.last_name].filter(Boolean).join(' ').trim();
  const who = `${subName || input.name}${sub[0]?.brokerage_name?.trim() ? ` of ${sub[0].brokerage_name.trim()}` : ''}`;
  const when = whenText(start, cfg);
  const ics = Buffer.from(bookingIcsText({ id: bookingId, start, end, title, location: meetingUrl || property, description })).toString('base64');
  const manage = `${input.origin}/book/manage/${token}`;
  const es = cfg.language === 'es';
  await sendEmail({ to: input.email, cc: guests.length ? guests : undefined, replyTo: agent.email || undefined, subject: `${es ? 'Confirmado' : 'Confirmed'}: ${cfg.name} - ${when}`,
    attachments: [{ filename: 'invite.ics', content: ics, contentType: 'text/calendar' }],
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px"><p>${es ? 'Hola' : 'Hello'} ${esc((sub[0]?.first_name?.trim() || input.name.split(/\s+/)[0]))},</p>`
      + `<p>${es ? 'Su cita está confirmada' : 'You are booked'}: <strong>${esc(cfg.name)}</strong> ${es ? 'con' : 'with'} ${esc(cfg.yourName || agent.name)}.</p><p><strong>${esc(when)}</strong> · ${len} min</p><p>${es ? 'Reservado por' : 'Booked by'} ${esc(who)}</p>`
      + (meetingUrl ? `<p><a href="${esc(meetingUrl)}">${esc(meetingUrl)}</a></p>` : property ? `<p>${esc(property)}</p>` : '')
      + `<p style="color:#51555b;font-size:13px">${es ? 'El archivo adjunto agrega la cita a su calendario.' : 'The attached file adds this to your calendar.'} <a href="${manage}">${es ? 'Cancelar esta cita' : 'Cancel this booking'}</a></p></div>` }).catch(() => undefined);
  if (validEmail(agent.email)) {
    await sendEmail({ to: agent.email, replyTo: input.email, subject: `New booking: Meet With ${who}`,
      attachments: cfg.bookingCalendar === 'closing_time' || !cfg.bookingCalendar ? [{ filename: 'booking.ics', content: ics, contentType: 'text/calendar' }] : undefined,
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px"><p><strong>${esc(who)}</strong> (${esc(input.email)}) booked <strong>${esc(cfg.name)}</strong>${property ? ` for ${esc(property)}` : ''}.</p><p><strong>${esc(when)}</strong> · ${len} min</p>${answers.map((a) => `<p style="margin:2px 0"><strong>${esc(a.label)}:</strong> ${esc(a.value)}</p>`).join('')}${meetingUrl ? `<p>${esc(meetingUrl)}</p>` : ''}</div>` }).catch(() => undefined);
  }
  await logDealEvent(s.realtor_id, s.deal_id, 'booking', `${input.name} <${input.email}> booked ${cfg.name} for ${when}`);
  return { ok: true, token, redirectUrl: /^https:\/\//.test(cfg.redirectUrl) ? cfg.redirectUrl : '', meetingUrl };
}

type BookingFull = { id: string; scheduler_id: string; realtor_id: string; deal_id: string; start_utc: Date | string; end_utc: Date | string; name: string; email: string; status: string; provider: string; event_id: string; calendar_id: string; meeting_url: string; config: SchedulerConfig; slug: string | null };
async function bookingByToken(token: string): Promise<BookingFull | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  await ensure();
  const r = await query<BookingFull>(`SELECT b.id, b.scheduler_id, b.realtor_id, b.deal_id, b.start_utc, b.end_utc, b.name, b.email, b.status, b.provider, b.event_id, b.calendar_id, b.meeting_url, s.config,
    (SELECT l.slug FROM closing_time_scheduler_links l WHERE l.realtor_id=b.realtor_id AND l.deal_id=b.deal_id) AS slug
    FROM closing_time_scheduler_bookings b JOIN closing_time_schedulers s ON s.id=b.scheduler_id WHERE b.token=$1`, [token]);
  return r[0] ?? null;
}

export async function publicBooking(token: string) {
  const b = await bookingByToken(token);
  if (!b) return null;
  const cfg = merge(b.config);
  return { name: b.name, email: b.email, status: b.status, when: whenText(new Date(b.start_utc), cfg), lengthMin: Math.round((new Date(b.end_utc).getTime() - new Date(b.start_utc).getTime()) / 60_000),
    schedulerName: cfg.name, agentName: cfg.yourName, meetingUrl: b.meeting_url, language: cfg.language, past: new Date(b.start_utc).getTime() < Date.now(),
    rebook: b.slug ? `/book/${b.slug}${cfg.alias && cfg.urlMode === 'alias' ? `/${cfg.alias}` : ''}` : '' };
}

async function cancelRow(b: BookingFull, by: 'invitee' | 'agent') {
  await query(`UPDATE closing_time_scheduler_bookings SET status='cancelled', cancelled_at=NOW() WHERE id=$1 AND status='booked'`, [b.id]);
  if (b.event_id) {
    try {
      const acct = await accountFor(b.realtor_id, CALENDAR_SLUGS);
      if (acct?.appSlug === b.provider) {
        const url = b.provider === 'google_calendar'
          ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(b.calendar_id)}/events/${encodeURIComponent(b.event_id)}?sendUpdates=none`
          : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(b.event_id)}`;
        await proxyCall(b.realtor_id, acct.id, url, { method: 'DELETE' });
      }
    } catch { /* ignore */ }
  }
  const cfg = merge(b.config);
  const when = whenText(new Date(b.start_utc), cfg);
  const agent = await agentOf(b.realtor_id);
  const to = by === 'invitee' ? agent.email : b.email;
  if (validEmail(to)) await sendEmail({ to, replyTo: by === 'invitee' ? b.email : agent.email || undefined, subject: `Cancelled: ${cfg.name} - ${when}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px"><p>${by === 'invitee' ? `${esc(b.name)} cancelled` : `${esc(cfg.yourName || agent.name)} cancelled`} <strong>${esc(cfg.name)}</strong> on ${esc(when)}.</p></div>` }).catch(() => undefined);
  await logDealEvent(b.realtor_id, b.deal_id, 'booking', `Booking cancelled by ${by === 'invitee' ? b.name : 'agent'}: ${cfg.name} on ${when}`);
}

export async function cancelByToken(token: string): Promise<boolean> {
  const b = await bookingByToken(token);
  if (!b || b.status !== 'booked') return false;
  await cancelRow(b, 'invitee');
  return true;
}

export async function cancelByAgent(realtorId: string, bookingId: string): Promise<void> {
  await ensure();
  const r = await query<{ token: string }>(`SELECT token FROM closing_time_scheduler_bookings WHERE id=$1 AND realtor_id=$2 AND status='booked'`, [bookingId, realtorId]);
  if (!r[0]) throw new ApiError(404, 'Booking not found.');
  const b = await bookingByToken(r[0].token);
  if (b) await cancelRow(b, 'agent');
}

export async function bookingIcs(token: string): Promise<string | null> {
  const b = await bookingByToken(token);
  if (!b) return null;
  const cfg = merge(b.config);
  return bookingIcsText({ id: b.id, start: new Date(b.start_utc), end: new Date(b.end_utc), title: `${cfg.name}${cfg.yourName ? ` with ${cfg.yourName}` : ''}`, location: b.meeting_url, description: '', cancelled: b.status !== 'booked' });
}

/* ---------- Workflow: reminder and follow-up emails ---------- */

const offsetMs = (r: { amount: number; unit: 'minutes' | 'hours' | 'days' }) => r.amount * (r.unit === 'days' ? 86_400_000 : r.unit === 'hours' ? 3_600_000 : 60_000);

export async function runSchedulerWorkflows(now = Date.now()): Promise<{ reminders: number; followUps: number }> {
  await ensure();
  const rows = await query<{ id: string; token: string; realtor_id: string; deal_id: string; start_utc: Date | string; end_utc: Date | string; name: string; email: string; meeting_url: string; reminders_sent: number[]; followup_sent: boolean; config: SchedulerConfig }>(
    `SELECT b.id, b.token, b.realtor_id, b.deal_id, b.start_utc, b.end_utc, b.name, b.email, b.meeting_url, b.reminders_sent, b.followup_sent, s.config
     FROM closing_time_scheduler_bookings b JOIN closing_time_schedulers s ON s.id=b.scheduler_id
     WHERE b.status='booked' AND b.start_utc < NOW() + INTERVAL '8 days' AND b.end_utc > NOW() - INTERVAL '8 days' LIMIT 500`);
  const out = { reminders: 0, followUps: 0 };
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://realtynewsnow.app';
  for (const b of rows) {
    const cfg = merge(b.config);
    const start = new Date(b.start_utc).getTime(), end = new Date(b.end_utc).getTime();
    const vars = { invitee_name: b.name, invitee_email: b.email, my_name: cfg.yourName, subject: cfg.name };
    const when = whenText(new Date(start), cfg);
    const agent = await agentOf(b.realtor_id);
    const sent = new Set(b.reminders_sent ?? []);
    for (const [i, r] of cfg.reminders.slice(0, 2).entries()) {
      if (sent.has(i) || now < start - offsetMs(r) || now >= start) continue;
      sent.add(i);
      await query(`UPDATE closing_time_scheduler_bookings SET reminders_sent=$2::jsonb WHERE id=$1`, [b.id, JSON.stringify([...sent])]);
      const ok = await sendEmail({ to: b.email, replyTo: agent.email || undefined, subject: fillTemplate(r.subject || 'Reminder: {subject} with {my_name}', vars),
        html: `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px"><p>${esc(fillTemplate(r.message || 'This is a reminder of your upcoming meeting.', vars)).replace(/\n/g, '<br>')}</p><p><strong>${esc(cfg.name)}</strong> · ${esc(when)}</p>${b.meeting_url ? `<p><a href="${esc(b.meeting_url)}">${esc(b.meeting_url)}</a></p>` : ''}<p style="color:#51555b;font-size:13px"><a href="${base}/book/manage/${b.token}">Cancel this booking</a></p></div>` }).catch(() => ({ ok: false }));
      if ((ok as { ok?: boolean }).ok !== false) { out.reminders += 1; await logDealEvent(b.realtor_id, b.deal_id, 'email', `Booking reminder emailed to ${b.name} <${b.email}>: ${cfg.name} on ${when}`); }
    }
    const f = cfg.followUp;
    if (f && !b.followup_sent && now >= end + offsetMs(f) && now < end + offsetMs(f) + 86_400_000) {
      await query(`UPDATE closing_time_scheduler_bookings SET followup_sent=TRUE WHERE id=$1`, [b.id]);
      const ok = await sendEmail({ to: b.email, replyTo: agent.email || undefined, subject: fillTemplate(f.subject || 'Thank you for meeting with {my_name}', vars),
        html: `<div style="font-family:Inter,Arial,sans-serif;color:#292a2d;line-height:1.55;max-width:560px"><p>${esc(fillTemplate(f.message || 'Thank you for your time. Reply to this email with any questions.', vars)).replace(/\n/g, '<br>')}</p></div>` }).catch(() => ({ ok: false }));
      if ((ok as { ok?: boolean }).ok !== false) { out.followUps += 1; await logDealEvent(b.realtor_id, b.deal_id, 'email', `Booking follow-up emailed to ${b.name} <${b.email}>: ${cfg.name}`); }
    }
  }
  return out;
}
