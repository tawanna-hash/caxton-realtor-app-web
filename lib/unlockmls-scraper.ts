// caxton-events-v1
// TypeScript port of the Python scraper at scraper/unlockmls_scraper.py.
// Fetches calendar pages from unlockmls.com, follows event detail links,
// and produces EventInput rows ready to upsert into the events table.

import * as cheerio from 'cheerio';
import type { AnyNode, Element as DomElement } from 'domhandler';
import type { EventInput } from './events-store';

const BASE = 'https://www.unlockmls.com';
const CALENDAR_URL = `${BASE}/calendar`;
const PUBLICATION = 'austin' as const;
const SOURCE = 'unlockmls' as const;
const EVENT_NAME_PREFIX = 'ABOR: ';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TIME_RE =
  /\d{1,2}:\d{2}\s*[ap]m\s*[\-\u2010-\u2015\u2212]\s*\d{1,2}:\d{2}\s*[ap]m/i;
const TIME_RANGE_RE =
  /(\d{1,2}):(\d{2})\s*([ap]m)\s*[\-\u2010-\u2015\u2212]\s*(\d{1,2}):(\d{2})\s*([ap]m)/i;
const DATE_RE =
  /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/i;

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const REQUEST_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 20_000;

// ------------------------------ helpers ------------------------------------

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Fetch ${url} -> ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function calendarUrlFor(year: number, month: number): string {
  return `${CALENDAR_URL}?day=1&month=${month}&year=${year}`;
}

function slugFromUrl(url: string): string {
  const path = url.replace(/\/+$/, '').split('/');
  return path[path.length - 1] || url;
}

function to24h(hour: number, minute: number, ampm: string): [number, number] {
  const ap = ampm.toLowerCase();
  if (ap === 'am') return [hour === 12 ? 0 : hour, minute];
  return [hour === 12 ? 12 : hour + 12, minute];
}

function parseStartEnd(
  dateStr: string,
  timeStr: string,
): [string | null, string | null] {
  if (!dateStr) return [null, null];
  const dateMatch = DATE_RE.exec(dateStr);
  if (!dateMatch) return [null, null];
  const year = parseInt(dateMatch[4], 10);
  const monthName = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
  const month = MONTHS[monthName];
  const day = parseInt(dateMatch[3], 10);
  const dateIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (!timeStr) return [`${dateIso}T00:00:00`, null];

  const tm = TIME_RANGE_RE.exec(timeStr);
  if (!tm) return [`${dateIso}T00:00:00`, null];

  const [sh, sm] = to24h(parseInt(tm[1], 10), parseInt(tm[2], 10), tm[3]);
  const [eh, em] = to24h(parseInt(tm[4], 10), parseInt(tm[5], 10), tm[6]);
  return [
    `${dateIso}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`,
    `${dateIso}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`,
  ];
}

// ------------------------------ calendar parsing ---------------------------

interface Listing {
  url: string;
  time: string;
}

/**
 * Walk up from `el` until we find the smallest ancestor that contains exactly
 * one event-link descendant — i.e. the card wrapping just this one event.
 * Mirrors `_smallest_card_ancestor` in the Python scraper.
 */
function smallestCardAncestor(
  $: cheerio.CheerioAPI,
  el: AnyNode,
): cheerio.Cheerio<AnyNode> {
  const eventHref = /^\/(class|event)\//;
  let node: cheerio.Cheerio<AnyNode> = $(el).parent();
  for (let i = 0; i < 10 && node.length > 0 && (node[0] as DomElement).tagName !== 'body'; i += 1) {
    let cnt = 0;
    node.find('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (eventHref.test(href)) {
        cnt += 1;
        if (cnt > 1) return false; // break out
      }
      return undefined;
    });
    if (cnt === 1) return node;
    node = node.parent();
  }
  return $(el);
}

export function parseCalendar(html: string): Listing[] {
  const $ = cheerio.load(html);
  const found = new Map<string, Listing>();

  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!/^\/(class|event)\//.test(href)) return;

    const url = new URL(href, BASE).toString();
    const card = smallestCardAncestor($, a);
    const cardText = clean(card.text());
    const tm = TIME_RE.exec(cardText);
    const time = tm ? clean(tm[0]) : '';
    const key = `${url}|${time}`;
    if (!found.has(key)) found.set(key, { url, time });
  });

  return Array.from(found.values());
}

// ------------------------------ detail page parsing ------------------------

interface Detail {
  title: string;
  description: string;
  location: string;
  date: string;
  courseNumber: string;
  provider: string;
  memberPrice: string;
  nonmemberPrice: string;
  instructor: string;
  instructorImage: string;
  registerUrl: string;
}

/**
 * Find the value following a labelled section. The detail pages render as
 * pairs of sibling blocks — first a label like "Date", then a value block.
 */
function labelValue($: cheerio.CheerioAPI, label: string): string {
  let result = '';
  $('*').each((_, el) => {
    if (result) return false;
    const $el = $(el);
    const text = clean($el.contents().filter((_, n) => n.type === 'text').text());
    if (text.toLowerCase() !== label.toLowerCase()) return undefined;
    // Walk siblings of this node and its ancestors to find the next non-empty text
    let cursor: cheerio.Cheerio<AnyNode> | null = $el;
    while (cursor && cursor.length) {
      let sib = cursor.next();
      while (sib.length) {
        const t = clean(sib.text());
        if (t) {
          result = t;
          return false;
        }
        sib = sib.next();
      }
      const parent: cheerio.Cheerio<AnyNode> = cursor.parent();
      if (!parent.length || (parent[0] as DomElement).tagName === 'body') break;
      cursor = parent;
    }
    return undefined;
  });
  return result;
}

