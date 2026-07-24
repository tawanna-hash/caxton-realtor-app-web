// lib/scrapers/mi-homes-incentives.ts
//
// Scrapes M/I Homes' market-scoped incentives surfaces:
//   /new-homes/texas/greater-austin/incentives
//   /new-homes/texas/greater-san-antonio/incentives
//
// Each market page lists 1–6 incentive detail pages. Each detail page has:
//   - og:title         → row title (we strip the " - Greater X - M/I Homes" tail)
//   - og:description   → row description
//   - og:image         → row thumbnailUrl
//   - <h3>May 1 - 17, 2026</h3>  → start/end DATE range (sometimes absent)
//
// Output rows have kind='promotion'. Per S14 edit in upsertBuilderInventoryByExternalId,
// scraped promotion rows land as status='pending' (NOT auto-active). A human reviews
// legal text + dates + participating communities before publishing.
//
// Run via /api/cron/scrape-mi-homes-incentives (CRON_SECRET-gated in prod, daily at 14 UTC).

import * as cheerio from 'cheerio';
import type { UpsertScrapedInput, PromoType, Publication } from '../builder-inventory';

const BASE = 'https://www.mihomes.com';

type Market = {
  segment: 'greater-austin' | 'greater-san-antonio';
  publication: Publication;
  cityLabel: string;
};

const MARKETS: Market[] = [
  { segment: 'greater-austin',     publication: 'realtyline', cityLabel: 'Greater Austin' },
  { segment: 'greater-san-antonio', publication: 'newsline',   cityLabel: 'Greater San Antonio' },
];

export type IncentiveScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { url: string; reason: string }[];
};

const UA = 'Mozilla/5.0 (compatible; RealtyLine/1.0; +https://app.myrealtyline.com)';

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

// Find incentive detail URLs on a market index page.
// They all live under /new-homes/texas/<market>/incentives/<slug>.
function extractIncentiveLinks($: cheerio.CheerioAPI, market: Market): string[] {
  const prefix = `/new-homes/texas/${market.segment}/incentives/`;
  const found = new Set<string>();
  $(`a[href*="${prefix}"]`).each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    // Only detail pages — not the index itself
    if (href === prefix || href === prefix.replace(/\/$/, '')) return;
    const abs = href.startsWith('http') ? href : BASE + href;
    // Strip query/hash for dedup
    found.add(abs.split('?')[0].split('#')[0]);
  });
  return Array.from(found);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTitleTail(raw: string): string {
  // "2026 FHA Bouquet of Homes - Greater Austin - M/I Homes" → "2026 FHA Bouquet of Homes"
  // Also handles "Higher Standards - Greater San Antonio - M/I Homes"
  // and the generic "New Home Incentives in Austin - M/I Homes" tail.
  return raw
    .replace(/\s*-\s*Greater\s+\w[\w\s]*\s*-\s*M\/I Homes\s*$/i, '')
    .replace(/\s*-\s*M\/I Homes\s*$/i, '')
    .trim();
}

function classifyPromoType(title: string, description: string): PromoType {
  const blob = `${title} ${description}`.toLowerCase();
  if (/\b(rate|apr|buydown|buy-down|%)\b/.test(blob)) return 'rate_buydown';
  return 'incentive';
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

// Returns [startsAt, expiresAt] as ISO YYYY-MM-DD strings, or [null, null] on any failure.
// Recognized formats (case-insensitive):
//   "May 1 - 17, 2026"
//   "May 1 - June 30, 2026"
//   "May 1, 2026 - July 31, 2026"
function parseDateRange(text: string): [string | null, string | null] {
  if (!text) return [null, null];
  const clean = decodeEntities(text);

  // Pattern A: "Mon D - D, YYYY" (same month)
  let m = clean.match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo === undefined) return [null, null];
    const y = Number(m[4]);
    return [iso(y, mo, Number(m[2])), iso(y, mo, Number(m[3]))];
  }

  // Pattern B: "Mon D - Mon D, YYYY" (cross-month)
  m = clean.match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m) {
    const moStart = MONTHS[m[1].toLowerCase()];
    const moEnd = MONTHS[m[3].toLowerCase()];
    if (moStart === undefined || moEnd === undefined) return [null, null];
    const y = Number(m[5]);
    return [iso(y, moStart, Number(m[2])), iso(y, moEnd, Number(m[4]))];
  }

  // Pattern C: "Mon D, YYYY - Mon D, YYYY" (full both sides)
  m = clean.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const moStart = MONTHS[m[1].toLowerCase()];
    const moEnd = MONTHS[m[4].toLowerCase()];
    if (moStart === undefined || moEnd === undefined) return [null, null];
    return [iso(Number(m[3]), moStart, Number(m[2])), iso(Number(m[6]), moEnd, Number(m[5]))];
  }

  return [null, null];
}

