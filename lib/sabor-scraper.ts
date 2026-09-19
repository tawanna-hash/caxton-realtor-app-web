// caxton-events-v1
// SABOR (San Antonio Board of REALTORS) calendar scraper.
// Pulls events from the custom `sabor-cal-v2` WordPress plugin:
//   - JSONP db.php API returns the full list of upcoming events
//     (id, start, end, title, color, type). All future events in a single
//     request — no month pagination needed.
//   - Per-type ICS feeds (class / meeting / closing) carry richer detail:
//     DESCRIPTION (HTML w/ Provider, Course #, CE hours) and LOCATION.
//
// We merge both sources keyed on event id == ICS UID prefix and produce
// EventInput rows for upsert into the events table with publication =
// 'san_antonio' and externalSource = 'sabor'.

import type { EventInput } from './events-store';

const BASE = 'https://sabor.com';
const API_URL = `${BASE}/wp-content/plugins/sabor-cal-v2/api/db.php`;
const ICS_BASE = `${BASE}/wp-content/plugins/sabor-cal-v2/ics/feed.php`;
const REGISTRATION_BASE = 'https://ramco.sabor.com';
const PUBLICATION = 'san_antonio' as const;
const SOURCE = 'sabor' as const;
const EVENT_NAME_PREFIX = 'SABOR: ';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json,text/calendar,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const FETCH_TIMEOUT_MS = 30_000;
const REQUEST_DELAY_MS = 200;

// ----------------------------- types --------------------------------------

type SaborType = 'class' | 'meeting' | 'closing';

interface SaborApiEvent {
  id: string;
  start: string; // ISO-like "YYYY-MM-DDTHH:MM:SS" — naive Central time
  end: string;
  title: string;
  color: string;
  type: SaborType;
}

interface IcsEntry {
  uid: string;
  description: string | null; // HTML — sanitized to plain text
  location: string | null;
}

// ----------------------------- helpers ------------------------------------

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Fetch ${url} -> ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the IANA America/Chicago UTC offset for a given local date as an
 * ISO-8601 offset string (`-05:00` CDT, `-06:00` CST). Mirrors the helper
 * in the UnlockMLS scraper.
 */
function getCentralOffset(year: number, month: number, day: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const tzPart = fmt.formatToParts(probe).find((p) => p.type === 'timeZoneName');
  const raw = tzPart?.value || 'GMT-6';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
  if (!m) return '-06:00';
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
}

/**
 * Convert a naive `YYYY-MM-DDTHH:MM:SS` (local Central time) into a proper
 * ISO-8601 string with a timezone offset. Returns null for unparseable input.
 */
function naiveCentralToIso(naive: string | null | undefined): string | null {
  if (!naive) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(naive);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const offset = getCentralOffset(year, month, day);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`;
}

/**
 * Strip HTML tags from ICS DESCRIPTION values and decode common entities.
 * The DESCRIPTION field comes wrapped in `<div>` markup with inline styles.
 */
function htmlToText(html: string): string {
  if (!html) return '';
  // Replace block-level closers with newlines so paragraphs survive.
  let out = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  // Collapse 3+ blank lines to 2, trim per-line whitespace.
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Unfold ICS lines (RFC 5545): a CRLF followed by whitespace is a line
 * continuation. Normalize CRLF -> LF first.
 */
function unfoldIcs(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * Decode ICS TEXT property values: escaped commas, semicolons, backslashes,
 * and `\n` newlines. (DESCRIPTION/LOCATION/SUMMARY all use TEXT semantics.)
 */
function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// ----------------------------- API fetch ----------------------------------

/**
 * Hit the SABOR db.php JSONP endpoint and return the list of events.
 * The response body looks like `callback([ ... ])`. We strip the wrapper.
 * If `type` is omitted, the server returns all event types in one call.
 */
async function fetchSaborApi(type: 'all' | SaborType = 'all'): Promise<SaborApiEvent[]> {
  const params = new URLSearchParams({ type, filter: '', tag: '', vers: 'caxton' });
  const url = `${API_URL}?${params.toString()}`;
  const body = await fetchText(url);
  const trimmed = body.trim();
  // Strip JSONP wrapper: `callback(...)` or `?(...)` etc.
  const m = /^[^(]*\(([\s\S]*)\)\s*;?\s*$/.exec(trimmed);
  const jsonStr = m ? m[1] : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`sabor db.php returned non-JSON body: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`sabor db.php expected an array, got ${typeof parsed}`);
  }
  return parsed as SaborApiEvent[];
}

// ----------------------------- ICS fetch + parse --------------------------

/**
 * Fetch the ICS feed for a given event type and parse it into a map keyed
 * by the bare UID (the `<guid>` before `@sabor.com`). Each entry holds the
 * description (HTML stripped to plain text) and location string.
 */
