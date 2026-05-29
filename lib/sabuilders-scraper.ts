// caxton-events-v1
// GSABA — Greater San Antonio Builders Association — calendar scraper.
//
// Source: https://members.sabuilders.com/events/calendar/YYYY-MM-DD
// Tech:   WordPress wrapper + GrowthZone AMS (ChamberMaster, CCID=9584)
//
// The calendar page is server-side rendered HTML — no XHR, no auth required.
// Each event detail page exposes a per-event ICS feed which is the cleanest
// source for date/time, summary, description, location, and URL. The HTML
// detail page is then scraped only to enrich with image, member/non-member
// prices, and organizer email.
//
// Flow:
//   1. For each target month (now → now + N months), GET the calendar page
//      `/events/calendar/YYYY-MM-01` and collect unique event slug-id pairs
//      from /events/details/<slug-id> links.
//   2. For each event, GET the per-event ICS at
//      `/events/addtocalendar/<slug-id>?format=ICal` and parse SUMMARY,
//      DTSTART, DTEND, DESCRIPTION, LOCATION, URL, UID.
//   3. GET the detail HTML for image, fees, organizer email.
//   4. Map to EventInput. publication='san_antonio', source='sabuilders'.

import type { EventInput } from './events-store';

const BASE = 'https://members.sabuilders.com';
const PUBLICATION = 'san_antonio' as const;
const SOURCE = 'sabuilders' as const;
const EVENT_NAME_PREFIX = 'GSABA: ';
const ORGANIZER = 'Greater San Antonio Builders Association';

const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_DELAY_MS = 120;
const VIRTUAL_RE = /\b(virtual|zoom|teams|webinar|online|gotomeeting)\b/i;

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
        // Mimic a real desktop browser so the GZ wrapper doesn't serve a
        // stripped-down crawler page.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`GSABA fetch ${url} -> ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------- calendar listing -----------------------------

/**
 * Pull every unique /events/details/<slug-id> link from a month's calendar
 * page. We strip the `?calendarMonth=...` query so the same event appearing
 * in multiple month grids dedupes to one canonical URL.
 */
function extractEventSlugs(html: string): string[] {
  const slugs = new Set<string>();
  const re = /href="(?:https?:\/\/members\.sabuilders\.com)?\/events\/details\/([a-z0-9-]+-\d+)(?:\?[^"]*)?"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    slugs.add(m[1]);
  }
  return Array.from(slugs);
}

function monthKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

/**
 * Walk months from now through now+months inclusive and return the union of
 * event slug-IDs found on each month's calendar page.
 *
 * Note: GSABA's calendar grid also includes recurring/anchor events that
 * actually fire in other months (e.g., "2026 Sporting Clay Tournament"
 * showed up under May). That's fine — the ICS step is authoritative for
 * the real DTSTART, and the upsert step dedupes by external_id (the
 * GZ-stable UID `e.9584.<eventId>`).
 */
