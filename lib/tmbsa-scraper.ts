// caxton-events-v1
// TMBSA — Texas Mortgage Bankers San Antonio — calendar scraper.
//
// Source: https://tmbsa.org/events/ (WordPress + Elementor, static page)
//         https://texasmortgagebankerssanantonio.wildapricot.org/events
//           (Wild Apricot AMS, has structured per-event pages)
//
// Data is split across two surfaces:
//   1. Wild Apricot publishes the *currently registerable* event with full
//      date/time/location/price details on a per-event page.
//   2. The TMBSA WordPress page has a static "Upcoming events" <ul> that
//      lists the rest of the year's events as bare "Month Day – Title"
//      bullets (no times, no venues, no links).
//
// Strategy:
//   a. Fetch the Wild Apricot /events list page, extract every event-NNN
//      detail URL, then GET each detail page and parse the structured
//      "When / Location / Registration" block.
//   b. Fetch the WP /events/ page, scrape the year from the page header
//      ("Current and Upcoming Events in YYYY"), then parse each <li>
//      bullet of the form "Month Day – Title" into a placeholder event.
//      Default time and venue come from the Wild Apricot detail (TMBSA
//      meets at Petroleum Club at 11:30 AM most months) — but those are
//      left null when not present so the UI knows they're TBD.
//   c. Dedupe (a) ∪ (b) by (date + normalized title). WA detail wins.
//
// publication='san_antonio', source='tmbsa', prefix 'TMBSA: '.

import type { EventInput } from './events-store';

const WP_URL = 'https://tmbsa.org/events/';
const WA_BASE = 'https://texasmortgagebankerssanantonio.wildapricot.org';
const WA_LIST_URL = `${WA_BASE}/events`;
const PUBLICATION = 'san_antonio' as const;
const SOURCE = 'tmbsa' as const;
const EVENT_NAME_PREFIX = 'TMBSA: ';
const ORGANIZER = 'Texas Mortgage Bankers San Antonio';

