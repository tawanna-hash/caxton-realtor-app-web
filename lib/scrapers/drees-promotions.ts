// lib/scrapers/drees-promotions.ts
//
// Drees Homes — Promotions scraper (Austin + San Antonio markets).
//
// Drees runs an Optimizely/Vue SPA at https://www.dreeshomes.com. Promotion
// pages live at:
//   /new-homes-austin/promotions/<slug>/
//   /new-homes-san-antonio/promotions/<slug>/
//
// Unlike the realtor page (client-rendered — NOT scrapable here), the
// promotion detail pages are server-rendered: the <title> and the full offer
// copy (rates, buydown terms, end dates) are present in the static HTML, so a
// plain fetch + cheerio parse is enough — no headless browser required.
//
// Discovery: the Drees sitemap.xml lists every promotion URL. We pull it once,
// filter to our two markets, and exclude:
//   - /archived-promotions/  (expired)
//   - /promotions-new/       (the market promotions index page, not an offer)
//   - /realtors/             (client-rendered relationship page — no SSR copy)
//
// Each promotion page yields:
//   - <title>            → row title (strip "New Home Promotion in <City>, TX | ")
//   - body offer copy    → row description (the rates/buydown/terms text)
//   - "ends July 31" /
//     "until June 30" /
//     "by September 30, 2026" → expiresAt (ISO; startsAt usually absent → null)
//   - og:image / first assetcloud hero img → thumbnailUrl
//   - the page URL        → sourceUrl
//
// Output rows have kind='promotion'. Drees' offer copy is scraped verbatim
// from dreeshomes.com's own marketing, so the cron auto-publishes to active
// (a human 'rejected' stamp is respected). Pruned via
// deleteStaleBuilderPromotions. See docs/promotion-scraper-template.md.

import * as cheerio from 'cheerio';
import type { UpsertScrapedInput, PromoType, Publication } from '../builder-inventory';

const BASE = 'https://www.dreeshomes.com';
const SITEMAP = `${BASE}/sitemap.xml`;

type Market = {
  segment: string; // 'new-homes-austin' | 'new-homes-san-antonio'
  publication: Publication;
  cityLabel: string;
};

const MARKETS: Market[] = [
  { segment: 'new-homes-austin', publication: 'realtyline', cityLabel: 'Greater Austin' },
  { segment: 'new-homes-san-antonio', publication: 'newsline', cityLabel: 'Greater San Antonio' },
];

export type DreesPromotionScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { url: string; reason: string }[];
};

const UA = 'Mozilla/5.0 (compatible; RealtyLine/1.0; +https://app.myrealtyline.com)';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Sitemap discovery ─────────────────────────────────────────────────────

// Pull every promotion URL for our markets out of the sitemap, excluding
// archived promos, the promotions index page, and the realtor relationship page.
function extractPromotionUrls(sitemapXml: string): { market: Market; url: string }[] {
  const urlRegex = /<loc>([^<]+)<\/loc>/g;
  const all: { market: Market; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(sitemapXml)) !== null) {
    const loc = m[1];
    for (const market of MARKETS) {
      const prefix = `${BASE}/${market.segment}/promotions/`;
      if (!loc.startsWith(prefix)) continue;
      const tail = loc.slice(prefix.length);
      if (!tail) continue;
      if (tail.startsWith('archived-promotions/')) continue; // expired
      if (tail === 'promotions-new/' || tail === 'promotions-new') continue; // index
      all.push({ market, url: loc });
      break;
    }
  }
  // dedupe by URL
  const seen = new Set<string>();
  return all.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}

// ── Date parsing ───────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

