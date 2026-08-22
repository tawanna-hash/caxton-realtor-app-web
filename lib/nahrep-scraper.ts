// caxton-events-v1
// NAHREP — National Association of Hispanic Real Estate Professionals.
// Scopes to the San Antonio chapter for the Newsline San Antonio calendar.
//
// Source: https://nahrep.memberclicks.net/index.php?option=com_jevents...
//         MemberClicks CMS with JEvents (Joomla) component.
//
// JEvents publishes a few interesting endpoints:
//   - task=year.listevents   → 12 months of events as <a icalrepeat.detail> links
//                              with title text in the anchor, date in the URL.
//   - task=icalrepeat.detail → HTML detail page with .event-start-date,
//                              .event-start-time, .event-stop-time spans plus a
//                              Register link table.
//   - task=icals.icalevent   → real RFC-5545 iCalendar export for one event,
//                              with VEVENT containing DTSTART/DTEND/UID/SUMMARY.
//
// Strategy:
//   a. GET the year list page anchored at "today" → harvest every
//      icalrepeat.detail link, extract { evid, uid, year, month, day, title }.
//   b. Keep only events whose title starts with "NAHREP San Antonio" (case
//      insensitive). This is the per-chapter filter for the Newsline San Antonio pub.
//   c. For each kept event, GET the icals.icalevent ICS export to get the
//      authoritative DTSTART/DTEND. NAHREP labels every chapter's ICS with
//      TZID=America/Denver but the wall-clock time is the chapter's *local*
//      time, so we reinterpret the wall clock in America/Chicago for SA.
//   d. GET the detail HTML to harvest the Register URL (table cell <a> with
//      a register-here image button) and any inline image.
//
// publication='san_antonio', source='nahrep', prefix 'NAHREP: '.

import type { EventInput, Publication } from './events-store';

const BASE = 'https://nahrep.memberclicks.net';
const SOURCE = 'nahrep' as const;
const EVENT_NAME_PREFIX = 'NAHREP: ';

interface ChapterConfig {
  /** Newsline San Antonio publication this chapter feeds (san_antonio or austin). */
  publication: Publication;
  /** Human-readable chapter name, e.g. "NAHREP San Antonio". */
  organizer: string;
  /** Regex that matches event titles belonging to this chapter (case-insensitive). */
  prefixRe: RegExp;
  /** Regex used to strip the chapter prefix from event titles. */
  stripRe: RegExp;
  /** Short log tag, e.g. 'san_antonio' or 'austin'. */
  logTag: string;
}

const CHAPTER_SAN_ANTONIO: ChapterConfig = {
  publication: 'san_antonio',
  organizer: 'NAHREP San Antonio',
  prefixRe: /^nahrep\s+san\s+antonio\b/i,
  stripRe: /^nahrep\s+san\s+antonio\s*[:\-–—]\s*/i,
  logTag: 'san_antonio',
};

const CHAPTER_AUSTIN: ChapterConfig = {
  publication: 'austin',
  organizer: 'NAHREP Austin',
  prefixRe: /^nahrep\s+austin\b/i,
  stripRe: /^nahrep\s+austin\s*[:\-–—]\s*/i,
  logTag: 'austin',
};

const FETCH_TIMEOUT_MS = 20_000;
const REQUEST_DELAY_MS = 150;
const VIRTUAL_RE = /\b(virtual|zoom|teams|webinar|online|gotomeeting)\b/i;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';

// ---------------------------- helpers --------------------------------------

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
}