const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_DELAY_MS = 150;
const VIRTUAL_RE = /\b(virtual|zoom|teams|webinar|online|gotomeeting)\b/i;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// ---------------------------- helpers --------------------------------------

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
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`TMBSA fetch ${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Combine a date + 12-hour time string into an ISO-8601 UTC instant assuming
 * America/Chicago. Returns null if parsing fails.
 *
 * Why a hand-rolled converter: we want exactly one timezone here (Central),
 * and avoiding an Intl dependency keeps the scraper self-contained. We
 * compute the UTC offset for the given date by walking the standard
 * US-Central DST rules (2nd Sun Mar → 1st Sun Nov is CDT = UTC-5;
 * otherwise CST = UTC-6).
 */
function centralToIso(
  year: number, month0: number, day: number,
  hour24: number, minute: number,
): string {
  const offsetHours = isCdt(year, month0, day) ? 5 : 6;
  const utcMs = Date.UTC(year, month0, day, hour24 + offsetHours, minute, 0);
  return new Date(utcMs).toISOString();
}

function isCdt(year: number, month0: number, day: number): boolean {
  // CDT runs from 2nd Sunday of March to 1st Sunday of November.
  const marStart = nthSundayOfMonth(year, 2, 2); // 2nd Sunday of March
  const novEnd = nthSundayOfMonth(year, 10, 1);  // 1st Sunday of November
  const target = Date.UTC(year, month0, day);
  return target >= marStart && target < novEnd;
}

function nthSundayOfMonth(year: number, month0: number, n: number): number {
  // Find first Sunday, then add (n-1) weeks
  const firstDay = new Date(Date.UTC(year, month0, 1));
  const dayOfWeek = firstDay.getUTCDay();
  const firstSunday = 1 + ((7 - dayOfWeek) % 7);
  return Date.UTC(year, month0, firstSunday + (n - 1) * 7);
}

function parse12HourTime(s: string): { hour24: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return { hour24: h, minute: min };
}

// ---------------------------- WP page parser -------------------------------

interface WpBullet {
  month0: number;
  day: number;
  title: string; // raw
}

/**
 * Parse the static "Upcoming events" <ul> on the WordPress page. Returns
 * one entry per <li>. The year is determined by the page heading.
 */
function parseWpBullets(html: string): { year: number; bullets: WpBullet[] } {
  let year = new Date().getUTCFullYear();
  const yearMatch = /Current and Upcoming Events in (\d{4})/.exec(html);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  const bullets: WpBullet[] = [];
  // Match <li>…<strong>August 11 – Title</strong>…</li>
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null) {
    const text = stripTags(m[1]);
    // Accept en-dash, em-dash, or hyphen as the separator
    const parsed = /^([A-Za-z]+)\s+(\d{1,2})\s*[–—-]\s*(.+)$/.exec(text);
    if (!parsed) continue;
    const mo = MONTHS[parsed[1].toLowerCase()];
    if (mo === undefined) continue;
    const day = parseInt(parsed[2], 10);
    if (!day || day > 31) continue;
    bullets.push({ month0: mo, day, title: parsed[3].trim() });
  }
  return { year, bullets };
}

// ---------------------------- Wild Apricot parser --------------------------

interface WaEvent {
  eventId: string;
  url: string;
  title: string;
  startIso: string;
  endIso: string | null;
  location: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  description: string | null;
  registerUrl: string;
}

/**
 * Pull every /event-NNN URL off the Wild Apricot events list. We strip
 * query/fragment and the trailing /Attendees | /Registration suffixes so
 * each event resolves to a single canonical detail URL.
 */
function extractWaEventIds(html: string): string[] {
  const ids = new Set<string>();
  const re = /\/event-(\d+)(?:[/"?])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

/**
 * Parse a Wild Apricot event detail page. The structured data lives in a
 * `boxInfoContainer` with labeled `<li>` rows (When/Location/Registered)
 * and a separate `registrationInfo` ul with price tiers.
 *
 * Description body: WA renders the event title as `<h1>TITLE</h1>` at the
 * top of the page, then repeats the title later in a content block above
 * the "Want to become a member?" footer. We grab everything between that
 * repeated title and the footer as the description.
 */
function parseWaEventPage(html: string, eventId: string): WaEvent | null {
  // Title from <h1> (skip "Wrong document context!" the WA framework injects)
  let title: string | null = null;
  for (const h1m of html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)) {
    const t = clean(h1m[1]);
    if (t && !/wrong document context/i.test(t)) {
      title = t;
      break;
    }
  }
  if (!title) return null;

  // Date — `<strong>June 09, 2026</strong>` inside `eventInfoStartDate`
  const dateMatch = /eventInfoStartDate[\s\S]*?<strong>([^<]+)<\/strong>/.exec(html);
  if (!dateMatch) return null;
  const dateText = clean(dateMatch[1]);
  const dateParsed = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(dateText);
  if (!dateParsed) return null;
  const month0 = MONTHS[dateParsed[1].toLowerCase()];
  const day = parseInt(dateParsed[2], 10);
  const year = parseInt(dateParsed[3], 10);
  if (month0 === undefined) return null;

  // Time range — `11:30 AM - 1:00 PM` inside eventInfoStartTime
  const timeMatch =
    /eventInfoStartTime[\s\S]*?client-tz-formatted[^>]*>\s*([0-9: APM\-]+)\s*<\/div>/.exec(html);
  let startIso: string;
  let endIso: string | null = null;
  if (timeMatch) {
    const range = clean(timeMatch[1]);
    const parts = range.split(/\s*-\s*/);
    const startT = parse12HourTime(parts[0] || '');
    if (!startT) return null;
    startIso = centralToIso(year, month0, day, startT.hour24, startT.minute);
    if (parts[1]) {
      const endT = parse12HourTime(parts[1]);
      if (endT) endIso = centralToIso(year, month0, day, endT.hour24, endT.minute);
    }
  } else {
    // All-day fallback — midnight Central
    startIso = centralToIso(year, month0, day, 0, 0);
  }

  // Location — inside `eventInfoLocation`
  let location: string | null = null;
  const locMatch = /eventInfoLocation[\s\S]*?<div class="eventInfoBoxValue">([\s\S]*?)<\/div>/.exec(html);
  if (locMatch) {
    const loc = stripTags(locMatch[1]);
    location = loc || null;
  }

  // Price tiers — `<strong>1. Member – $35.00</strong>`
  let memberPrice: string | null = null;
  let nonmemberPrice: string | null = null;
  const regBlock = /registrationInfo[\s\S]*?<\/ul>/.exec(html);
  if (regBlock) {
    const tiers = regBlock[0].match(/<strong>[\s\S]*?<\/strong>/g) || [];
    for (const raw of tiers) {
      const text = stripTags(raw);
      const priceM = /\$[\d,]+(?:\.\d+)?/.exec(text);
      if (!priceM) continue;
      // Heuristic: "Future" / "Non" / "Guest" → nonmember, else member.
      if (/future|non[- ]?member|guest|public/i.test(text)) {
        if (!nonmemberPrice) nonmemberPrice = priceM[0];
      } else {
        if (!memberPrice) memberPrice = priceM[0];
      }
    }
  }

  // Description: text between the 2nd occurrence of the title (after the
  // structured info block) and the "Want to become a member?" footer.
  let description: string | null = null;
  const fullText = stripTags(html);
  const titleEsc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleOccurrences: number[] = [];
  for (const m of fullText.matchAll(new RegExp(titleEsc, 'gi'))) {
    titleOccurrences.push(m.index || 0);
  }
  if (titleOccurrences.length >= 2) {
    const start = titleOccurrences[titleOccurrences.length - 1] + title.length;
    const footerIdx = fullText.indexOf('Want to become a member', start);
    const end = footerIdx > 0 ? footerIdx : fullText.length;
    const raw = fullText.slice(start, end).trim();
    if (raw) description = raw;
  }

  return {
    eventId,
    url: `${WA_BASE}/event-${eventId}`,
    title,
    startIso,
    endIso,
    location,
    memberPrice,
    nonmemberPrice,
    description,
    registerUrl: `${WA_BASE}/event-${eventId}/Registration`,
  };
}

// ---------------------------- normalization --------------------------------

function deriveFormat(location: string | null, title: string): string {
  const hay = `${location || ''} ${title}`;
  return VIRTUAL_RE.test(hay) ? 'Virtual' : 'In-Person';
}

function isMappableLocation(loc: string | null): loc is string {
  if (!loc) return false;
  return !VIRTUAL_RE.test(loc.toLowerCase());
}

/** Normalize titles for dedupe matching. */
function normalizeTitleForKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function waToEventInput(ev: WaEvent): EventInput {
  const cleanTitle = clean(ev.title);
  const location = isMappableLocation(ev.location) ? ev.location : null;
  return {
    externalSource: SOURCE,
    externalId: `tmbsa:wa:${ev.eventId}`,
    publication: PUBLICATION,
    title: `${EVENT_NAME_PREFIX}${cleanTitle}`,
    description: ev.description,
    link: ev.registerUrl,
    startDate: ev.startIso,
    endDate: ev.endIso,
    location,
    organizer: ORGANIZER,
    organizerEmail: null,
    website: ev.registerUrl,
    tags: null,
    format: deriveFormat(ev.location, cleanTitle),
    courseNumber: null,
    memberPrice: ev.memberPrice,
    nonmemberPrice: ev.nonmemberPrice,
    imageUrl: null,
    imageThumb: null,
    instructorName: null,
    instructorBio: null,
    lat: null,
    lng: null,
  };
}

/**
 * Map a WP bullet to an EventInput placeholder. No time is known, so we
 * stub startDate as midnight Central on the listed date — the UI shows
 * "All day" or formats accordingly. external_id is a hash of date+title
 * so reruns dedupe stably.
 */
function wpBulletToEventInput(year: number, b: WpBullet): EventInput {
  const startIso = centralToIso(year, b.month0, b.day, 0, 0);
  const datePart = `${year}-${String(b.month0 + 1).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
  const slug = normalizeTitleForKey(b.title).replace(/\s+/g, '-').slice(0, 60);
  return {
    externalSource: SOURCE,
    externalId: `tmbsa:wp:${datePart}:${slug}`,
    publication: PUBLICATION,
    title: `${EVENT_NAME_PREFIX}${b.title}`,
    description: null,
    link: WP_URL,
    startDate: startIso,
    endDate: null,
    location: null,
    organizer: ORGANIZER,
    organizerEmail: null,
    website: WP_URL,
    tags: null,
    format: 'In-Person',
    courseNumber: null,
    memberPrice: null,
    nonmemberPrice: null,
    imageUrl: null,
    imageThumb: null,
    instructorName: null,
    instructorBio: null,
    lat: null,
    lng: null,
  };
}