export function parseDetail(html: string, _sourceUrl: string): Detail {
  const $ = cheerio.load(html);
  const detail: Detail = {
    title: '',
    description: '',
    location: '',
    date: '',
    courseNumber: '',
    provider: '',
    memberPrice: '',
    nonmemberPrice: '',
    instructor: '',
    instructorImage: '',
    registerUrl: '',
  };

  const h1 = $('h1').first();
  if (h1.length) detail.title = clean(h1.text());

  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) detail.description = clean(metaDesc);
  if (!detail.description && h1.length) {
    const p = h1.nextAll('p').first();
    if (p.length) detail.description = clean(p.text());
  }

  // Register link — the first anchor whose text is "Register Now"
  $('a').each((_, a) => {
    const txt = clean($(a).text());
    if (/register\s*now/i.test(txt) && $(a).attr('href')) {
      if (!detail.registerUrl) detail.registerUrl = new URL($(a).attr('href')!, BASE).toString();
    }
  });

  // Location block — typically venue name + room. Take first 1-2 non-empty lines
  // following the "Location" header, stopping at the next section.
  let locFound = false;
  const locationLines: string[] = [];
  $('*').each((_, el) => {
    if (locFound) return false;
    const text = clean($(el).contents().filter((_, n) => n.type === 'text').text());
    if (text === 'Location') {
      // Walk siblings of the parent collecting up to 2 lines
      let cursor: cheerio.Cheerio<AnyNode> | null = $(el);
      while (cursor && cursor.length && locationLines.length < 3) {
        let sib = cursor.next();
        while (sib.length && locationLines.length < 3) {
          const t = clean(sib.text());
          if (t) {
            if (/^(Details|Availability|Instructors?)\b/i.test(t)) {
              locFound = true;
              return false;
            }
            if (t.toLowerCase() !== 'location') locationLines.push(t);
          }
          sib = sib.next();
        }
        const parent: cheerio.Cheerio<AnyNode> = cursor.parent();
        if (!parent.length || (parent[0] as DomElement).tagName === 'body') break;
        cursor = parent;
      }
      locFound = true;
      return false;
    }
    return undefined;
  });
  detail.location = locationLines.slice(0, 2).join(' \u2014 ');

  detail.date = labelValue($, 'Date');
  detail.courseNumber = labelValue($, 'Course Number');
  detail.provider = labelValue($, 'Provider');
  detail.memberPrice = labelValue($, 'Member/Subscriber Price');
  detail.nonmemberPrice = labelValue($, 'Non-Member Price');

  // Instructor: <img alt="Instructor" src="..."/> + the name following an
  // "Instructor" label inside the Instructors section.
  const instructorImg = $('img[alt="Instructor"]').first().attr('src');
  if (instructorImg) detail.instructorImage = new URL(instructorImg, BASE).toString();
  detail.instructor = labelValue($, 'Instructor');

  return detail;
}

// ------------------------------ orchestration ------------------------------

export async function collectListings(months: number): Promise<Listing[]> {
  const today = new Date();
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth() + 1;
  const seen = new Set<string>();
  const out: Listing[] = [];

  for (let i = 0; i < months; i += 1) {
    const url = i === 0 ? CALENDAR_URL : calendarUrlFor(year, month);
    const html = await fetchHtml(url);
    const listings = parseCalendar(html);
    for (const l of listings) {
      if (!seen.has(l.url)) {
        seen.add(l.url);
        out.push(l);
      }
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return out;
}

export async function enrichListings(listings: Listing[]): Promise<EventInput[]> {
  const events: EventInput[] = [];
  for (const l of listings) {
    try {
      const html = await fetchHtml(l.url);
      const d = parseDetail(html, l.url);
      if (!d.title) {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const [startIso, endIso] = parseStartEnd(d.date, l.time);
      events.push({
        externalSource: SOURCE,
        externalId: slugFromUrl(l.url),
        publication: PUBLICATION,
        title: `${EVENT_NAME_PREFIX}${d.title}`,
        description: d.description || null,
        link: d.registerUrl || l.url || null,
        startDate: startIso,
        endDate: endIso,
        location: d.location || null,
        organizer: d.provider || null,
        organizerEmail: null,
        website: d.registerUrl || null,
        tags: null,
        format: null,
        courseNumber: d.courseNumber || null,
        memberPrice: d.memberPrice || null,
        nonmemberPrice: d.nonmemberPrice || null,
        imageUrl: null,
        imageThumb: d.instructorImage || null,
        lat: null,
        lng: null,
      });
    } catch (err) {
      console.warn('[unlockmls] detail fetch failed', l.url, err);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return events;
}

/**
 * Top-level orchestration. Scrapes `months` worth of calendar pages, follows
 * each event link, and returns a list of EventInputs ready for upsert.
 */
export async function scrapeUnlockMls(months = 3): Promise<EventInput[]> {
  const listings = await collectListings(months);
  const events = await enrichListings(listings);
  return events;
}