function stripTags(html: string): string {
  return clean(decodeEntities(html.replace(/<[^>]+>/g, ' ')));
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
    if (!res.ok) throw new Error(`NAHREP fetch ${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// US Central (America/Chicago) DST: 2nd Sunday of March → 1st Sunday of November.
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (weekday - first + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function isCdt(year: number, month0: number, day: number, hour: number): boolean {
  const dstStart = nthWeekdayOfMonth(year, 2, 0, 2); // Mar, 2nd Sunday
  const dstEnd = nthWeekdayOfMonth(year, 10, 0, 1);  // Nov, 1st Sunday
  // Comparable integer YMDH
  const ymdh = year * 1_000_000 + (month0 + 1) * 10_000 + day * 100 + hour;
  const startYmdh = year * 1_000_000 + 3 * 10_000 + dstStart * 100 + 2;
  const endYmdh   = year * 1_000_000 + 11 * 10_000 + dstEnd * 100 + 2;
  return ymdh >= startYmdh && ymdh < endYmdh;
}

/**
 * Convert wall-clock America/Chicago Y/M/D h:m to an ISO UTC string.
 * Hand-rolled to avoid pulling in a TZ library on Vercel cold starts.
 */
function centralToIso(year: number, month0: number, day: number, hour: number, minute: number): string {
  const cdt = isCdt(year, month0, day, hour);
  const offset = cdt ? 5 : 6; // CDT = UTC-5, CST = UTC-6
  const utc = Date.UTC(year, month0, day, hour + offset, minute);
  return new Date(utc).toISOString();
}

// ---------------------------- ICS parsing ----------------------------------

interface IcsEvent {
  uid: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  /** Local Y/M/D h:m as listed in the VEVENT (timezone ignored — NAHREP labels
   *  everything America/Denver, but the wall clock is the chapter's local).
   */
  start: { y: number; m0: number; d: number; h: number; min: number } | null;
  end:   { y: number; m0: number; d: number; h: number; min: number } | null;
  allDay: boolean;
}

function unfoldIcs(raw: string): string[] {
  // RFC 5545 line folding: a CRLF followed by whitespace continues the prior line.
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (out.length && (line.startsWith(' ') || line.startsWith('\t'))) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(value: string): IcsEvent['start'] {
  // Accept "YYYYMMDDTHHMMSS", "YYYYMMDDTHHMMSSZ", or "YYYYMMDD" (all-day).
  const m =
    value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/) ||
    value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const m0 = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const h = m[4] ? parseInt(m[4], 10) : 0;
  const min = m[5] ? parseInt(m[5], 10) : 0;
  return { y, m0, d, h, min };
}

function parseIcsEvent(raw: string): IcsEvent | null {
  const lines = unfoldIcs(raw);
  let inEvent = false;
  const event: IcsEvent = {
    uid: null,
    summary: null,
    description: null,
    location: null,
    start: null,
    end: null,
    allDay: false,
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; continue; }
    if (line === 'END:VEVENT')   { inEvent = false; continue; }
    if (!inEvent) continue;
    // Split on first ":" but preserve parameters before it (e.g. DTSTART;TZID=...:value)
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name] = head.split(';');
    const params = head.slice(name.length + 1);
    switch (name) {
      case 'UID':         event.uid         = value.trim(); break;
      case 'SUMMARY':     event.summary     = unescapeIcsText(value); break;
      case 'DESCRIPTION': event.description = unescapeIcsText(value); break;
      case 'LOCATION':    event.location    = unescapeIcsText(value); break;
      case 'DTSTART':
        event.start  = parseIcsDate(value);
        event.allDay = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(value);
        break;
      case 'DTEND':
        event.end = parseIcsDate(value);
        break;
    }
  }
  return event.start ? event : null;
}

// ---------------------------- year list parsing ----------------------------

interface EventLink {
  url: string;        // absolute icalrepeat.detail URL
  evid: string;
  uid: string;
  year: number;
  month: number;      // 1-12
  day: number;
  title: string;      // text from anchor
}

function parseYearList(html: string): EventLink[] {
  const out: EventLink[] = [];
  // Anchors look like:
  //   <a href="/index.php?option=com_jevents&amp;task=icalrepeat.detail&amp;evid=NNN
  //     &amp;Itemid=147&amp;year=YYYY&amp;month=MM&amp;day=DD&amp;title=...
  //     &amp;uid=HEX[&amp;catids=22]">Title text</a>
  const re = /<a\s+href="(\/index\.php\?option=com_jevents&amp;task=icalrepeat\.detail&amp;[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]);
    const title = clean(decodeEntities(m[2]));
    if (!title) continue;
    const evid  = /[?&]evid=(\d+)/.exec(href)?.[1];
    const uid   = /[?&]uid=([a-f0-9]+)/.exec(href)?.[1];
    const year  = /[?&]year=(\d{4})/.exec(href)?.[1];
    const month = /[?&]month=(\d{1,2})/.exec(href)?.[1];
    const day   = /[?&]day=(\d{1,2})/.exec(href)?.[1];
    if (!evid || !uid || !year || !month || !day) continue;
    const key = `${evid}:${year}-${month}-${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url:   `${BASE}${href}`,
      evid,
      uid,
      year:  parseInt(year, 10),
      month: parseInt(month, 10),
      day:   parseInt(day, 10),
      title,
    });
  }
  return out;
}