async function collectMonthlySlugs(months: number): Promise<string[]> {
  const slugs = new Set<string>();
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const url = `${BASE}/events/calendar/${monthKey(d)}`;
    try {
      const html = await fetchText(url);
      for (const s of extractEventSlugs(html)) slugs.add(s);
    } catch (err) {
      console.warn(`[sabuilders] month fetch failed (${monthKey(d)}):`, err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return Array.from(slugs);
}

// ---------------------------- ICS parser -----------------------------------

interface IcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  dtStart: string; // ISO-8601 UTC
  dtEnd: string | null;
  location: string | null;
  url: string | null;
}

/**
 * Parse a single VEVENT from the per-event ICS feed. RFC 5545 line folding
 * (lines beginning with a space continue the prior line) is unfolded first.
 * Backslash escapes inside TEXT properties (\\, \,, \n, \;) are decoded.
 */
function parseEventIcs(ics: string): IcsEvent | null {
  // Unfold continuation lines
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const inEvent = (() => {
    const start = lines.findIndex((l) => l === 'BEGIN:VEVENT');
    const end = lines.findIndex((l) => l === 'END:VEVENT');
    if (start < 0 || end < 0) return [] as string[];
    return lines.slice(start + 1, end);
  })();
  if (inEvent.length === 0) return null;

  const get = (name: string): string | null => {
    for (const line of inEvent) {
      // `NAME` or `NAME;PARAM=VAL`
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const keyPart = line.slice(0, idx);
      const baseKey = keyPart.split(';')[0].toUpperCase();
      if (baseKey === name.toUpperCase()) {
        return line.slice(idx + 1);
      }
    }
    return null;
  };

  const decodeText = (s: string | null): string | null => {
    if (s === null) return null;
    return s
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  const toIso = (raw: string | null): string | null => {
    if (!raw) return null;
    // Expected like "20260514T163000Z" or "20260514" (date-only).
    const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
    if (utc) {
      return `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}.000Z`;
    }
    const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (dateOnly) {
      // Treat all-day as midnight UTC of that date.
      return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`;
    }
    return null;
  };

  const uid = get('UID');
  const dtStart = toIso(get('DTSTART'));
  if (!uid || !dtStart) return null;

  return {
    uid: clean(uid),
    summary: decodeText(get('SUMMARY')) || '',
    description: decodeText(get('DESCRIPTION')),
    dtStart,
    dtEnd: toIso(get('DTEND')),
    location: decodeText(get('LOCATION')),
    url: get('URL'),
  };
}

async function fetchEventIcs(slugId: string): Promise<IcsEvent | null> {
  const url = `${BASE}/events/addtocalendar/${slugId}?format=ICal`;
  try {
    const txt = await fetchText(url);
    return parseEventIcs(txt);
  } catch (err) {
    console.warn(`[sabuilders] ICS fetch failed for ${slugId}:`, err);
    return null;
  }
}

// ---------------------------- detail HTML enrichment -----------------------

interface DetailEnrichment {
  imageUrl: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  organizerEmail: string | null;
}

/**
 * Pull image URL, member/non-member prices, and organizer email from the
 * full HTML detail page. All fields are best-effort — anything missing
 * just resolves to null.
 */
function parseDetailHtml(html: string): DetailEnrichment {
  let imageUrl: string | null = null;
  const imgMatch = /https:\/\/chambermaster\.blob\.core\.windows\.net\/images\/events\/\d+\/\d+\/EventPhotoFull[^\s"'<>)]+/.exec(html);
  if (imgMatch) imageUrl = imgMatch[0];

  // Fee strings appear as "$20 members" / "$40 non-members" inside the
  // GZ details fragment. Capture both side-by-side then split.
  let memberPrice: string | null = null;
  let nonmemberPrice: string | null = null;
  const feeBlock = /\$[\d,]+(?:\.\d+)?\s*(?:members?|non-?members?)/gi;
  const fees = html.match(feeBlock) || [];
  for (const raw of fees) {
    const isNon = /non-?members?/i.test(raw);
    const dollars = /\$[\d,]+(?:\.\d+)?/.exec(raw)?.[0] || null;
    if (!dollars) continue;
    if (isNon && !nonmemberPrice) nonmemberPrice = dollars;
    else if (!isNon && !memberPrice) memberPrice = dollars;
  }

  let organizerEmail: string | null = null;
  const mailto = /href="mailto:([^"?]+)/i.exec(html);
  if (mailto) organizerEmail = clean(mailto[1]);

  return { imageUrl, memberPrice, nonmemberPrice, organizerEmail };
}

async function fetchDetailEnrichment(slugId: string): Promise<DetailEnrichment> {
  try {
    const html = await fetchText(`${BASE}/events/details/${slugId}`);
    return parseDetailHtml(html);
  } catch (err) {
    console.warn(`[sabuilders] detail fetch failed for ${slugId}:`, err);
    return { imageUrl: null, memberPrice: null, nonmemberPrice: null, organizerEmail: null };
  }
}

// ---------------------------- normalization --------------------------------

function deriveFormat(location: string | null, title: string): string {
  const haystack = `${location || ''} ${title}`;
  return VIRTUAL_RE.test(haystack) ? 'Virtual' : 'In-Person';
}

function isMappableLocation(loc: string | null): loc is string {
  if (!loc) return false;
  const lower = loc.toLowerCase();
  return !VIRTUAL_RE.test(lower);
}

function detailUrlForSlug(slugId: string): string {
  return `${BASE}/events/details/${slugId}`;
}

function toEventInput(
  ics: IcsEvent,
  slugId: string,
  detail: DetailEnrichment,
): EventInput | null {
  const title = clean(ics.summary);
  if (!title) return null;

  const location = isMappableLocation(ics.location) ? ics.location : null;
  const format = deriveFormat(ics.location, title);
  const link = ics.url || detailUrlForSlug(slugId);

  return {
    externalSource: SOURCE,
    externalId: `sabuilders:${ics.uid}`,
    publication: PUBLICATION,
    title: `${EVENT_NAME_PREFIX}${title}`,
    description: ics.description,
    link,
    startDate: ics.dtStart,
    endDate: ics.dtEnd,
    location,
    organizer: ORGANIZER,
    organizerEmail: detail.organizerEmail,
    website: link,
    tags: null,
    format,
    courseNumber: null,
    memberPrice: detail.memberPrice,
    nonmemberPrice: detail.nonmemberPrice,
    imageUrl: detail.imageUrl,
    imageThumb: detail.imageUrl,
    instructorName: null,
    instructorBio: null,
    lat: null,
    lng: null,
  };
}

// ---------------------------- orchestration --------------------------------

/**
 * Top-level entry. Walks the next `months` monthly calendar pages, fetches
 * each event's ICS + detail HTML, normalizes to EventInput.
 *
 * Filters:
 *   - past events (DTSTART < now) — dropped (GSABA's calendar shows historical
 *     anchor events as recurring placeholders; we don't want stale rows)
 *   - duplicate UIDs within a run — first one wins
 */
export async function scrapeSabuilders(months = 3): Promise<EventInput[]> {
  const now = new Date();
  const slugs = await collectMonthlySlugs(months);

  const out: EventInput[] = [];
  const seen = new Set<string>();
  let skippedNoIcs = 0;
  let skippedPast = 0;
  let skippedInvalid = 0;
  let skippedDup = 0;

  for (const slug of slugs) {
    const ics = await fetchEventIcs(slug);
    if (!ics) { skippedNoIcs += 1; continue; }
    await sleep(REQUEST_DELAY_MS);

    // Drop past events. ICS DTSTART is authoritative regardless of which
    // month grid surfaced the slug.
    if (new Date(ics.dtStart) < now) { skippedPast += 1; continue; }

    const detail = await fetchDetailEnrichment(slug);
    await sleep(REQUEST_DELAY_MS);

    const ei = toEventInput(ics, slug, detail);
    if (!ei) { skippedInvalid += 1; continue; }

    if (seen.has(ei.externalId)) { skippedDup += 1; continue; }
    seen.add(ei.externalId);
    out.push(ei);
  }

  console.log(
    `[sabuilders] walked ${slugs.length} slugs → ${out.length} events ` +
      `(skipped: ${skippedNoIcs} no-ics, ${skippedPast} past, ` +
      `${skippedInvalid} invalid, ${skippedDup} dup)`,
  );

  return out;
}