function iso(year: number, monthIdx: number, day: number): string | null {
  if (!Number.isFinite(year) || year < 2020 || year > 2099) return null;
  if (monthIdx < 0 || monthIdx > 11) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Find the offer's end date. Drees phrases it as:
//   "this special promotion ends July 31"
//   "going on now until June 30"
//   "finance through First Equity Mortgage by July 31"
//   "written by September 30, 2026"
// Returns ISO YYYY-MM-DD, or null. Year defaults to the current year when the
// copy omits it (Drees promo copy almost never states the year).
function parseEndDate(text: string): string | null {
  if (!text) return null;
  const cleaned = decodeEntities(text);
  const currentYear = new Date().getFullYear();

  // Look for a keyword anchor immediately before a "Month D[, YYYY]" date.
  // Anchors: ends | ending | end | until | through | by | expires | valid through
  const anchorRe =
    /(ends?|ending|until|through|by|expires?|valid\s+through)\s+([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i;
  const am = cleaned.match(anchorRe);
  if (am) {
    const mo = MONTHS[am[2].toLowerCase()];
    if (mo !== undefined) {
      const y = am[4] ? Number(am[4]) : currentYear;
      return iso(y, mo, Number(am[3]));
    }
  }

  // Fallback: first bare "Month D[, YYYY]" anywhere in the copy.
  const bare = cleaned.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/);
  if (bare) {
    const mo = MONTHS[bare[1].toLowerCase()];
    if (mo !== undefined) {
      const y = bare[3] ? Number(bare[3]) : currentYear;
      return iso(y, mo, Number(bare[2]));
    }
  }
  return null;
}

// ── promoType classification ──────────────────────────────────────────────

function classifyPromoType(title: string, description: string): PromoType {
  const blob = `${title} ${description}`.toLowerCase();
  if (/\b(realtor|broker|commission)\b/.test(blob)) return 'broker_bonus';
  if (/\b(buydown|buy-down|rate|apr|interest rate)\b/.test(blob)) return 'rate_buydown';
  if (/\b(grand opening|event|celebration|weekend)\b/.test(blob)) return 'event';
  if (/\b(closing cost|credit|flex cash|save \$|saving|upgrade|price)\b/.test(blob)) return 'incentive';
  return 'other';
}

// ── Detail page parsing ───────────────────────────────────────────────────

function metaContent($: cheerio.CheerioAPI, property: string): string | null {
  const v =
    $(`meta[property="${property}"]`).attr('content') ??
    $(`meta[name="${property}"]`).attr('content');
  return v ? decodeEntities(v) : null;
}

// Title from <title>: "New Home Promotion in Austin, TX | Cool Homes Hot Deals!"
// → "Cool Homes Hot Deals!"
function titleFromDoc($: cheerio.CheerioAPI): string | null {
  const raw = $('title').first().text().trim();
  if (!raw) return null;
  const pipe = raw.lastIndexOf('|');
  const name = pipe >= 0 ? raw.slice(pipe + 1) : raw;
  return decodeEntities(name) || decodeEntities(raw);
}

// The SSR body contains nav/footer chrome around the offer copy. The offer
// starts right after the "| <PromoName>" title and ends at the "© <year> The
// Drees Company" footer. Extract that slice as the description.
function descriptionFromDoc($: cheerio.CheerioAPI, fallbackTitle: string): string | null {
  // Drop scripts/styles/nav/footer before reading text.
  $('script, style, noscript').remove();
  const bodyText = decodeEntities($('body').text());
  if (!bodyText) return null;

  // Offer copy begins after the promo name; cut the footer + cookie chrome.
  let start = 0;
  const nameIdx = bodyText.indexOf(fallbackTitle);
  if (nameIdx >= 0) start = nameIdx + fallbackTitle.length;

  let end = bodyText.length;
  for (const marker of [
    '© 2026 The Drees Company',
    '© 2025 The Drees Company',
    '© The Drees Company',
    'Also of Interest',
    'Privacy Preference Center',
    'Strictly Necessary Cookies',
  ]) {
    const i = bodyText.indexOf(marker, start);
    if (i >= 0 && i < end) end = i;
  }
  let desc = bodyText.slice(start, end).trim();
  // Trim a leading promo-name repetition if present.
  desc = desc.replace(new RegExp(`^\\s*${escapeRe(fallbackTitle)}\\s*`, 'i'), '').trim();
  return desc ? desc.slice(0, 1200) : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// og:image, else the first assetcloud hero <img>, else null.
function thumbnailFromDoc($: cheerio.CheerioAPI): string | null {
  const og = metaContent($, 'og:image');
  if (og) return og;
  let found: string | null = null;
  $('img').each((_, el) => {
    if (found) return;
    const src = $(el).attr('src') ?? $(el).attr('data-src');
    if (src && /assetcloud\.dreeshomes\.com|cdn\.dreeshomes\.com/.test(src)) {
      found = src.startsWith('http') ? src : src.startsWith('//') ? `https:${src}` : `${BASE}${src}`;
    }
  });
  return found;
}

function slugFromUrl(url: string, market: Market): string {
  const prefix = `${BASE}/${market.segment}/promotions/`;
  return url.startsWith(prefix) ? url.slice(prefix.length).replace(/\/$/, '') : url;
}

async function parsePromotion(url: string, market: Market): Promise<UpsertScrapedInput | null> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);

  const title = titleFromDoc($);
  if (!title) return null;

  const description = descriptionFromDoc($, title);
  const thumbnailUrl = thumbnailFromDoc($);
  const expiresAt = parseEndDate(`${title} ${description ?? ''}`);
  const promoType = classifyPromoType(title, description ?? '');
  const slug = slugFromUrl(url, market);

  return {
    externalId: `drees-promotion/${market.segment}/${slug}`,
    kind: 'promotion',
    publication: market.publication,
    submittedByName: 'system:scraper-drees-promotions',
    submittedByEmail: 'scrapers@myrealtyline.com',
    builderName: 'Drees Homes',
    title,
    city: market.cityLabel,
    state: 'TX',
    description,
    bedsMin: null, bedsMax: null,
    bathsMin: null, bathsMax: null,
    sqftMin: null, sqftMax: null,
    priceMin: null, priceMax: null,
    flyerPdfUrl: null,
    thumbnailUrl,
    promoType,
    startsAt: null,
    expiresAt,
    sourceUrl: url,
  };
}

// ── Public entry ───────────────────────────────────────────────────────────

// A promo is expired if its parsed expiresAt is a past ISO date. We skip
// these so we never (re)publish an offer that has already ended — Drees often
// leaves expired promo pages in the sitemap after the offer's end date. A null
// expiresAt (no date found) is treated as not-expired (can't tell).
function isExpired(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return isoDate < today;
}

export async function fetchDreesPromotions(): Promise<DreesPromotionScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { url: string; reason: string }[] = [];

  let sitemapXml: string;
  try {
    sitemapXml = await fetchText(SITEMAP);
  } catch (err) {
    return {
      rows,
      rawCount: 0,
      skipped: [{ url: SITEMAP, reason: `sitemap fetch failed: ${(err as Error).message}` }],
    };
  }

  const targets = extractPromotionUrls(sitemapXml);
  const rawCount = targets.length;

  for (const { url, market } of targets) {
    try {
      const row = await parsePromotion(url, market);
      if (!row) {
        skipped.push({ url, reason: 'title missing on promotion page' });
        continue;
      }
      // Skip offers whose end date has already passed. Drees leaves expired
      // promo pages in the sitemap; we never (re)publish a past-date offer.
      if (isExpired(row.expiresAt)) {
        skipped.push({ url, reason: `expired (expiresAt ${row.expiresAt})` });
        continue;
      }
      rows.push(row);
    } catch (err) {
      skipped.push({ url, reason: `parse failed: ${(err as Error).message}` });
    }
  }

  return { rows, rawCount, skipped };
}