// ---------------------------- detail page parsing --------------------------

interface DetailExtras {
  registerUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  location: string | null;
}

function parseDetail(html: string): DetailExtras {
  const out: DetailExtras = {
    registerUrl: null,
    imageUrl: null,
    description: null,
    location: null,
  };

  // Find the central event content. Use the event-time div as anchor and
  // bound by the <!-- comment of the legacy template.
  const start = html.indexOf('event-time');
  const end = html.indexOf('<!--', start > 0 ? start : 0);
  const body = start > 0 ? html.slice(start, end > 0 ? end : start + 8000) : html;

  // Register URL: <a href="..."><img src=".../register-here.png">
  const regMatch = /<a\s+href="([^"]+)"[^>]*>\s*<img[^>]+register-here[^>]*>/i.exec(body);
  if (regMatch) out.registerUrl = decodeEntities(regMatch[1]).trim();

  // Image: first big <img> in body that is not the register button
  const imgs = [...body.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)];
  for (const im of imgs) {
    const src = decodeEntities(im[1]);
    if (/register-here/i.test(src)) continue;
    if (/(spacer|pixel|blank)\.(gif|png)$/i.test(src)) continue;
    out.imageUrl = src.startsWith('http') ? src : `${BASE}${src.startsWith('/') ? '' : '/'}${src}`;
    break;
  }

  // Location: JEvents sometimes renders venue in a span; look for any obvious
  // venue/address hints in the detail body.
  const locMatch = /<(?:span|div)[^>]*class="[^"]*event-location[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i.exec(body);
  if (locMatch) {
    const txt = stripTags(locMatch[1]);
    if (txt) out.location = txt;
  }

  // Description: strip nav/buttons and grab any plain paragraphs.
  // Skip when empty.
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((x) => stripTags(x[1]))
    .filter((p) => p.length > 0 && !/register here/i.test(p));
  if (paras.length) {
    const joined = paras.join('\n\n').slice(0, 1500);
    if (joined.length >= 20) out.description = joined;
  }

  return out;
}

// ---------------------------- main scraper ---------------------------------

