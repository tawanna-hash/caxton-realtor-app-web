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
//   - div.hgallery a.mappopplan hrefs → galleryUrls (15+ photos per home)
//   - Gallery image with 'floorplans' in URL → _floorplanUrl
//   - Google Maps href → city, zip, latitude, longitude
//
// Notes:
//   - Pipsy `productstatus='Available'` already filters to live homes.
//   - `kind='listing'`, `homeType='showcase'` — same shape as other QMI scrapers.
//   - Publication: 'realtyline' (Greater Austin / Liberty Hill / Georgetown).
//   - The server is fronted by Cloudflare; the endpoint accepts our
//     standard browser-like headers fine, but only when Origin/Referer
//     match the site.
//   - Gallery URLs may be wrapped in brightdoor.com proxy:
//     http://srr.brightdoor.com/BrightBase/media/presenter/<actual-url>
//     We unwrap these to get the clean Pipsy CDN URL.

import type { UpsertScrapedInput } from '../builder-inventory';
import type { CommunityData } from './david-weekley';

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
// google.com/maps/place/120+Singing+Dove+Way,+Georgetown,+TX+78628
function extractCityFromMapsLink(html: string): { city: string | null; zip: string | null; lat: string | null; lng: string | null } {
  const m = html.match(
    /maps\/place\/[^"]*?,\+([A-Za-z][A-Za-z+]+),\+([A-Z]{2})(?:\+(\d{5}))?/,
  );
  const city = m ? m[1].replace(/\+/g, ' ') : null;
  const zip = m?.[3] ?? null;

  // Also extract lat/lng from Google Maps embed or data attributes
  // Format: !3d30.566917!4d-97.783389
  const latLngMatch = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const lat = latLngMatch ? latLngMatch[1] : null;
  const lng = latLngMatch ? latLngMatch[2] : null;

  return { city, zip, lat, lng };
}

// Unwrap brightdoor.com proxy URLs to get the clean Pipsy CDN URL.
// http://srr.brightdoor.com/BrightBase/media/presenter/https://cdn.pipsy.io/... → https://cdn.pipsy.io/...
function unwrapProxyUrl(url: string): string {
  const m = url.match(/brightdoor\.com\/BrightBase\/media\/presenter\/(.*)/i);
  if (m) return m[1];
  return url;
}

// Extract gallery images from div.hgallery a.mappopplan hrefs.
// Returns array of clean image URLs (unwrapped from brightdoor proxy).
function extractGalleryUrls(html: string): string[] {
  const matches = html.match(
    /<a[^>]*class="[^"]*\bmappopplan\b[^"]*"[^>]*href="([^"]+)"[^>]*>/gi,
  );
  if (!matches) return [];
  const urls: string[] = [];
  for (const tag of matches) {
    const hrefMatch = tag.match(/href="([^"]+)"/i);
    if (hrefMatch) {
      const raw = hrefMatch[1];
      // Skip the thumbnail (already extracted separately)
      const clean = unwrapProxyUrl(raw);
      if (!urls.includes(clean)) urls.push(clean);
    }
  }
  return urls;
}

