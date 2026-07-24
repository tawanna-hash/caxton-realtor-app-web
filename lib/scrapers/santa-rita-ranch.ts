// lib/scrapers/santa-rita-ranch.ts
//
// Santa Rita Ranch (developer) — move-in-ready (QMI) homes scraper.
//
// Source: santaritaranchaustin.com — JS-rendered move-in-ready grid that
// fetches from a public WordPress REST endpoint:
//
//   POST https://santaritaranchaustin.com/wp-json/landpapi/v1/homesearch/?nc=<epoch_ms>
//   Content-Type: application/x-www-form-urlencoded
//
// Body params (URL-encoded):
//   producttype=.spec   (.spec = move-in ready / QMI; .home = plans)
//   feed=pipsy          (data source identifier)
//   page=0              (OFFSET, not page number)
//   limit=15            (rows per request)
//   price_min=300000    (must include; if omitted, server returns 0 rows)
//   price_max=2000000
//   builder=0 community=0 collection=0 excollection=0 beds= baths= collections= useswiper=
//
// Response shape:
//   { total, count, currentPage, nextPage, items: ["<div...>", ...] }
//
// The `items` array is pre-rendered HTML — NOT JSON home objects — so we
// parse each card with regex on data-attributes plus a few inner-text
// selectors. Data we extract per card:
//   - data-price          → priceMin/Max
//   - data-sqft           → sqftMin/Max
//   - data-beds           → bedsMin/Max
//   - <strong>N.N</strong> <span>Baths</span>  → bathsMin/Max (decimal)
//   - class="builder-<slug>" → builder slug (we humanize)
//   - <h5 class="name builder"><a>Pulte Homes</a></h5> → exact builder display name
//   - <h3 class="price">$378,627</h3>
//   - <p class="address">120 Singing Dove Way ...</p>
//   - Google Maps href → city extraction
//   - <p class="neighborhood">...Homestead</p>
//   - <a href="/new-homes-austin-texas/<builder>/<addr>/?v=pipsy"> → detail URL
//   - <span class="incentive">...Available MM/DD/YYYY</span> → readyDate
//   - data-src on the lazy thumbnail → thumbnailUrl
//
// Notes:
//   - Pipsy `productstatus='Available'` already filters to live homes.
//   - `kind='listing'`, `homeType='showcase'` — same shape as other QMI scrapers.
//   - Publication: 'realtyline' (Greater Austin / Liberty Hill / Georgetown).
//   - The server is fronted by Cloudflare; the endpoint accepts our
//     standard browser-like headers fine, but only when Origin/Referer
//     match the site.

import type { UpsertScrapedInput } from '../builder-inventory';

const ORIGIN = 'https://santaritaranchaustin.com';
const API_URL = `${ORIGIN}/wp-json/landpapi/v1/homesearch/`;
const REFERER = `${ORIGIN}/move-in-ready-homes-new-home-community/`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const REQ_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: ORIGIN,
  Referer: REFERER,
  'X-Requested-With': 'XMLHttpRequest',
} as const;

const PAGE_SIZE = 15;
const MAX_PAGES = 30; // 30 * 15 = 450 — far above the ~156 total

export type SantaRitaScrapeResult = {
  rows: UpsertScrapedInput[];
  rawCount: number;
  skipped: { reason: string; address?: string }[];
};