async function scrapeNahrepChapter(chapter: ChapterConfig, months = 12): Promise<EventInput[]> {
  const monthsClamped = Math.max(1, Math.min(months, 12));
  const today = new Date();
  // year.listevents anchors a rolling 12 months at year/month/day; just pass today.
  const url =
    `${BASE}/index.php?option=com_jevents&task=year.listevents&Itemid=147` +
    `&year=${today.getUTCFullYear()}` +
    `&month=${String(today.getUTCMonth() + 1).padStart(2, '0')}` +
    `&day=${String(today.getUTCDate()).padStart(2, '0')}`;

  let listHtml: string;
  try {
    listHtml = await fetchText(url);
  } catch (err) {
    console.warn(`[nahrep:${chapter.logTag}] year list fetch failed`, err);
    return [];
  }

  const all = parseYearList(listHtml);
  const matched = all.filter((e) => chapter.prefixRe.test(e.title));
  console.log(`[nahrep:${chapter.logTag}] list=${all.length} matched=${matched.length}`);

  if (matched.length === 0) return [];

  // Cutoff: drop events more than `monthsClamped` months past today.
  const cutoff = new Date(today);
  cutoff.setUTCMonth(cutoff.getUTCMonth() + monthsClamped);

  const out: EventInput[] = [];
  for (const link of matched) {
    const eventDate = new Date(Date.UTC(link.year, link.month - 1, link.day));
    if (eventDate > cutoff) continue;
    if (eventDate < new Date(today.getTime() - 24 * 3600 * 1000)) {
      // Skip past events older than yesterday.
      continue;
    }

    // Fetch ICS for authoritative date/time + detail for register link & image.
    const icsUrl =
      `${BASE}/index.php?option=com_jevents&task=icals.icalevent` +
      `&template=component&evid=${link.evid}&Itemid=147`;

    let ics: string | null = null;
    let detailHtml: string | null = null;
    try { ics = await fetchText(icsUrl); } catch (err) {
      console.warn(`[nahrep:${chapter.logTag}] ics fetch failed evid=${link.evid}`, err);
    }
    await sleep(REQUEST_DELAY_MS);
    try { detailHtml = await fetchText(link.url); } catch (err) {
      console.warn(`[nahrep:${chapter.logTag}] detail fetch failed evid=${link.evid}`, err);
    }
    await sleep(REQUEST_DELAY_MS);

    let startIso: string | null = null;
    let endIso: string | null = null;
    let summary: string = link.title;
    let icsLocation: string | null = null;
    let icsDescription: string | null = null;

    if (ics) {
      const ev = parseIcsEvent(ics);
      if (ev) {
        if (ev.summary) summary = ev.summary;
        if (ev.location) icsLocation = ev.location;
        if (ev.description) icsDescription = ev.description;
        if (ev.start) {
          // NAHREP labels the timezone America/Denver on every event, but the
          // wall-clock is the *chapter's* local time. Austin and San Antonio
          // are both America/Chicago.
          const s = ev.start;
          if (ev.allDay) {
            startIso = new Date(Date.UTC(s.y, s.m0, s.d)).toISOString();
          } else {
            startIso = centralToIso(s.y, s.m0, s.d, s.h, s.min);
          }
        }
        if (ev.end) {
          const e = ev.end;
          if (ev.allDay) {
            endIso = new Date(Date.UTC(e.y, e.m0, e.d)).toISOString();
          } else {
            endIso = centralToIso(e.y, e.m0, e.d, e.h, e.min);
          }
        }
      }
    }

    // Fallback: if ICS gave us no date, use the URL date at midnight Central.
    if (!startIso) {
      startIso = centralToIso(link.year, link.month - 1, link.day, 9, 0);
    }

    const detail = detailHtml ? parseDetail(detailHtml) : {
      registerUrl: null, imageUrl: null, description: null, location: null,
    };

    // Title: strip the chapter prefix so the UI prefix doesn't repeat.
    // "NAHREP San Antonio: San Antonio Top 100 Gala" → "San Antonio Top 100 Gala"
    // "NAHREP Austin: Wealth and Business Rally" → "Wealth and Business Rally"
    const stripped = summary.replace(chapter.stripRe, '').trim() || summary;
    const title = `${EVENT_NAME_PREFIX}${stripped}`;

    const location = clean(detail.location || icsLocation || '') || null;
    const rawDesc = clean(detail.description || icsDescription || '');
    const description = rawDesc.length >= 20 ? rawDesc : null;
    const isVirtual =
      (location && VIRTUAL_RE.test(location)) ||
      (description && VIRTUAL_RE.test(description));

    out.push({
      externalSource: SOURCE,
      externalId: `nahrep-${link.evid}-${link.year}-${String(link.month).padStart(2, '0')}-${String(link.day).padStart(2, '0')}`,
      publication: chapter.publication,
      title,
      description,
      link: detail.registerUrl || link.url,
      startDate: startIso,
      endDate: endIso,
      location,
      organizer: chapter.organizer,
      website: link.url,
      tags: 'NAHREP',
      format: isVirtual ? 'Virtual' : 'In-Person',
      imageUrl: detail.imageUrl,
    });
  }

  console.log(`[nahrep:${chapter.logTag}] produced ${out.length} events`);
  return out;
}

/**
 * Scrape ALL configured NAHREP chapters (San Antonio + Austin) in one pass.
 * The cron route uses this so pruneStale('nahrep') can run safely without
 * accidentally deleting one chapter's rows after only the other was refreshed.
 */
export async function scrapeNahrepAll(months = 12): Promise<EventInput[]> {
  const [sa, austin] = await Promise.all([
    scrapeNahrepChapter(CHAPTER_SAN_ANTONIO, months),
    scrapeNahrepChapter(CHAPTER_AUSTIN, months),
  ]);
  return [...sa, ...austin];
}