function iso(year: number, monthIdx: number, day: number): string | null {
  if (!Number.isFinite(year) || year < 2020 || year > 2099) return null;
  if (monthIdx < 0 || monthIdx > 11) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function metaContent($: cheerio.CheerioAPI, property: string): string | null {
  const v = $(`meta[property="${property}"]`).attr('content') ?? $(`meta[name="${property}"]`).attr('content');
  return v ? decodeEntities(v) : null;
}

function slugFromUrl(url: string, market: Market): string {
  const prefix = `${BASE}/new-homes/texas/${market.segment}/incentives/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

async function parseDetail(url: string, market: Market): Promise<UpsertScrapedInput | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const rawTitle = metaContent($, 'og:title');
  const description = metaContent($, 'og:description');
  const thumb = metaContent($, 'og:image');

  // Prefer the detail page's real promo headline over the generic og:title
  // (og:title is "New Home Incentives in Austin - M/I Homes").
  const headline = $('h1.single-incentive__headline').first().text().trim();
  const title = headline || stripTitleTail(rawTitle ?? '');
  if (!title) return null;

  const slug = slugFromUrl(url, market);

  // Date range: first <h3> whose text looks like a date range. Robust against
  // nav/footer <h3>s that may appear before the content one.
  let dateText = '';
  $('h3').each((_, el) => {
    if (dateText) return;
    const t = $(el).text().trim();
    if (/\d{4}/.test(t) && /[A-Za-z]+\s+\d/.test(t)) dateText = t;
  });
  const [startsAt, expiresAt] = parseDateRange(dateText);

  // Participating communities — server-rendered .featured-grid-title list.
  const communities: string[] = [];
  $('.featured-grid-title').each((_, el) => {
    const n = decodeEntities($(el).text());
    if (n && !communities.includes(n)) communities.push(n);
  });
  const enrichedDescription = communities.length
    ? `${description ?? ''}\n\nParticipating communities: ${communities.join(', ')}`.trim()
    : description;

  const promoType = classifyPromoType(title, enrichedDescription ?? '');

  return {
    externalId: `mi-homes-incentive/${market.segment}/${slug}`,
    kind: 'promotion',
    publication: market.publication,
    submittedByName: 'system:scraper-mi-homes-incentives',
    submittedByEmail: 'scrapers@myrealtyline.com',
    builderName: 'M/I Homes',
    title,
    city: market.cityLabel,
    state: 'TX',
    description: enrichedDescription,
    bedsMin: null, bedsMax: null,
    bathsMin: null, bathsMax: null,
    sqftMin: null, sqftMax: null,
    priceMin: null, priceMax: null,
    flyerPdfUrl: null,
    thumbnailUrl: thumb,
    promoType,
    startsAt,
    expiresAt,
    sourceUrl: url,
  };
}

export async function fetchMIHomesIncentives(): Promise<IncentiveScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { url: string; reason: string }[] = [];
  let rawCount = 0;

  for (const market of MARKETS) {
    const indexUrl = `${BASE}/new-homes/texas/${market.segment}/incentives`;
    let indexHtml: string;
    try {
      indexHtml = await fetchHtml(indexUrl);
    } catch (err) {
      skipped.push({ url: indexUrl, reason: `index fetch failed: ${(err as Error).message}` });
      continue;
    }

    const $ = cheerio.load(indexHtml);
    const detailUrls = extractIncentiveLinks($, market);
    rawCount += detailUrls.length;

    for (const url of detailUrls) {
      try {
        const row = await parseDetail(url, market);
        if (row) rows.push(row);
        else skipped.push({ url, reason: 'og:title missing on detail page' });
      } catch (err) {
        skipped.push({ url, reason: `detail parse failed: ${(err as Error).message}` });
      }
    }
  }

  return { rows, rawCount, skipped };
}