type PipsyResponse = {
  total: number;
  count: number;
  limit: number;
  currentPage: number;
  nextPage: number;
  items: string[];
};

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchPage(offset: number): Promise<PipsyResponse> {
  const body = new URLSearchParams({
    beds: '',
    baths: '',
    builder: '0',
    collections: '',
    page: String(offset),
    limit: String(PAGE_SIZE),
    producttype: '.spec',
    collection: '0',
    excollection: '0',
    price_min: '300000',
    price_max: '2000000',
    community: '0',
    feed: 'pipsy',
    useswiper: '',
  }).toString();

  const url = `${API_URL}?nc=${Date.now()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: REQ_HEADERS,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Pipsy POST ${url} → HTTP ${res.status}`);
  }

  // Cloudflare sometimes returns HTML challenge pages instead of JSON.
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Pipsy POST returned non-JSON body (possibly Cloudflare block). First 200 chars: ${text.slice(0, 200)}`,
    );
  }

  const d = data as Partial<PipsyResponse>;
  if (typeof d.total !== 'number' || !Array.isArray(d.items)) {
    throw new Error(`Pipsy POST returned unexpected shape: ${JSON.stringify(d).slice(0, 200)}`);
  }
  return d as PipsyResponse;
}

// ─────────────────────────────────────────────────────────────────────────
// Card HTML parsing
// ─────────────────────────────────────────────────────────────────────────

function getAttr(html: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}="([^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

function parseInt0(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/[,$\s]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseFloat0(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[,$\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Pull the displayed baths value (e.g. "2.5") which is more accurate than
// data-baths (which is always an integer like "2.0").
function extractBaths(html: string): number | null {
  const m = html.match(
    /<strong>\s*([\d.]+)\s*<\/strong>\s*<span>\s*Baths?\s*<\/span>/i,
  );
  return m ? parseFloat0(m[1]) : null;
}

// Same idea for sqft — strong/span pair.
function extractSqftDisplay(html: string): number | null {
  const m = html.match(
    /<strong>\s*([\d,]+)\s*<\/strong>\s*<span>\s*Sq\.?\s*Ft\.?\s*<\/span>/i,
  );
  return m ? parseInt0(m[1]) : null;
}

// Builder display name from the .name.builder anchor.
function extractBuilderDisplay(html: string): string | null {
  const m = html.match(
    /<h5[^>]*class="[^"]*\bname\b[^"]*\bbuilder\b[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
  );
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

// Builder slug from "builder-<slug>" class — fallback when display name missing.
function extractBuilderSlug(html: string): string | null {
  const m = html.match(/\bbuilder-([a-z0-9-]+)\b/);
  return m ? m[1] : null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

// Neighborhood from <p class="neighborhood"><span><a>NAME</a></span></p>
function extractNeighborhood(html: string): string | null {
  const m = html.match(
    /<p[^>]*class="[^"]*\bneighborhood\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// Address text from <p class="address">120 Singing Dove Way <a>...</a></p>
function extractAddressLine(html: string): string | null {
  const m = html.match(
    /<p[^>]*class="[^"]*\baddress\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!m) return null;
  // Take everything before the first <a> (the map-link anchor)
  const before = m[1].split(/<a\b/i)[0];
  return before.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// City extraction from the Google Maps href.
// google.com/maps/place/120+Singing+Dove+Way,+Georgetown,+TX+78628 → "Georgetown"
function extractCityFromMapsLink(html: string): { city: string | null; zip: string | null } {
  const m = html.match(
    /maps\/place\/[^"]*?,\+([A-Za-z][A-Za-z+]+),\+([A-Z]{2})(?:\+(\d{5}))?/,
  );
  if (!m) return { city: null, zip: null };
  return {
    city: m[1].replace(/\+/g, ' '),
    zip: m[3] ?? null,
  };
}

// Detail URL — homelink anchor.
function extractDetailUrl(html: string): string | null {
  const m = html.match(
    /<a[^>]*class="[^"]*\bhomelink\b[^"]*"[^>]*href="([^"]+)"/i,
  );
  if (!m) return null;
  const href = m[1];
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return ORIGIN + href;
  return null;
}

// Lazy-loaded thumbnail.
function extractThumbnailUrl(html: string): string | null {
  // The container is `<div class="elementor-post__thumbnail lazy" style="..." data-src="<URL>">`.
  // Note: `__thumbnail` has no word boundary before `thumbnail` (underscore is a word char),
  // so we match by the literal class fragment instead.
  const m = html.match(
    /<div[^>]*class="[^"]*elementor-post__thumbnail[^"]*\blazy\b[^"]*"[^>]*\bdata-src="([^"]+)"/i,
  );
  if (m) return m[1];
  // Also try lazy-then-thumbnail order, and bare "thumbnail lazy" if Elementor markup changes.
  const m2 = html.match(
    /<div[^>]*class="[^"]*\blazy\b[^"]*thumbnail[^"]*"[^>]*\bdata-src="([^"]+)"/i,
  );
  if (m2) return m2[1];
  // Fallback: any non-default <img src>
  const im = html.match(
    /<img[^>]*\bsrc="(https?:\/\/[^"]+)"[^>]*alt=/i,
  );
  return im ? im[1] : null;
}

// "Available MM/DD/YYYY" → ISO YYYY-MM-DD
function extractReadyDate(html: string): string | null {
  const m = html.match(
    /\bAvailable\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
  );
  if (!m) return null;
  const mm = m[1].padStart(2, '0');
  const dd = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

// Price text — prefer the <h3 class="price"> over data-price when present.
function extractPriceDisplay(html: string): number | null {
  const m = html.match(
    /<h3[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>\s*\$?([\d,]+)\s*<\/h3>/i,
  );
  return m ? parseInt0(m[1]) : null;
}

// Pull a slug for externalId from the detail URL or address.
function externalIdFromCard(html: string): string | null {
  const url = extractDetailUrl(html);
  if (url) {
    // .../new-homes-austin-texas/<builder>/<addr-slug>/?v=pipsy
    const m = url.match(
      /\/new-homes-austin-texas\/([a-z0-9-]+)\/([a-z0-9-]+)\/?(?:\?|$)/i,
    );
    if (m) return `srr/${m[1]}/${m[2]}`;
  }
  // Fallback: data-price + address slug
  const addr = extractAddressLine(html);
  const price = parseInt0(getAttr(html, 'data-price'));
  if (addr && price) {
    const slug = addr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `srr/unknown/${slug}-${price}`;
  }
  return null;
}

// Parse one item card into a row, or null + reason.
function parseCard(html: string): { row: UpsertScrapedInput | null; reason?: string } {
  const externalId = externalIdFromCard(html);
  if (!externalId) {
    return { row: null, reason: 'could not derive externalId (no detail URL)' };
  }

  const builderDisplay = extractBuilderDisplay(html);
  const builderSlug = extractBuilderSlug(html);
  const builderName =
    builderDisplay || (builderSlug ? humanizeSlug(builderSlug) : null);
  if (!builderName) {
    return { row: null, reason: 'no builder name on card' };
  }

  const addressLine = extractAddressLine(html);
  const { city: mapCity, zip } = extractCityFromMapsLink(html);
  // The SRR site spans Georgetown / Liberty Hill — use the maps-derived city
  // when present, otherwise fall back to Liberty Hill (the SRR HQ city).
  const city = mapCity || 'Liberty Hill';
  const state = 'TX';

  const fullAddress = addressLine
    ? `${addressLine}, ${city}, ${state}${zip ? ' ' + zip : ''}`
    : null;

  const neighborhood = extractNeighborhood(html);
  const detailUrl = extractDetailUrl(html);
  const thumbnailUrl = extractThumbnailUrl(html);

  const price =
    extractPriceDisplay(html) ?? parseInt0(getAttr(html, 'data-price'));
  const beds = parseFloat0(getAttr(html, 'data-beds'));
  const baths = extractBaths(html) ?? parseFloat0(getAttr(html, 'data-baths'));
  const sqft = extractSqftDisplay(html) ?? parseInt0(getAttr(html, 'data-sqft'));
  const readyDate = extractReadyDate(html);

  // Santa Rita Ranch is a master-planned developer that aggregates homes
  // from many builders. We attribute the listing to the developer in the
  // builder_name column (so it surfaces as a single "Santa Rita Ranch"
  // entry on the public builder/developer hub) and preserve the actual
  // homebuilder in the title + description.
  const titleBase = addressLine
    ? neighborhood
      ? `${addressLine} at ${neighborhood}`
      : addressLine
    : `Inventory home at Santa Rita Ranch`;
  const title = `${titleBase} — ${builderName}`;
  const description = `Built by ${builderName}.`;

  // Skip cards missing price entirely — those aren't actionable listings.
  if (price == null) {
    return { row: null, reason: `no price on card (${addressLine ?? 'unknown address'})` };
  }

  const row: UpsertScrapedInput = {
    externalId,
    kind: 'listing',
    publication: 'realtyline',
    submittedByName: 'Santa Rita Ranch Auto-Importer',
    submittedByEmail: 'scraper-santa-rita-ranch@harmonyone.system',
    builderName: 'Santa Rita Ranch',
    title,
    city,
    state,
    description,
    bedsMin: beds != null ? Math.round(beds) : null,
    bedsMax: beds != null ? Math.round(beds) : null,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    flyerPdfUrl: detailUrl,
    thumbnailUrl,
    address: fullAddress,
    readyDate,
    planName: null,
    communityName: neighborhood
      ? `Santa Rita Ranch · ${neighborhood}`
      : 'Santa Rita Ranch',
    homeType: 'showcase',
  };

  return { row };
}

// ─────────────────────────────────────────────────────────────────────────
// Detail-page enrichment (floorplan image)
// ─────────────────────────────────────────────────────────────────────────

const DETAIL_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

// Fetch a home's detail page and pull the floorplan image (Pipsy Santa Rita
// S3 bucket). Returns null on any failure — enrichment is best-effort.
async function fetchSrrFloorplan(detailUrl: string): Promise<string | null> {
  try {
    const res = await fetch(detailUrl, {
      headers: {
        'User-Agent': DETAIL_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(
      /["'(](https:\/\/cdn\.pipsy\.io\/[^"'\s)]*pipsy-santarita[^"'\s)]*floorplans[^"'\s)]*)/i,
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Run async tasks with bounded concurrency so we don't fan out 160+ detail
// fetches at once (Cloudflare / function-timeout risk).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchSantaRitaRanch(): Promise<SantaRitaScrapeResult> {
  const rows: UpsertScrapedInput[] = [];
  const skipped: { reason: string; address?: string }[] = [];
  const seenIds = new Set<string>();
  let rawCount = 0;

  let offset = 0;
  let total = Infinity;
  let pagesFetched = 0;

  while (offset < total && pagesFetched < MAX_PAGES) {
    let res: PipsyResponse;
    try {
      res = await fetchPage(offset);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Abort early — partial results are still returned to the caller.
      throw new Error(`SRR Pipsy fetch failed at offset=${offset}: ${msg}`);
    }
    pagesFetched++;
    total = res.total;
    rawCount += res.items.length;

    for (const html of res.items) {
      const { row, reason } = parseCard(html);
      if (!row) {
        skipped.push({ reason: reason ?? 'unknown parse failure' });
        continue;
      }
      if (seenIds.has(row.externalId)) {
        // Duplicate page rotation — uncommon but cheap to guard against.
        continue;
      }
      seenIds.add(row.externalId);
      rows.push(row);
    }

    if (res.count < PAGE_SIZE) break;
    offset = res.nextPage;
  }

  // Enrich showcase homes with a floorplan image from each home's detail page
  // (best-effort; ~80% of SRR homes expose a Pipsy floorplan). Skips the
  // synthetic community-summary row (no detail URL).
  const detailRows = rows.filter(
    (r) => r.flyerPdfUrl && r.flyerPdfUrl.includes('/new-homes-austin-texas/'),
  );
  await mapWithConcurrency(detailRows, 6, async (r) => {
    const fp = await fetchSrrFloorplan(r.flyerPdfUrl!);
    if (fp) {
      r.extraDetails = { ...(r.extraDetails ?? {}), _floorplanUrl: fp };
    }
  });

  // Prepend a synthetic community-summary row so Santa Rita Ranch surfaces
  // on the public /communities page (which filters home_type='community').
  // The actual move-in-ready inventory uses home_type='showcase' and would
  // otherwise leave SRR invisible on that hub.
  rows.unshift({
    externalId: 'srr-developer/santa-rita-ranch',
    kind: 'listing',
    publication: 'realtyline',
    submittedByName: 'Santa Rita Ranch Auto-Importer',
    submittedByEmail: 'scraper-santa-rita-ranch@harmonyone.system',
    builderName: 'Santa Rita Ranch',
    title: 'Santa Rita Ranch',
    city: 'Liberty Hill',
    state: 'TX',
    description:
      'Santa Rita Ranch is a master-planned new home community in Liberty Hill near the greater Austin area. ' +
      'Homes are available from top builders including Pulte, Perry, Toll Brothers, Highland, Chesmar, ' +
      'Scott Felder, Taylor Morrison, Coventry, Westin, CastleRock, GFO, and Sitterle, across neighborhoods ' +
      'like Homestead and Tierra Rosa.',
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    priceMin: null,
    priceMax: null,
    flyerPdfUrl: 'https://santaritaranchaustin.com/',
    thumbnailUrl:
      'https://santaritaranchaustin.com/wp-content/uploads/2021/10/SRR-Slides-Balloon-Photo.png',
    address: null,
    readyDate: null,
    planName: null,
    communityName: 'Santa Rita Ranch',
    homeType: 'community',
  });
  rawCount += 1;

  return { rows, rawCount, skipped };
}
