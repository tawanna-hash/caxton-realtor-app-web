// lib/scrapers/kb-home-promotions.ts
//
// KB Home Austin — Promotions scraper.
//
// KB Home does not have a structured promotions API (unlike David Weekley's
// /promotion/marketpromotionslist). Instead, promotions are surfaced via a
// marketing landing page at /special-low-rates, which advertises below-market
// mortgage rates through KBHS Home Loans with a $5,000 closing cost credit
// and additional seller contributions from KB Home.
//
// This scraper fetches that page, extracts the key offer details (rate
// effective date, closing cost credit, seller contributions), and creates
// a single promotion row with promoType='rate_buydown'.
//
// `kind = 'promotion'`, `homeType = null`.
// Public surface: realtynewsnow.app/inventory/[id] (promotions branch).
//
// Template: docs/promotion-scraper-template.md

import * as cheerio from 'cheerio';

const RATES_URL = 'https://www.kbhome.com/special-low-rates';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const KB_BASE = 'https://www.kbhome.com';

// ─────────────────────────────────────────────────────────────────────────
// Row type
// ─────────────────────────────────────────────────────────────────────────

type PromoType = 'rate_buydown' | 'incentive' | 'event' | 'broker_bonus' | 'other';

export type ScrapedKBHomePromotionRow = {
  externalId: string;
  kind: 'promotion';
  publication: 'realtyline';
  builderName: 'KB Home';
  title: string;
  city: string;
  state: string;
  description: string | null;
  promoType: PromoType | null;
  startsAt: string | null;
  expiresAt: string | null;
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  galleryUrls: string[] | null;
  communityName: string | null;
  submittedByName: string;
  submittedByEmail: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2019;/gi, '\u2019')
    .replace(/&#x201C;/gi, '\u201C')
    .replace(/&#x201D;/gi, '\u201D')
    .replace(/&#x2014;/gi, '\u2014')
    .replace(/&#x2013;/gi, '\u2013')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&rsquo;|&#39;|&apos;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&reg;/gi, '\u00AE');
}

// Extract a date from text like "June 29, 2026" or "6/29/26" → "2026-06-29".
function extractDate(text: string): string | null {
  // "June 29, 2026"
  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const m1 = text.match(/(?:effective|valid)\s+as\s+of\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (m1) {
    const month = monthMap[m1[1].toLowerCase()];
    if (month) {
      const day = m1[2].padStart(2, '0');
      return `${m1[3]}-${month}-${day}`;
    }
  }
  // "6/29/26"
  const m2 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m2) {
    const year = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    const month = m2[1].padStart(2, '0');
    const day = m2[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

function resolveUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return KB_BASE + path;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

// ─────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(html: string): ScrapedKBHomePromotionRow | null {
  const $ = cheerio.load(html);

  // Title from <title> tag.
  const titleText = $('title').text().trim();
  const title = titleText
    ? decodeEntities(titleText).replace(/\s*-\s*KB Home\s*$/i, '')
    : 'KB Home Special Low Rates';

  // Thumbnail from og:image (if present).
  const thumbnailUrl = resolveUrl(
    $('meta[property="og:image"]').attr('content'),
  );

  // Extract the rate disclaimer text — it contains the key offer details.
  const bodyText = $('body').text();

  // Build description from the key offer details found on the page.
  const descParts: string[] = [];

  // Check for the $5,000 closing cost credit.
  const closingCostMatch = bodyText.match(/\$5,000\s*closing\s*cost\s*credit/i);
  const sellerContribMatch = bodyText.match(/seller\s*contributions?\s*from\s*KB\s*Home/i);

  if (closingCostMatch || sellerContribMatch) {
    descParts.push(
      'KB Home offers below-market mortgage rates through KBHS Home Loans.',
    );
    if (closingCostMatch) {
      descParts.push('Includes a $5,000 closing cost credit.');
    }
    if (sellerContribMatch) {
      descParts.push('Additional seller contributions from KB Home may apply.');
    }
  } else {
    descParts.push(
      'KB Home offers special low mortgage rates through KBHS Home Loans. ' +
      'Buy with confidence with transparent pricing and below-market rates.',
    );
  }

  // Extract rate effective date for startsAt.
  const startsAt = extractDate(bodyText);

  // Extract any specific rate values mentioned.
  const rateMatches = bodyText.match(/(\d+\.\d+)%/g);
  if (rateMatches && rateMatches.length > 0) {
    const uniqueRates = Array.from(new Set(rateMatches)).slice(0, 5);
    descParts.push(`Advertised rates: ${uniqueRates.join(', ')}.`);
  }

  const description = descParts.join(' ');

  return {
    externalId: 'kb-special-low-rates',
    kind: 'promotion',
    publication: 'realtyline',
    builderName: 'KB Home',
    title,
    city: 'Greater Austin',
    state: 'TX',
    description,
    promoType: 'rate_buydown',
    startsAt,
    expiresAt: null, // no end date published
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl: RATES_URL,
    galleryUrls: thumbnailUrl ? [thumbnailUrl] : null,
    communityName: null,
    submittedByName: 'KB Home Auto-Importer',
    submittedByEmail: 'scraper-kb-home@harmonyone.system',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchKBHomeAustinPromotions(): Promise<{
  rows: ScrapedKBHomePromotionRow[];
  rawCount: number;
  skipped: number;
}> {
  const html = await fetchUrl(RATES_URL);
  const row = normalize(html);

  if (!row) {
    return { rows: [], rawCount: 1, skipped: 1 };
  }

  return { rows: [row], rawCount: 1, skipped: 0 };
}
