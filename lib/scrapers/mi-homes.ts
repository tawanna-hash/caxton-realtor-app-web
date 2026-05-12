// lib/scrapers/mi-homes.ts
//
// Fetches the M/I Homes Austin communities from their public Sitecore API
// and normalizes each result into a shape our upsert function accepts.
//
// API details (discovered via DevTools on www.mihomes.com):
//   Backend: Sitecore CMS
//   Endpoint: /sitecore/api/ssc/MIHomes-Project-Website-Api/Search
//   Method: GET
//   Auth: none (anonymous, public consumer API)
//   Response: JSON with a `results` array of community objects
//
// We do NOT scrape HTML — this is a clean JSON API call. The endpoint
// uses a bounding-box search; the lat/lng below cover greater Austin.
// If M/I rearranges Texas markets, the bbox may need adjustment.
//
// Per-community fields (defensively read from SEOModel which is the
// canonical source, with fallback to top-level):
//   id              → externalId (for dedup)
//   Name            → title
//   City            → city
//   State           → state ("Texas" → "TX")
//   StartingPrice   → priceMin (skip if 0)
//   MaxPrice        → priceMax (skip if 0)
//   MinSqft/MaxSqft → sqftMin/sqftMax (skip if 0)
//   MinNumberOfBedrooms/MaxNumberOfBedrooms → bedsMin/bedsMax (skip if 0)
//   MinNumberOfBathrooms/MaxNumberOfBathrooms → bathsMin/bathsMax (skip if 0)
//   Description     → stripped + truncated to ~400 chars
//   image (top)     → thumbnailUrl
//   url (top)       → flyerPdfUrl (semantic hack: M/I has no per-community
//                     PDF in this API, so we stuff the community page URL
//                     here; "View flyer" lands realtors on M/I's page)
//
// Communities with maxPrice=0 are pre-launch ("Get the First Look") — we
// still import them with null prices since they're useful for tracking
// upcoming inventory. The admin can reject in the queue if not relevant.

const SEARCH_URL =
  'https://www.mihomes.com/sitecore/api/ssc/MIHomes-Project-Website-Api/Search' +
  '?latCenter=30.47452&lngCenter=-97.896' +
  '&search=Austin&typeahead_type=cities' +
  '&x1=30.60861280653204&x2=29.919479479343455' +
  '&y1=-97.57071277753901&y2=-97.91540882246089' +
  '&zoom=10';

const MI_BASE_URL = 'https://www.mihomes.com';

// Standard browser UA — the M/I API serves anonymous traffic but doesn't
// hurt to look like a real browser. Avoids bot heuristics that some CMSes
// (and Cloudflare in front of them) bolt on.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────
// Response types (just what we read — the API returns much more)
// ─────────────────────────────────────────────────────────────────────────

type SEOModel = {
  Name?: string | null;
  CommunityName?: string | null;
  Description?: string | null;
  City?: string | null;
  State?: string | null;
  StartingPrice?: number | null;
  MaxPrice?: number | null;
  MinSqft?: number | null;
  MaxSqft?: number | null;
  MinNumberOfBedrooms?: number | null;
  MaxNumberOfBedrooms?: number | null;
  MinNumberOfBathrooms?: number | null;
  MaxNumberOfBathrooms?: number | null;
  Url?: string | null;
};

type SearchResult = {
  id?: string | null;
  name?: string | null;
  displayname?: string | null;
  city?: string | null;
  state?: string | null;
  image?: string | null;
  url?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  CardType?: string | null;
  SEOModel?: SEOModel | null;
};

type SearchResponse = {
  results?: SearchResult[] | null;
  outOfRange?: boolean | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — what the cron route hands to upsertBuilderInventoryByExternalId
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedMIHomesRow = {
  externalId: string;
  builderName: 'M/I Homes';
  title: string;
  city: string;
  state: string;
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  thumbnailUrl: string | null;
  flyerPdfUrl: string | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const STATE_ABBREV: Record<string, string> = {
  Texas: 'TX',
  Florida: 'FL',
  Ohio: 'OH',
  'North Carolina': 'NC',
  Illinois: 'IL',
  Indiana: 'IN',
  Michigan: 'MI',
  Tennessee: 'TN',
  Minnesota: 'MN',
};

function normalizeState(s: string | null | undefined): string {
  if (!s) return 'TX'; // we're scraping Austin, default is reasonable
  const trimmed = s.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBREV[trimmed] ?? trimmed.slice(0, 2).toUpperCase();
}

function nonZeroOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n === 0) return null;
  return n;
}

