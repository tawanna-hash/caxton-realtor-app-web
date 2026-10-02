// MetroTex Association of REALTORS® (Dallas/Ft. Worth) calendar importer.
//
// Source: Tangilla public event feed for association 7985 (MetroTex).
//   https://api.tangilla.com/event/v1/feed/7985/live
// This is the embeddable JSON feed that powers MetroTex's public calendar
// widget (e.g. https://v0-wordpress-calendar-integration.vercel.app). One GET
// returns every upcoming class and event (~170 rows) with dates, location,
// pricing, CE credits, instructor, and a registration link.
//
// Rows are upserted into the events table with publication = 'dallas' and
// external_source = 'metrotex' (external_id = Tangilla event_id), so admin
// edits survive re-runs via the per-field merge in upsertEvents().

import type { EventInput } from './events-store';

const FEED_URL = 'https://api.tangilla.com/event/v1/feed/7985/live';
const SOURCE = 'metrotex' as const;
const PUBLICATION = 'dallas' as const;
const FETCH_TIMEOUT_MS = 30_000;
// Calendar titles read "MetroTex: <event title>".
const TITLE_PREFIX = 'MetroTex: ';

export interface TangillaEvent {
  event_id: string;
  event_type: string | null; // 'class' | 'event'
  event_title: string | null;
  event_description: string | null;
  ce: boolean | null;
  ce_credits: number | null;
  ce_type_name: string | null;
  secondary_ce_credits: number | null;
  secondary_ce_type_name: string | null;
  member_price: number | null;
  price: number | null;
  time_zone: string | null;
  event_date: string | null; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  instructor_name: string | null;
  instructor2_name: string | null;
  instructor_bio: string | null;
  course_number: string | null;
  provider_name: string | null;
  location: string | null;
  location_address: string | null;
  location_type: string | null; // 'physical' | 'virtual'
  room: string | null;
  member_only: boolean | null;
  registration_link: string | null;
  tags: unknown;
  course_image: string | null;
  instructor_image: string | null;
}

/** UTC offset ("-05:00" / "-06:00") for America/Chicago at a wall-clock time. */
function centralOffset(y: number, mo: number, d: number, h: number, mi: number): string {
  // Guess CST, then check what Chicago wall time that instant maps to.
  for (const off of [-5, -6]) {
    const utc = Date.UTC(y, mo - 1, d, h - off, mi);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(utc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    if (get('day') === d && (get('hour') % 24) === h && get('minute') === mi) {
      return off === -5 ? '-05:00' : '-06:00';
    }
  }
  return '-06:00';
}

export function centralIso(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dm) return null;
  const tm = /^(\d{2}):(\d{2})/.exec(time ?? '') ?? [null, '00', '00'];
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  return `${dm[1]}-${dm[2]}-${dm[3]}T${tm[1]}:${tm[2]}:00${centralOffset(y, mo, d, h, mi)}`;
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/\u00a0|\ufeff/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clean(v: string | null | undefined): string | null {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

function money(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return n === 0 ? 'Free' : `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

function ceLine(ev: TangillaEvent): string | null {
  const parts: string[] = [];
  if (ev.ce && ev.ce_credits) parts.push(`${ev.ce_credits} ${ev.ce_type_name ?? 'CE'} credit${ev.ce_credits === 1 ? '' : 's'}`);
  if (ev.secondary_ce_credits) {
    parts.push(`${ev.secondary_ce_credits} ${ev.secondary_ce_type_name ?? 'CE'} credit${ev.secondary_ce_credits === 1 ? '' : 's'}`);
  }
  return parts.length ? `CE: ${parts.join(' + ')}` : null;
}

function tagsFor(ev: TangillaEvent): string | null {
  const out = new Set<string>();
  if (ev.event_type) out.add(ev.event_type);
  if (ev.ce) out.add('ce');
  if (ev.member_only) out.add('members-only');
  if (Array.isArray(ev.tags)) {
    for (const t of ev.tags) {
      const s = typeof t === 'string' ? t : (t && typeof t === 'object' && 'name' in t ? String((t as { name: unknown }).name) : '');
      if (s.trim()) out.add(s.trim().toLowerCase());
    }
  }
  return out.size ? Array.from(out).join(',') : null;
}

export interface TangillaConfig {
  source: EventInput['externalSource'];
  titlePrefix: string;
  organizer: string;
  membersOnlyLabel: string;
}
const METROTEX_CFG: TangillaConfig = {
  source: SOURCE,
  titlePrefix: TITLE_PREFIX,
  organizer: 'MetroTex Association of REALTORS®',
  membersOnlyLabel: 'MetroTex members only.',
};

export function normalizeTangilla(ev: TangillaEvent, cfg: TangillaConfig): EventInput | null {
  const title = clean(ev.event_title);
  const startDate = centralIso(ev.event_date, ev.start_time);
  if (!ev.event_id || !title || !startDate) return null;
  const endDate = ev.end_time ? centralIso(ev.event_date, ev.end_time) : null;
  const virtual = (ev.location_type ?? '').toLowerCase() === 'virtual';

  const location = virtual
    ? null
    : clean([ev.location, ev.location_address].filter(Boolean).join(', ')) ?? clean(ev.location);

  const extra = [
    ceLine(ev),
    ev.provider_name ? `Provider: ${ev.provider_name}` : null,
    ev.member_only ? cfg.membersOnlyLabel : null,
  ].filter(Boolean).join('\n');
  const body = htmlToText(ev.event_description);
  const description = [body, extra].filter(Boolean).join('\n\n') || null;

  const instructors = [clean(ev.instructor_name), clean(ev.instructor2_name)].filter(Boolean).join(' & ');

  return {
    externalSource: cfg.source,
    externalId: ev.event_id,
    publication: PUBLICATION,
    title: `${cfg.titlePrefix}${title}`,
    description,
    link: clean(ev.registration_link),
    startDate,
    endDate,
    location,
    organizer: cfg.organizer,
    organizerEmail: null,
    website: clean(ev.registration_link),
    tags: tagsFor(ev),
    format: virtual ? 'Virtual' : 'In-Person',
    courseNumber: clean(ev.course_number),
    memberPrice: money(ev.member_price),
    nonmemberPrice: money(ev.price),
    imageUrl: clean(ev.course_image),
    imageThumb: clean(ev.course_image),
    instructorName: instructors || null,
    instructorBio: htmlToText(ev.instructor_bio) || null,
    lat: null,
    lng: null,
  };
}

/** Fetch and normalize every upcoming MetroTex class/event. */
export async function scrapeMetroTex(): Promise<EventInput[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let raw: unknown;
  try {
    const res = await fetch(FEED_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'RealtyNewsNow-Calendar/1.0 (+https://realtynewsnow.app)' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`MetroTex feed HTTP ${res.status}`);
    raw = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(raw)) throw new Error('MetroTex feed: expected an array');
  const out: EventInput[] = [];
  for (const item of raw as TangillaEvent[]) {
    const ev = normalizeTangilla(item, METROTEX_CFG);
    if (ev) out.push(ev);
  }
  return out;
}
