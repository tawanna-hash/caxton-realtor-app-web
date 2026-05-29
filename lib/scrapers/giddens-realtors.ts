// lib/scrapers/giddens-promotions.ts
//
// Giddens Homes — realtor promotions scraper.
//
// Source: https://giddenshomes.com/realtors/
//
// The page is a flat content page with one realtor-facing offer:
//   "Partner with Giddens Homes and earn up to 5% commission!
//    See sales manager for details."
//
// There is no structured listing on the page; the promo is a single
// paragraph block. We detect the promo by searching for the commission
// text. If the copy changes the scraper logs a skip with the reason so
// we notice instead of silently producing stale data.
//
// Promotions land as kind='promotion'. Per builder-inventory.ts S14
// behavior, scraped promotion rows are inserted as status='pending' —
// a human reviews them before publishing.

import type { UpsertScrapedInput } from '../builder-inventory';

const REALTORS_URL = 'https://giddenshomes.com/realtors/';
const HOMEPAGE_URL = 'https://giddenshomes.com/';
const GIDDENS_BASE_URL = 'https://giddenshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

export type GiddensPromoScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string }[];
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

// Pull the visible paragraph that contains the commission text.
function extractCommissionParagraph(html: string): {
  paragraph: string;
  percent: number | null;
} | null {
  // Find a <p> ... </p> that contains the word "commission" near a "%"
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(html)) !== null) {
    const inner = m[1];
    const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/commission/i.test(text) && /\d+\s*%/.test(text)) {
      // Extract the percent value (e.g. "up to 5%")
      const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
      const percent = pct ? parseFloat(pct[1]) : null;
      return { paragraph: text, percent };
    }
  }
  return null;
}

// Pull the first interior/hero image from the Giddens homepage to use as
// a thumbnail. The /realtors/ page itself has no images.
function pickHeroImage(homepageHtml: string): string | null {
  const m = homepageHtml.match(
    /src="(\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))"/i,
  );
  if (!m) return null;
  return GIDDENS_BASE_URL + m[1];
}

export async function fetchGiddensPromotions(): Promise<GiddensPromoScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string }[] = [];

  let realtorsHtml: string;
  try {
    realtorsHtml = await fetchHtml(REALTORS_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Giddens /realtors/ fetch failed: ${msg}`);
  }

  const promo = extractCommissionParagraph(realtorsHtml);
  if (!promo) {
    skipped.push({
      reason:
        'No commission paragraph found on /realtors/ (copy may have changed)',
    });
    return { rows, rawCount: 0, skipped };
  }

  // Best-effort: grab a homepage hero image for the thumbnail.
  let thumbnailUrl: string | null = null;
  try {
    const homepage = await fetchHtml(HOMEPAGE_URL);
    thumbnailUrl = pickHeroImage(homepage);
  } catch {
    // Non-fatal — leave thumb null.
  }

  const title = promo.percent
    ? `Earn up to ${promo.percent}% commission with Giddens Homes`
    : 'Realtor commission program with Giddens Homes';

  rows.push({
    externalId: 'giddens-promotion/realtor-commission',
    kind: 'promotion',
    publication: 'realtyline',
    submittedByName: 'Giddens Promotions Auto-Importer',
    submittedByEmail: 'scraper-giddens-promotions@harmonyone.system',
    builderName: 'Giddens Homes',
    title,
    city: 'Austin',
    state: 'TX',
    description: promo.paragraph,
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    priceMin: null,
    priceMax: null,
    flyerPdfUrl: REALTORS_URL,
    thumbnailUrl,
    promoType: 'broker_bonus',
    startsAt: null,
    expiresAt: null,
    sourceUrl: REALTORS_URL,
  });

  return { rows, rawCount: 1, skipped };
}
