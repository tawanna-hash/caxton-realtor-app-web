// lib/scrapers/david-weekley-promotions.ts
//
// David Weekley Homes — Promotions scraper.
// Fetches active promotions from /promotion/marketpromotionslist for the
// Austin market (marketId=markets/4). One row per time-limited offer.
//
// `kind = 'promotion'`, `homeType = null`.
// Public surface: realtynewsnow.app/inventory/[id] (promotions branch).
//
// Template: docs/promotion-scraper-template.md

const DW_BASE_URL = 'https://www.davidweekleyhomes.com';
const AUSTIN_MARKET_ID = 'markets/4';
const PROMOTIONS_URL = `${DW_BASE_URL}/promotion/marketpromotionslist?marketId=${encodeURIComponent(AUSTIN_MARKET_ID)}`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: `${DW_BASE_URL}/new-homes/tx/austin`,
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Row type
// ─────────────────────────────────────────────────────────────────────────

type PromoType = 'rate_buydown' | 'incentive' | 'event' | 'broker_bonus' | 'other';

export type ScrapedDavidWeekleyPromotionRow = {
  externalId: string;
  kind: 'promotion';
  publication: 'realtyline';
  builderName: 'David Weekley Homes';
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
// API types
// ─────────────────────────────────────────────────────────────────────────

type DWPromotion = {
  Id: string;
  Title: string;
  Name: string | null;
  Description: string | null;
  Summary: string | null;
  StartDate: string | null;
  EndDate: string | null;
  DestinationUrl: string | null;
  ImageUrl: string | null;
  MainImageUrl: string | null;
  Disclaimer: string | null;
  Token: string | null;
  IsSiteWide: boolean | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return DW_BASE_URL + path;
  return null;
}

// Extract YYYY-MM-DD from an ISO timestamp like "2026-06-30T00:00:00Z".
function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.length < 10) return null;
  const candidate = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate;
}

// Derive externalId from the Token (URL slug). E.g. "/promo/simply-the-best-austin"
// → "dw-simply-the-best-austin".
function deriveExternalId(token: string | null): string {
  if (!token) return '';
  const slug = token.replace(/^\/promo\//, '').replace(/\/$/, '');
  return `dw-${slug}`;
}

// Classify the promotion based on its title/description.
function classifyPromo(title: string, description: string | null): PromoType {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  // Rate buydown: mortgage rate reductions
  if (text.includes('rate as low as') || text.includes('rate buydown') || text.includes('starting rate')) {
    return 'rate_buydown';
  }
  // Broker bonus: realtor commission programs
  if (text.includes('realtor') && (text.includes('commission') || text.includes('reward'))) {
    return 'broker_bonus';
  }
  // Event: sales events, grand openings, drives
  if (text.includes('drive') || text.includes('event') || text.includes('grand opening') || text.includes('collecting')) {
    return 'event';
  }
  // Incentive: closing-cost credits, savings, design center selections
  if (text.includes('savings') || text.includes('credit') || text.includes('selections') || text.includes('incentive')) {
    return 'incentive';
  }
  return 'other';
}

function decodeEntities(s: string): string {
  return s
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
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(p: DWPromotion): ScrapedDavidWeekleyPromotionRow | null {
  const externalId = deriveExternalId(p.Token);
  if (!externalId) return null;

  const title = (p.Title || p.Name || externalId).trim();
  const description = p.Description ? stripTags(p.Description) : null;
  const promoType = classifyPromo(title, description);

  const sourceUrl = normalizeUrl(p.DestinationUrl);
  const thumbnailUrl = p.ImageUrl?.trim() || p.MainImageUrl?.trim() || null;

  return {
    externalId,
    kind: 'promotion',
    publication: 'realtyline',
    builderName: 'David Weekley Homes',
    title,
    city: 'Greater Austin',
    state: 'TX',
    description,
    promoType,
    startsAt: dateOnly(p.StartDate),
    expiresAt: dateOnly(p.EndDate),
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl,
    galleryUrls: thumbnailUrl ? [thumbnailUrl] : null,
    communityName: null,
    submittedByName: 'David Weekley Auto-Importer',
    submittedByEmail: 'scraper-david-weekley@harmonyone.system',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDavidWeekleyAustinPromotions(): Promise<{
  rows: ScrapedDavidWeekleyPromotionRow[];
  rawCount: number;
  skipped: number;
}> {
  let res: Response;
  try {
    res = await fetch(PROMOTIONS_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley promotions fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`David Weekley promotions returned HTTP ${res.status}`);
  }

  let parsed: DWPromotion[];
  try {
    parsed = (await res.json()) as DWPromotion[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley promotions non-JSON body: ${msg}`);
  }

  const promotions = Array.isArray(parsed) ? parsed : [];
  const rawCount = promotions.length;

  if (rawCount === 0) {
    return { rows: [], rawCount: 0, skipped: 0 };
  }

  const rows: ScrapedDavidWeekleyPromotionRow[] = [];
  let skipped = 0;
  for (const p of promotions) {
    const row = normalize(p);
    if (row) rows.push(row);
    else skipped++;
  }

  return { rows, rawCount, skipped };
}