async function fetchSaborIcs(type: SaborType): Promise<Map<string, IcsEntry>> {
  const url = `${ICS_BASE}?type=${type}`;
  const body = await fetchText(url);
  const lines = unfoldIcs(body);
  const out = new Map<string, IcsEntry>();

  let inEvent = false;
  let cur: Partial<IcsEntry> & { uid?: string } = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur.uid) {
        const bareUid = cur.uid.replace(/@sabor\.com$/, '');
        out.set(bareUid, {
          uid: bareUid,
          description: cur.description ?? null,
          location: cur.location ?? null,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    // Split into property name (possibly with params) and value.
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const propName = left.split(';')[0].toUpperCase();

    if (propName === 'UID') {
      cur.uid = decodeIcsText(value).trim();
    } else if (propName === 'DESCRIPTION') {
      const text = htmlToText(decodeIcsText(value));
      cur.description = text || null;
    } else if (propName === 'LOCATION') {
      const text = clean(decodeIcsText(value));
      cur.location = text || null;
    }
  }
  return out;
}

// ----------------------------- merge --------------------------------------

interface MergedIcs {
  byUid: Map<string, IcsEntry>;
}

async function fetchAllIcs(): Promise<MergedIcs> {
  const byUid = new Map<string, IcsEntry>();
  const types: SaborType[] = ['class', 'meeting', 'closing'];
  for (const t of types) {
    try {
      const m = await fetchSaborIcs(t);
      for (const [uid, entry] of m.entries()) {
        if (!byUid.has(uid)) byUid.set(uid, entry);
      }
    } catch (err) {
      console.warn(`[sabor] ICS fetch failed for type=${t}`, err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return { byUid };
}

/**
 * Build a registration URL for the event. Per Tawanna (2026-05-28), every
 * SABOR event and class should link through the sabor.com account login
 * wrapper, which then redirects the authenticated user to the RAMCO
 * MeetingDetails page for that event's `mid`. Office closings have no
 * registration page, so they link back to the calendar.
 */
function buildLink(ev: SaborApiEvent): string {
  if (ev.type === 'closing') {
    return `${BASE}/news-events-and-education/events/calendar-of-events/`;
  }
  // Note: cobaltsrc is intentionally NOT percent-encoded. SABOR's login page
  // expects the raw URL as the query value (matches their `onEventClick`
  // handler and the format the user supplied). Event ids are UUIDs so they
  // contain no characters that require escaping.
  const target = `${REGISTRATION_BASE}/Meetings/Registration/MeetingDetails.aspx?mid=${ev.id}`;
  return `${BASE}/account/login/?cobaltsrc=${target}`;
}

/**
 * Detect virtual/online delivery from ICS LOCATION or the event title.
 * SABOR titles often include "ZOOM ONLY" or "IN PERSON ONLY" markers.
 */
function isVirtualLocation(loc: string | null, title: string): boolean {
  const probe = `${loc || ''} ${title}`;
  return /\b(virtual|online|zoom|webinar|teams|google\s*meet|livestream|live\s*stream)\b/i.test(probe);
}

/** Parse `Course #39181-RECE` (or `Course # 39181`) out of the description. */
function extractCourseNumber(description: string | null): string | null {
  if (!description) return null;
  const m = /Course\s*#\s*([A-Za-z0-9\-\/]+)/.exec(description);
  return m ? m[1] : null;
}

/** Parse `Provider: 8-CEP` (the bit before `|`) out of the description. */
function extractProvider(description: string | null): string | null {
  if (!description) return null;
  const m = /Provider:?\s*([^\n|]+?)(?:\s*\||\s*\n|$)/i.exec(description);
  if (!m) return null;
  const cleaned = clean(m[1]);
  return cleaned || null;
}

// ----------------------------- orchestration ------------------------------

/**
 * Scrape SABOR events. The `months` argument is honored as a forward-window
 * filter on the result set — the upstream API returns all upcoming events
 * regardless, so this just trims anything beyond the requested horizon.
 *
 * Returns EventInput rows ready for upsertEvents().
 */
export async function scrapeSabor(months = 3): Promise<EventInput[]> {
  const apiEvents = await fetchSaborApi('all');
  const { byUid } = await fetchAllIcs();

  // Forward-window cutoff: `months` months from "now".
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() + Math.max(1, Math.min(months, 12)));

  const out: EventInput[] = [];
  for (const ev of apiEvents) {
    const startIso = naiveCentralToIso(ev.start);
    const endIso = naiveCentralToIso(ev.end);
    if (!startIso) continue;
    const startMs = Date.parse(startIso);
    if (Number.isNaN(startMs)) continue;
    if (startMs > cutoff.getTime()) continue;

    const ics = byUid.get(ev.id) || null;
    const rawLocation = ics?.location || null;
    const virtual = isVirtualLocation(rawLocation, ev.title);
    const description = ics?.description || null;

    out.push({
      externalSource: SOURCE,
      externalId: ev.id,
      publication: PUBLICATION,
      title: `${EVENT_NAME_PREFIX}${clean(ev.title)}`,
      description,
      link: buildLink(ev),
      startDate: startIso,
      endDate: endIso,
      location: rawLocation && !virtual ? rawLocation : null,
      organizer: extractProvider(description),
      organizerEmail: null,
      website: buildLink(ev),
      tags: ev.type, // 'class' | 'meeting' | 'closing'
      format: virtual ? 'Virtual' : null,
      courseNumber: extractCourseNumber(description),
      memberPrice: null,
      nonmemberPrice: null,
      imageUrl: null,
      imageThumb: null,
      instructorName: null,
      instructorBio: null,
      lat: null,
      lng: null,
    });
  }

  return out;
}
