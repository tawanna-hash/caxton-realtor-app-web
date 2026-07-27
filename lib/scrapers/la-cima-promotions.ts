// lib/scrapers/la-cima-promotions.ts
//
// La Cima (developer) — builder promotions/incentives scraper.
//
// Source: https://lacimatx.com/builder-promotions/
//
// The page is a static WP Bakery / Salient grid. Each promo is a column
// (.vc_col-sm-3.wpb_column) containing:
//   - <a href="<flyer_url>"> — usually a JPG image, occasionally a PDF
//   - <img src="<flyer_image>"> — promo flyer (always a JPG/PNG)
//   - <h2 class="vc_custom_heading">Builder Name</h2>
//
// We attribute every row to builder_name='La Cima' (the master-planned
// developer). The actual builder is preserved in title + description so
// it shows up on the Promotions tab of the La Cima developer page.
//
// Attempt to extract an expiration date from the file name when present.
// File names follow patterns like:
//   v2_Highland-Promo-Expiration-5-31-2026.jpg
//   v2_David-Weekley-Promo-Expiration-Range-3-20-2026-through-3-60-2026.pdf
//   Newmark-LaCima_May-BTO-Incentive-Expiration-5-31-2026.jpg
//
// We pull the LAST date in the file name as the expiration date.
//
// Output rows have kind='promotion'. Per the SRR auto-activate policy
// established in S14, the cron route flips newly-created La Cima promo
// rows to status='active' so they're immediately public. Existing rows
// keep their human-set status.

import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';
import type { UpsertScrapedInput } from '../builder-inventory';
import { isPromotionExpired } from './promotion-utils';

const PROMOTIONS_URL = 'https://lacimatx.com/builder-promotions/';
const LA_CIMA_CITY = 'San Marcos';
const LA_CIMA_STATE = 'TX';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

export type LaCimaPromoScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; builder?: string }[];
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    method: 'GET',
    headers: COMMON_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  if (!html || html.length < 1000) {
    throw new Error(`Body suspiciously small from ${url}`);
  }
  return html;
}

function pickImageUrl($img: cheerio.Cheerio<DomElement>): string | null {
  const cands = [
    $img.attr('src'),
    $img.attr('data-src'),
    $img.attr('nitro-lazy-src'),
  ];
  for (const c of cands) {
    if (!c) continue;
    if (c.startsWith('data:')) continue;
    return c;
  }
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Pull the last MM-DD-YYYY (or M-D-YYYY) date out of a file name. We
// take the LAST one because filenames sometimes encode a date range
// ("Range-3-20-2026-through-3-60-2026") where the second is the end.
// Returns null if no plausible date is found, or if the parsed date
// fails validation (e.g. month 13, day 60).
function expirationDateFromFilename(url: string | null): string | null {
  if (!url) return null;
  const name = url.split('/').pop() ?? '';
  // Strip the extension to avoid matching ".jpg" or other digit-y suffixes.
  const stem = name.replace(/\.[a-z0-9]+$/i, '');
  const matches = [...stem.matchAll(/(\d{1,2})-(\d{1,2})-(\d{4})/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    const yr = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) continue;
    if (da < 1 || da > 31) continue;
    if (yr < 2020 || yr > 2099) continue;
    const mm = String(mo).padStart(2, '0');
    const dd = String(da).padStart(2, '0');
    return `${yr}-${mm}-${dd}`;
  }
  return null;
}

// Best-effort promo type — La Cima cards rarely embed type text, so default
// to 'incentive'. The SRR scraper does the same.
function classifyPromoType(): 'incentive' {
  return 'incentive';
}

export async function fetchLaCimaPromotions(): Promise<LaCimaPromoScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; builder?: string }[] = [];

  let html: string;
  try {
    html = await fetchHtml(PROMOTIONS_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`La Cima promotions fetch failed: ${msg}`);
  }

  const $ = cheerio.load(html);

  // Each promo card is a .vc_col-sm-3.wpb_column with a flyer image and
  // a builder heading. We accept any column that has both an <img> and
  // an <h2.vc_custom_heading>.
  type Candidate = {
    builderName: string;
    imgUrl: string | null;
    flyerUrl: string | null;
  };
  const candidates: Candidate[] = [];

  $('.vc_col-sm-3.wpb_column').each((_, el) => {
    const $card = $(el);
    const $h2 = $card.find('h2.vc_custom_heading').first();
    if (!$h2.length) return;

    const builderName = $h2
      .html()
      ?.replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!builderName) return;

    // Skip the page hero column (which contains the La Cima logo, no h2 of
    // a builder name). We've already filtered to columns with an h2, but
    // the page title h2 says "La Cima Builder Promotions" — exclude that.
    if (/\bbuilder\s+promotions\b/i.test(builderName)) return;

    const $img = $card.find('img').first();
    const imgUrl = $img.length ? pickImageUrl($img) : null;
    if (!imgUrl) return;

    // Skip the brand logo header card (matches by image filename).
    if (/LaCima.*Refresh|Refresh.*LaCima/i.test(imgUrl)) return;

    const $a = $card.find('a').first();
    const href = $a.attr('href');
    const flyerUrl = href && href.startsWith('http') ? href : imgUrl;

    candidates.push({ builderName, imgUrl, flyerUrl });
  });

  const rawCount = candidates.length;

  // Multiple cards under the same builder (e.g. Highland Homes has 3) need
  // distinct externalIds. We append a counter scoped to the builder.
  const builderCounters = new Map<string, number>();

  for (const c of candidates) {
    const builderSlug = slugify(c.builderName);
    const n = (builderCounters.get(builderSlug) ?? 0) + 1;
    builderCounters.set(builderSlug, n);

    // Stable externalId: we hash the flyer URL into the slug so the same
    // card returns to the same row across runs even if the page reorders.
    // The flyer URL changes when the builder ships a new flyer (which is
    // exactly what we want — a new row, the old one stops being upserted
    // and falls out of "active" via admin policy or a future inactive cron).
    const flyerSlug = c.flyerUrl ? slugify(c.flyerUrl.split('/').pop() ?? '') : `index-${n}`;
    const externalId = `lacima-promotion/${builderSlug}/${flyerSlug || `index-${n}`}`;

    const expiresAt = expirationDateFromFilename(c.flyerUrl);

    rows.push({
      externalId,
      kind: 'promotion',
      publication: 'realtyline',
      submittedByName: 'La Cima Promotions Auto-Importer',
      submittedByEmail: 'scraper-la-cima-promotions@harmonyone.system',
      builderName: c.builderName,
      title: `${c.builderName} incentive at La Cima`,
      city: LA_CIMA_CITY,
      state: LA_CIMA_STATE,
      description: `Builder incentive from ${c.builderName} at La Cima.`,
      bedsMin: null,
      bedsMax: null,
      bathsMin: null,
      bathsMax: null,
      sqftMin: null,
      sqftMax: null,
      priceMin: null,
      priceMax: null,
      flyerPdfUrl: c.flyerUrl,
      thumbnailUrl: c.imgUrl,
      promoType: classifyPromoType(),
      startsAt: null,
      expiresAt,
      sourceUrl: PROMOTIONS_URL,
      communityName: 'La Cima',
    });
  }

  // Filter out expired promotions — don't upsert, let prune handle deletion.
  const activeRows = rows.filter(
    (r) => !isPromotionExpired(r.expiresAt as string | null),
  );
  const expiredCount = rows.length - activeRows.length;
  if (expiredCount > 0) {
    skipped.push({ reason: `${expiredCount} promotion(s) expired and skipped` });
  }

  return { rows: activeRows, rawCount, skipped };
}