// ---------------------------- orchestration --------------------------------

/**
 * Top-level entry. Pulls Wild Apricot detail pages for any currently
 * registerable event, then backfills the remainder of the year from the
 * WP page's static <ul>. Dedupe key is `year-month-day + normalized title`
 * — WA detail wins when both surfaces describe the same event.
 *
 * `months` is informational only here; both surfaces always return their
 * full forward window, and we drop anything older than now.
 */
export async function scrapeTmbsa(_months = 12): Promise<EventInput[]> {
  void _months; // accepted for API symmetry with other scrapers
  const now = new Date();
  const out: EventInput[] = [];
  const dedup = new Map<string, EventInput>(); // key: yyyy-mm-dd|normTitle

  // ---- 1. Wild Apricot detail pages
  let waEventIds: string[] = [];
  try {
    const listHtml = await fetchText(WA_LIST_URL);
    waEventIds = extractWaEventIds(listHtml);
  } catch (err) {
    console.warn('[tmbsa] WA list fetch failed:', err);
  }

  for (const id of waEventIds) {
    try {
      const html = await fetchText(`${WA_BASE}/event-${id}`);
      const ev = parseWaEventPage(html, id);
      if (!ev) continue;
      if (new Date(ev.startIso) < now) continue;
      const ei = waToEventInput(ev);
      const key = `${ev.startIso.slice(0, 10)}|${normalizeTitleForKey(ev.title)}`;
      dedup.set(key, ei);
    } catch (err) {
      console.warn(`[tmbsa] WA detail fetch failed for ${id}:`, err);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // ---- 2. WP bullets (placeholders for the rest of the year)
  try {
    const wpHtml = await fetchText(WP_URL);
    const { year, bullets } = parseWpBullets(wpHtml);
    for (const b of bullets) {
      const ei = wpBulletToEventInput(year, b);
      if (!ei.startDate) continue;
      if (new Date(ei.startDate) < now) continue;
      const titleStripped = b.title;
      const key = `${ei.startDate.slice(0, 10)}|${normalizeTitleForKey(titleStripped)}`;
      // Only insert if no WA detail already covers this slot. WA detail
      // also tends to use the same words ("REALTOR PANEL" vs "Realtor
      // Panel"), so the normalized key matches.
      const existing = dedup.get(key);
      if (existing) continue;
      // Also dedupe across day-only matches when WA used a slightly
      // different title — fall back to date-only collision check.
      const dateOnlyHit = Array.from(dedup.keys()).find((k) => k.startsWith(ei.startDate!.slice(0, 10) + '|'));
      if (dateOnlyHit) continue;
      dedup.set(key, ei);
    }
  } catch (err) {
    console.warn('[tmbsa] WP page fetch failed:', err);
  }

  for (const ei of dedup.values()) out.push(ei);

  console.log(
    `[tmbsa] WA=${waEventIds.length} events → ${out.length} total (after WP backfill + dedupe)`,
  );

  return out;
}