function stripHtml(html: string | null | undefined, maxLen = 400): string | null {
  if (!html) return null;

  let s = html;

  // Drop <style> and <script> blocks WITH their contents.
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');

  // Block-level tags → newlines so paragraphs separate cleanly.
  s = s.replace(/<\/?(p|div|h[1-6]|br|li|tr|ul|ol|blockquote)[^>]*>/gi, '\n');

  // All other tags → strip entirely.
  s = s.replace(/<[^>]+>/g, '');

  // Decode the common HTML entities M/I uses.
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&reg;/g, '®')
    .replace(/&copy;/g, '©')
    .replace(/&trade;/g, '™');

  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();

  if (s.length === 0) return null;
  if (s.length <= maxLen) return s;

  // Truncate at word boundary, append ellipsis.
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return MI_BASE_URL + url;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-result normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(r: SearchResult): ScrapedMIHomesRow | null {
  // Must have a stable ID for dedup, otherwise skip.
  if (!r.id || typeof r.id !== 'string' || r.id.trim().length === 0) {
    return null;
  }

  const seo = r.SEOModel ?? {};
  const title = (seo.Name || seo.CommunityName || r.displayname || r.name || '').trim();
  if (!title) return null;

  const city = (seo.City || r.city || '').trim();
  if (!city) return null;

  const state = normalizeState(seo.State || r.state);

  const url = normalizeUrl(seo.Url || r.url);

  return {
    externalId: r.id,
    builderName: 'M/I Homes',
    title,
    city,
    state,
    description: stripHtml(seo.Description),
    bedsMin: nonZeroOrNull(seo.MinNumberOfBedrooms),
    bedsMax: nonZeroOrNull(seo.MaxNumberOfBedrooms),
    bathsMin: nonZeroOrNull(seo.MinNumberOfBathrooms),
    bathsMax: nonZeroOrNull(seo.MaxNumberOfBathrooms),
    sqftMin: nonZeroOrNull(seo.MinSqft),
    sqftMax: nonZeroOrNull(seo.MaxSqft),
    priceMin: nonZeroOrNull(seo.StartingPrice ?? r.minPrice),
    priceMax: nonZeroOrNull(seo.MaxPrice ?? r.maxPrice),
    thumbnailUrl: r.image ?? null,
    flyerPdfUrl: url, // see file header for why we put the community URL here
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public: fetch + normalize
// ─────────────────────────────────────────────────────────────────────────

export async function fetchMIHomesAustin(): Promise<{
  rows: ScrapedMIHomesRow[];
  rawCount: number;
  skipped: number;
}> {
  let res: Response;
  try {
    res = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      // 30 second timeout via AbortSignal (Vercel functions have their own
      // hard limits but we want to fail fast if M/I is slow).
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`M/I Homes returned HTTP ${res.status}`);
  }

  let body: SearchResponse;
  try {
    body = (await res.json()) as SearchResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes returned non-JSON body: ${msg}`);
  }

  if (body.outOfRange === true) {
    // Bounding box returned no results — either we have a bad bbox or M/I
    // restructured. Surface as an error so the cron run shows up red rather
    // than silently importing zero rows.
    throw new Error('M/I Homes API returned outOfRange=true (bounding box stale?)');
  }

  const results = Array.isArray(body.results) ? body.results : [];
  const rawCount = results.length;

  const rows: ScrapedMIHomesRow[] = [];
  let skipped = 0;
  for (const r of results) {
    const normalized = normalize(r);
    if (normalized) rows.push(normalized);
    else skipped++;
  }

  return { rows, rawCount, skipped };
}