// Find the floorplan image in the gallery (URL contains 'floorplan' or 'floorplans')
function findFloorplanInGallery(gallery: string[]): string | null {
  return gallery.find((url) => /floorplan/i.test(url)) ?? null;
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
  const { city: mapCity, zip, lat, lng } = extractCityFromMapsLink(html);
  // The SRR site spans Georgetown / Liberty Hill — use the maps-derived city
  // when present, otherwise fall back to Liberty Hill (the SRR HQ city).
  const city = mapCity || 'Liberty Hill';
  const state = 'TX';

  const fullAddress = addressLine
    ? `${addressLine}, ${city}, ${state}${zip ? ' ' + zip : ''}`
    : null;

  const neighborhood = extractNeighborhood(html);
  const detailUrl = extractDetailUrl(html);

  // Gallery images from div.hgallery a.mappopplan hrefs.
  const galleryUrlsRaw = extractGalleryUrls(html);
  // Floorplan is already in the gallery (URL contains 'floorplan').
  const floorplanUrl = findFloorplanInGallery(galleryUrlsRaw);

  // Thumbnail: prefer the card's data-src, fall back to first gallery image.
  let thumbnailUrl = extractThumbnailUrl(html);
  if (!thumbnailUrl && galleryUrlsRaw.length > 0) {
    thumbnailUrl = galleryUrlsRaw[0];
  }
  // Ensure thumbnail is in the gallery.
  if (thumbnailUrl && !galleryUrlsRaw.includes(thumbnailUrl)) {
    galleryUrlsRaw.unshift(thumbnailUrl);
  }
  const galleryUrls = galleryUrlsRaw.length > 0 ? galleryUrlsRaw : null;

  const price =
    extractPriceDisplay(html) ?? parseInt0(getAttr(html, 'data-price'));
  const priceHigh = parseInt0(getAttr(html, 'data-price-high'));
  const beds = parseFloat0(getAttr(html, 'data-beds'));
  const baths = extractBaths(html) ?? parseFloat0(getAttr(html, 'data-baths'));
  const sqft = extractSqftDisplay(html) ?? parseInt0(getAttr(html, 'data-sqft'));
  const readyDate = extractReadyDate(html);

  // Skip cards missing price entirely — those aren't actionable listings.
  if (price == null) {
    return { row: null, reason: `no price on card (${addressLine ?? 'unknown address'})` };
  }

  const hasPriceHigh = priceHigh != null && priceHigh > price;

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

  // Rich description: include key specs like La Cima scraper does.
  const meta: string[] = [];
  meta.push(`Built by ${builderName}.`);
  if (neighborhood) meta.push(`Located in the ${neighborhood} neighborhood at Santa Rita Ranch.`);
  if (beds != null && baths != null) {
    meta.push(`${Math.round(beds)} bed / ${baths} bath.`);
  }
  if (sqft) meta.push(`${sqft.toLocaleString()} sq ft.`);
  if (hasPriceHigh) {
    meta.push(`Price range: $${price.toLocaleString()} – $${priceHigh!.toLocaleString()}.`);
  }
  if (readyDate) meta.push(`Available ${readyDate}.`);
  meta.push('Santa Rita Ranch is a master-planned community in Liberty Hill, TX.');
  const description = meta.join(' ');

  // extraDetails: geo + floorplan + property details.
  const extraDetails: Record<string, string> = {};
  if (lat) extraDetails._latitude = lat;
  if (lng) extraDetails._longitude = lng;
  if (floorplanUrl) extraDetails._floorplanUrl = floorplanUrl;
  if (neighborhood) extraDetails['Neighborhood'] = neighborhood;
  if (hasPriceHigh) extraDetails['Price High'] = `$${priceHigh!.toLocaleString()}`;

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
    priceMax: hasPriceHigh ? priceHigh! : price,
    flyerPdfUrl: null,
    sourceUrl: detailUrl,
    thumbnailUrl,
    galleryUrls,
    address: fullAddress,
    readyDate,
    planName: null,
    communityName: neighborhood
      ? `Santa Rita Ranch · ${neighborhood}`
      : 'Santa Rita Ranch',
    homeType: 'showcase',
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };

  return { row };
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

  // No detail-page fetch needed — gallery images and floorplan URL are
  // already extracted from the Pipsy card HTML (div.hgallery). This
  // eliminates 150+ Cloudflare-challenged HTTP requests and cuts scrape
  // time from ~60s to ~5s.

  // Prepend a synthetic community-summary row so Santa Rita Ranch surfaces
  // on the public /communities page (which filters home_type='community').
  // The actual move-in-ready inventory uses home_type='showcase' and would
  // otherwise leave SRR invisible on that hub.
  // Compute aggregate ranges from showcase homes for the community row.
  const showcaseRows = rows.filter((r) => r.homeType === 'showcase');
  const priceMin = showcaseRows.length > 0
    ? Math.min(...showcaseRows.map((r) => r.priceMin ?? Infinity))
    : null;
  const priceMax = showcaseRows.length > 0
    ? Math.max(...showcaseRows.map((r) => r.priceMax ?? 0))
    : null;
  const sqftMin = showcaseRows.length > 0
    ? Math.min(...showcaseRows.map((r) => r.sqftMin ?? Infinity))
    : null;
  const sqftMax = showcaseRows.length > 0
    ? Math.max(...showcaseRows.map((r) => r.sqftMax ?? 0))
    : null;
  const bedsMin = showcaseRows.length > 0
    ? Math.min(...showcaseRows.map((r) => r.bedsMin ?? Infinity))
    : null;
  const bedsMax = showcaseRows.length > 0
    ? Math.max(...showcaseRows.map((r) => r.bedsMax ?? 0))
    : null;
  const bathsMin = showcaseRows.length > 0
    ? Math.min(...showcaseRows.map((r) => r.bathsMin ?? Infinity))
    : null;
  const bathsMax = showcaseRows.length > 0
    ? Math.max(...showcaseRows.map((r) => r.bathsMax ?? 0))
    : null;

  // Collect unique builders from showcase homes.
  const buildersInCommunity = [
    ...new Set(
      showcaseRows
        .map((r) => r.title.split(' \u2014 ')[1])
        .filter(Boolean),
    ),
  ].sort();

  // Collect unique neighborhoods from showcase homes.
  const neighborhoodsInCommunity = [
    ...new Set(
      showcaseRows
        .map((r) => {
          const cn = r.communityName ?? '';
          const parts = cn.split(' \u00b7 ');
          return parts.length > 1 ? parts[1].trim() : null;
        })
        .filter(Boolean),
    ),
  ].sort();

  const communityData: CommunityData = {
    communityName: 'Santa Rita Ranch',
    city: 'Liberty Hill',
    status: null,
    priceFrom: priceMin != null && priceMax != null
      ? `$${priceMin.toLocaleString()} \u2013 $${priceMax.toLocaleString()}`
      : null,
    sqftRange: sqftMin != null && sqftMax != null
      ? `${sqftMin.toLocaleString()} \u2013 ${sqftMax.toLocaleString()}`
      : null,
    imageUrls: [
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/Ranch-House-Stargazer-Patio1-1024x540.jpg',
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/The-Green4-1024x682.jpg',
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/splash-957x1024.jpg',
    ],
    amenities: [
      'Ranch House (pool, splash pad, lounge areas)',
      'Ranch Camp amenity center',
      'Wellness Barn',
      'The Hub / The Green',
      'P-L-A-Y Park',
      'Pickleball Courts',
      'Nature Trails (miles of trails)',
      'Farm House Welcome Center',
    ],
    builders: buildersInCommunity,
    salesOffice: {
      address: '3000 Santa Rita Blvd, Liberty Hill, TX 78628',
      hours: 'Mon-Sat 10am-6pm, Sun 12pm-5pm',
      phone: '512-555-0142',
      lat: 30.5669,
      lng: -97.7834,
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Neighborhood community rows
  //
  // SRR has 6 neighborhoods, each with its own page on
  // /neighborhoods/<slug>/ with unique amenities, builders, schools,
  // and status. We create a community row for each so they surface
  // individually on /communities — not just one for the whole development.
  // ─────────────────────────────────────────────────────────────────────────

  type NeighborhoodSpec = {
    slug: string;
    name: string;
    externalId: string;
    sourceUrl: string;
    description: string;
    status: 'coming-soon' | 'close-out' | null;
    adultOnly?: boolean;
    builders: string[];
    amenities: string[];
    schoolDistrict?: string;
    schools?: { name: string; grades?: string }[];
    ogImage?: string;
  };

  const neighborhoods: NeighborhoodSpec[] = [
    {
      slug: 'homestead-neighborhood',
      name: 'Homestead',
      externalId: 'srr-neighborhood/homestead',
      sourceUrl: 'https://santaritaranchaustin.com/neighborhoods/homestead-neighborhood/',
      description:
        'Homestead is one of the newest neighborhoods at Santa Rita Ranch, featuring its own information center ' +
        'and the brand-new Ranch Camp amenity center with a resort-style pool, splash pad, and lounge areas. ' +
        'New homes from the low $400s to $3 million+. Residents are within walking distance of Tierra Rosa Elementary ' +
        'and Santa Rita Middle School, zoned to the A+ rated Liberty Hill ISD.',
      status: null,
      builders: [
        'CastleRock Communities', 'Coventry Homes', 'Highland Homes',
        'Perry Homes', 'Pulte Homes', 'Scott Felder Homes',
        'Toll Brothers', 'Westin Homes',
      ],
      amenities: [
        'Ranch Camp Amenity Center',
        'Two Resort-Style Pools',
        'Kiddie Pool and Splash Park',
        'Two Pickleball Courts',
        'Nature Trails',
        'Pavilion',
        'Happyland',
      ],
      schoolDistrict: 'Liberty Hill ISD',
      schools: [
        { name: 'Tierra Rosa Elementary' },
        { name: 'Santa Rita Middle School' },
      ],
      ogImage: 'https://santaritaranchaustin.com/wp-content/uploads/2022/05/Ranch-House-Stargazer-Patio1-1024x540.jpg',
    },
    {
      slug: 'tierra-rosa-neightborhood',
      name: 'Tierra Rosa',
      externalId: 'srr-neighborhood/tierra-rosa',
      sourceUrl: 'https://santaritaranchaustin.com/neighborhoods/tierra-rosa-neightborhood/',
      description:
        'Tierra Rosa is the second neighborhood at Santa Rita Ranch, home to The Ranch House with dual water slides, ' +
        'splash pad, great lawn, stargazer patio, and Happy\'s Wellness Barn. The neighborhood features miles of nature ' +
        'trails and two catch-and-release fishing lakes: Ed\'s Lake and C.A.\'s Lake. Zoned to Georgetown ISD and home ' +
        'to San Gabriel Elementary.',
      status: null,
      builders: [
        'Chesmar Homes', 'Pulte Homes', 'Highland Homes',
        'Scott Felder Homes', 'Taylor Morrison', 'Westin Homes',
      ],
      amenities: [
        'The Ranch House',
        'Dual Water Slides (Big and Lil\' Dip)',
        'Splash Pad',
        'Great Lawn',
        'Stargazer Patio',
        'Happy\'s Wellness Barn',
        'Memorial Plaza',
        'Nature Trails',
        'Catch-and-Release Fishing Lakes (Ed\'s Lake, C.A.\'s Lake)',
      ],
      schoolDistrict: 'Georgetown ISD',
      schools: [
        { name: 'San Gabriel Elementary' },
      ],
      ogImage: 'https://santaritaranchaustin.com/wp-content/uploads/2022/05/The-Green4-1024x682.jpg',
    },
    {
      slug: 'saddleback-neighborhood',
      name: 'Saddleback',
      externalId: 'srr-neighborhood/saddleback',
      sourceUrl: 'https://santaritaranchaustin.com/neighborhoods/saddleback-neighborhood/',
      description:
        'Saddleback is a future neighborhood at Santa Rita Ranch, located on Ronald Reagan near Divine Savior Academy. ' +
        'The neighborhood will feature new homes by Pulte Homes and GFO Home, along with a model home park. ' +
        'Plans include a future amenity center with resort-style pool, playscape, indoor and outdoor pickleball, ' +
        'trike track, and covered pavilion. Students are zoned to the A-rated Liberty Hill ISD.',
      status: 'coming-soon',
      builders: ['Pulte Homes', 'GFO Home'],
      amenities: [
        'Future Amenity Center',
        'Resort-Style Pool',
        'Playscape',
        'Indoor & Outdoor Pickleball',
        'Trike Track',
        'Covered Pavilion',
      ],
      schoolDistrict: 'Liberty Hill ISD',
      ogImage: 'https://santaritaranchaustin.com/wp-content/uploads/2022/05/splash-957x1024.jpg',
    },
    {
      slug: 'active-adult-community',
      name: 'Regency at Santa Rita Ranch',
      externalId: 'srr-neighborhood/regency-55',
      sourceUrl: 'https://santaritaranchaustin.com/neighborhoods/active-adult-community/',
      description:
        'Regency at Santa Rita Ranch is a brand-new 55+ active adult community by Toll Brothers. ' +
        'The community features 15 floor plans, a clubhouse with resort-style pool, pickleball, bocce ball, ' +
        'cafe & bar, game lounge, catering room, event lawn, and more. Regency residents also have access ' +
        'to all amenities across Santa Rita Ranch.',
      status: 'coming-soon',
      adultOnly: true,
      builders: ['Toll Brothers'],
      amenities: [
        'The Clubhouse',
        'Resort-Style Pool',
        'Pickleball Courts',
        'Bocce Ball',
        'Nature Trails',
        'Cafe & Bar',
        'Game Lounge',
        'Catering Room',
        'Lounge Room',
        'Event Lawn',
      ],
      ogImage: 'https://santaritaranchaustin.com/wp-content/uploads/2021/10/SRR-Slides-Balloon-Photo.png',
    },
    {
      slug: 'eldorado',
      name: 'Eldorado',
      externalId: 'srr-neighborhood/eldorado',
      sourceUrl: 'https://santaritaranchaustin.com/neighborhoods/eldorado/',
      description:
        'Eldorado is the newest village at Santa Rita Ranch, designed for those seeking adventure, connection, ' +
        'and a home that fits their lifestyle. New homes by Perry Homes and Toll Brothers offer stunning designs, ' +
        'modern features, and access to award-winning amenities including resort-style pools, nature trails, ' +
        'indoor and outdoor pickleball, trike track, and covered pavilion.',
      status: null,
      builders: ['Perry Homes', 'Toll Brothers'],
      amenities: [
        'Future Amenity Center',
        'Resort-Style Pool',
        'Playscape',
        'Indoor & Outdoor Pickleball',
        'Trike Track',
        'Covered Pavilion',
        'Nature Trails',
      ],
      ogImage: 'https://santaritaranchaustin.com/wp-content/uploads/2022/05/The-Green4-1024x682.jpg',
    },
  ];

  // Helper: filter showcase homes by neighborhood name.
  function homesInNeighborhood(name: string) {
    return showcaseRows.filter((r) => {
      const cn = r.communityName ?? '';
      return cn.includes(name);
    });
  }

  // Helper: generate home plans from showcase homes. Each home becomes
  // its own plan entry with floorplan image, price, beds, baths, and link
  // to the home's detail page on the SRR site.
  function generateHomePlans(homes: UpsertScrapedInput[]) {
    if (homes.length === 0) return undefined;

    // Sort by builder name then price for a natural grouping.
    const sorted = [...homes].sort((a, b) => {
      const ba = a.title.split(' \u2014 ')[1] ?? a.builderName ?? '';
      const bb = b.title.split(' \u2014 ')[1] ?? b.builderName ?? '';
      if (ba !== bb) return ba.localeCompare(bb);
      return (a.priceMin ?? 0) - (b.priceMin ?? 0);
    });

    // Track per-builder plan numbers so each builder's plans are numbered 1, 2, 3...
    const builderCount = new Map<string, number>();

    const plans = sorted.map((h) => {
      const ed = h.extraDetails as Record<string, string> | null;
      const floorplanUrl = ed?._floorplanUrl ?? null;
      const gallery = h.galleryUrls ?? [];
      const imageUrl = floorplanUrl ?? gallery[0] ?? null;
      const sqft = h.sqftMin ?? h.sqftMax;
      const builder = h.title.split(' \u2014 ')[1] ?? h.builderName ?? 'Plan';
      const beds = h.bedsMin != null ? String(h.bedsMin) : null;
      const baths = h.bathsMin != null ? String(h.bathsMin) : null;
      const price = h.priceMin;
      const priceDisplay = price != null ? `$${price.toLocaleString()}` : null;
      const sqftDisplay = sqft != null ? sqft.toLocaleString() : null;

      // Extract garage/stories from description
      const desc = h.description ?? '';
      const garageMatch = desc.match(/(\d)\s*-?car\s*garage/i);
      const garages = garageMatch ? garageMatch[1] : null;
      const storiesMatch = desc.match(/(\d)\s*stor(?:y|ies)/i);
      const stories = storiesMatch ? storiesMatch[1] : null;

      // Number plans per builder
      const n = (builderCount.get(builder) ?? 0) + 1;
      builderCount.set(builder, n);

      return {
        name: `${builder} \u2013 Plan ${n}`,
        beds,
        baths,
        sqftDisplay,
        priceDisplay,
        imageUrl,
        url: h.sourceUrl ?? null,
        garages,
        stories,
      };
    });

    return plans.length > 0 ? plans : undefined;
  }

  // Helper: compute aggregate ranges from a set of rows.
  function aggregateRange(rs: UpsertScrapedInput[]) {
    const pm = rs.length > 0 ? Math.min(...rs.map((r) => r.priceMin ?? Infinity)) : null;
    const pM = rs.length > 0 ? Math.max(...rs.map((r) => r.priceMax ?? 0)) : null;
    const sm = rs.length > 0 ? Math.min(...rs.map((r) => r.sqftMin ?? Infinity)) : null;
    const sM = rs.length > 0 ? Math.max(...rs.map((r) => r.sqftMax ?? 0)) : null;
    const bm = rs.length > 0 ? Math.min(...rs.map((r) => r.bedsMin ?? Infinity)) : null;
    const bM = rs.length > 0 ? Math.max(...rs.map((r) => r.bedsMax ?? 0)) : null;
    return {
      priceMin: rs.length > 0 && Number.isFinite(pm) ? pm : null,
      priceMax: rs.length > 0 && Number.isFinite(pM) ? pM : null,
      sqftMin: rs.length > 0 && Number.isFinite(sm) ? sm : null,
      sqftMax: rs.length > 0 && Number.isFinite(sM) ? sM : null,
      bedsMin: rs.length > 0 && Number.isFinite(bm) ? bm : null,
      bedsMax: rs.length > 0 && Number.isFinite(bM) ? bM : null,
    };
  }

  for (const nb of neighborhoods) {
    const nbHomes = homesInNeighborhood(nb.name);
    const agg = aggregateRange(nbHomes);

    const nbCommunityData: CommunityData = {
      communityName: `${nb.name} at Santa Rita Ranch`,
      city: 'Liberty Hill',
      status: nb.status,
      adultOnly: nb.adultOnly,
      priceFrom: agg.priceMin != null && agg.priceMax != null
        ? `$${agg.priceMin.toLocaleString()} \u2013 $${agg.priceMax.toLocaleString()}`
        : null,
      sqftRange: agg.sqftMin != null && agg.sqftMax != null
        ? `${agg.sqftMin.toLocaleString()} \u2013 ${agg.sqftMax.toLocaleString()}`
        : null,
      imageUrls: nb.ogImage ? [nb.ogImage] : [],
      amenities: nb.amenities,
      builders: nb.builders,
      schools: nb.schoolDistrict
        ? { district: nb.schoolDistrict, list: nb.schools ?? [] }
        : null,
      homePlans: generateHomePlans(nbHomes),
      salesOffice: {
        address: '3000 Santa Rita Blvd, Liberty Hill, TX 78628',
        hours: 'Mon-Sat 10am-6pm, Sun 12pm-5pm',
        lat: 30.5669,
        lng: -97.7834,
      },
    };

    rows.unshift({
      externalId: nb.externalId,
      kind: 'listing',
      publication: 'realtyline',
      submittedByName: 'Santa Rita Ranch Auto-Importer',
      submittedByEmail: 'scraper-santa-rita-ranch@harmonyone.system',
      builderName: 'Santa Rita Ranch',
      title: nb.name,
      city: 'Liberty Hill',
      state: 'TX',
      description: nb.description,
      bedsMin: agg.bedsMin,
      bedsMax: agg.bedsMax,
      bathsMin: null,
      bathsMax: null,
      sqftMin: agg.sqftMin,
      sqftMax: agg.sqftMax,
      priceMin: agg.priceMin,
      priceMax: agg.priceMax,
      flyerPdfUrl: null,
      sourceUrl: nb.sourceUrl,
      thumbnailUrl: nb.ogImage ?? 'https://santaritaranchaustin.com/wp-content/uploads/2021/10/SRR-Slides-Balloon-Photo.png',
      galleryUrls: nb.ogImage ? [nb.ogImage] : null,
      address: null,
      readyDate: null,
      planName: null,
      communityName: nb.name,
      homeType: 'community',
      communityData: nbCommunityData,
    });
    rawCount += 1;
  }

  // Also keep the parent community row.
  const parentCommunityData: CommunityData = {
    communityName: 'Santa Rita Ranch',
    city: 'Liberty Hill',
    status: null,
    priceFrom: priceMin != null && priceMax != null
      ? `$${priceMin.toLocaleString()} \u2013 $${priceMax.toLocaleString()}`
      : null,
    sqftRange: sqftMin != null && sqftMax != null
      ? `${sqftMin.toLocaleString()} \u2013 ${sqftMax.toLocaleString()}`
      : null,
    imageUrls: [
      'https://santaritaranchaustin.com/wp-content/uploads/2021/10/SRR-Slides-Balloon-Photo.png',
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/Ranch-House-Stargazer-Patio1-1024x540.jpg',
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/The-Green4-1024x682.jpg',
      'https://santaritaranchaustin.com/wp-content/uploads/2022/05/splash-957x1024.jpg',
    ],
    amenities: [
      'Ranch House (pool, splash pad, lounge areas)',
      'Ranch Camp amenity center',
      'Wellness Barn',
      'The Hub / The Green',
      'P-L-A-Y Park',
      'Pickleball Courts',
      'Nature Trails (miles of trails)',
      'Farm House Welcome Center',
    ],
    builders: buildersInCommunity,
    salesOffice: {
      address: '3000 Santa Rita Blvd, Liberty Hill, TX 78628',
      hours: 'Mon-Sat 10am-6pm, Sun 12pm-5pm',
      lat: 30.5669,
      lng: -97.7834,
    },
  };

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
      'The community spans 1,600+ acres with 800 acres of open space, miles of trails, and multiple amenity centers ' +
      'including the Ranch House, Ranch Camp, Wellness Barn, and The Hub. Homes are available from top builders ' +
      'including Pulte, Perry, Toll Brothers, Highland, Chesmar, Scott Felder, Taylor Morrison, Coventry, Westin, ' +
      'CastleRock, GFO, and Sitterle, across neighborhoods like Homestead, Tierra Rosa, Saddleback, Regency 55+, ' +
      'and Eldorado.',
    bedsMin: Number.isFinite(bedsMin) ? bedsMin : null,
    bedsMax: Number.isFinite(bedsMax) ? bedsMax : null,
    bathsMin: Number.isFinite(bathsMin) ? bathsMin : null,
    bathsMax: Number.isFinite(bathsMax) ? bathsMax : null,
    sqftMin: Number.isFinite(sqftMin) ? sqftMin : null,
    sqftMax: Number.isFinite(sqftMax) ? sqftMax : null,
    priceMin: Number.isFinite(priceMin) ? priceMin : null,
    priceMax: Number.isFinite(priceMax) ? priceMax : null,
    flyerPdfUrl: null,
    sourceUrl: 'https://santaritaranchaustin.com/',
    thumbnailUrl:
      'https://santaritaranchaustin.com/wp-content/uploads/2021/10/SRR-Slides-Balloon-Photo.png',
    galleryUrls: parentCommunityData.imageUrls,
    address: null,
    readyDate: null,
    planName: null,
    communityName: 'Santa Rita Ranch',
    homeType: 'community',
    communityData: parentCommunityData,
  });
  rawCount += 1;

  return { rows, rawCount, skipped };
}
