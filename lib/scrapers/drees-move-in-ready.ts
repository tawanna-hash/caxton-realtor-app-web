// lib/scrapers/drees-move-in-ready.ts
//
// Drees Homes Austin — Quick Move-In Ready (QMI) per-home scraper.
//
// Sister scraper to lib/scrapers/drees.ts. Same builder, different surface.
// Drees' Vue SPA at /new-homes-austin/?view=qmi-home-search hydrates from:
//
//   POST https://www.dreeshomes.com/api/en/dreeshomes/qmi
//   body: {
//     "pageSize": 100, "pageNumber": 1,
//     "contentid": 959,                  ← Austin area content id
//     "selectedPoiContentIds": [],
//     "searchByArea": true, "searchByCity": false,
//     "sortBy": "MoveInDate", "sortOrder": "Asc",
//     "isModelHome": false               ← excludes model homes; we want
//                                          buyable QMI inventory only
//   }
//
// Response: { data: { homes: [...] }, totalRecords, isSuccess }
//
// Each home in `data.homes` has a specific address, planName, elevation,
// neighborhoodName, moveInDate (e.g. "Apr 23, 2026"), and discountedPrice.
// We emit ONE ROW PER HOME with homeType='showcase' — same shape that
// mi-homes + david-weekley use for buyable inventory.

const QMI_URL = 'https://www.dreeshomes.com/api/en/dreeshomes/qmi';

// Austin metro identifiers from /areas:
//   areaGuid:  304549ba-b3eb-42a4-be64-2ef35deabb25
//   contentId: 959
const AUSTIN_CONTENT_ID = 959;

const SITE_BASE = 'https://www.dreeshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: SITE_BASE,
  Referer: `${SITE_BASE}/new-homes-austin/?view=qmi-home-search`,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Response types — only fields we read.
// ─────────────────────────────────────────────────────────────────────────

type DreesImage = {
  imagePath?: string | null;
  path?: string | null;
  altText?: string | null;
  caption?: string | null;
};

type DreesQmiHome = {
  contentId?: number | null;
  productFavoriteId?: string | null;
  address?: string | null;
  cityName?: string | null;
  city?: string | null;
  stateInitials?: string | null;
  zipCode?: string | null;
  planName?: string | null;
  elevation?: string | null;
  neighborhoodName?: string | null;
  neighborhoodMarketingName?: string | null;
  moveInDate?: string | null; // e.g. "Apr 23, 2026"
  discountedPrice?: number | null;
  actualPrice?: number | null;
  priceLow?: number | null;
  priceHigh?: number | null;
  bedLow?: number | null;
  bedHigh?: number | null;
  bathLow?: number | null;
  bathHigh?: number | null;
  halfBathLow?: number | null;
  halfBathHigh?: number | null;
  sqFtLow?: number | null;
  sqFtHigh?: number | null;
  garagesLow?: number | null;
  garagesHigh?: number | null;
  storiesLow?: number | null;
  storiesHigh?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  url?: string | null;
  mlsNumber?: string | null;
  schoolDistricts?: string[] | null;
  uTourUrl?: string | null;
  tour?: { tourId?: string | null } | null;
  homeType?: string | null;
  features?: string[] | null;
  isModelHome?: boolean | null;
  isBoylHome?: boolean | null;
  images?: DreesImage[] | null;
};

type DreesQmiResponse = {
  data?: {
    homes?: DreesQmiHome[] | null;
  } | null;
  totalRecords?: number | null;
  isSuccess?: boolean | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per QMI home.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedDreesQmiRow = {
  externalId: string;
  builderName: 'Drees Homes';
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
  galleryUrls: string[] | null;
  flyerPdfUrl: string | null;
  address: string | null;
  readyDate: string | null; // ISO YYYY-MM-DD
  planName: string | null;
  communityName: string | null;
  homeType: 'showcase';
  extraDetails: Record<string, string> | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function nonZeroOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n === 0) return null;
  return n;
}

function combineBath(
  full: number | null | undefined,
  half: number | null | undefined,
): number | null {
  const f = nonZeroOrNull(full);
  if (f == null) return null;
  const h = half != null && Number.isFinite(half) && half > 0 ? half : 0;
  return f + h * 0.5;
}

function withImageTransform(rawPath: string | null | undefined, width: number): string | null {
  if (!rawPath) return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) {
    return trimmed.includes('?') ? trimmed : `${trimmed}?io=transform:fill,width:${width}`;
  }
  return null;
}

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('/')) return SITE_BASE + trimmed;
  return null;
}

function gallery(images: DreesImage[] | null | undefined): string[] | null {
  if (!images || images.length === 0) return null;
  const out: string[] = [];
  for (const img of images) {
    const url = withImageTransform(img.imagePath ?? img.path ?? null, 1200);
    if (url && !out.includes(url)) out.push(url);
  }
  return out.length > 0 ? out : null;
}

function fullAddress(h: DreesQmiHome): string | null {
  const street = h.address?.trim() || '';
  const city = (h.cityName || h.city || '').trim();
  const state = (h.stateInitials?.trim() || 'TX').toUpperCase();
  const zip = h.zipCode?.trim() || '';
  if (!street) return null;
  const parts: string[] = [street];
  if (city) {
    parts.push(state ? `${city}, ${state}${zip ? ' ' + zip : ''}` : city);
  } else if (state) {
    parts.push(zip ? `${state} ${zip}` : state);
  }
  return parts.join(', ');
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3,
  june: 5, july: 6, august: 7, september: 8,
  october: 9, november: 10, december: 11,
};

// Parse Drees' "Apr 23, 2026" / "April 23, 2026" → "2026-04-23".
// Returns null on anything we don't recognize.
function parseMoveInDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const m = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo === undefined) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (
    !Number.isFinite(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isFinite(year) ||
    year < 2020 ||
    year > 2099
  ) {
    return null;
  }
  const mm = String(mo + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-home normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(h: DreesQmiHome, floorplanUrl?: string | null): ScrapedDreesQmiRow | null {
  if (h.isModelHome === true) return null; // defense in depth

  const id =
    (h.contentId != null && Number.isFinite(h.contentId)
      ? `content/${h.contentId}`
      : null) ||
    (h.productFavoriteId ? `fav/${h.productFavoriteId}` : null);
  if (!id) return null;

  const planName = h.planName?.trim() || null;
  const elevation = h.elevation?.trim() || null;
  const planFull = planName && elevation ? `${planName} ${elevation}` : planName;

  const communityName =
    h.neighborhoodMarketingName?.trim() ||
    h.neighborhoodName?.trim() ||
    null;

  // Title: "Westheimer B at The Colony - 50'" or fall back to address.
  let title: string;
  if (planFull && communityName) {
    title = `${planFull} at ${communityName}`;
  } else if (planFull) {
    title = planFull;
  } else if (communityName) {
    title = `Move-in ready home at ${communityName}`;
  } else if (h.address) {
    title = h.address.trim();
  } else {
    title = 'Drees move-in ready home';
  }

  const city = (h.cityName || h.city || 'Austin').trim();
  const state = (h.stateInitials?.trim() || 'TX').toUpperCase();

  // Scalars for a specific home. Set min=max so range-aware UI works.
  const beds = nonZeroOrNull(h.bedLow);
  const baths = combineBath(h.bathLow, h.halfBathLow);
  const sqft = nonZeroOrNull(h.sqFtLow);

  // discountedPrice is the marketed list price; actualPrice can be 0.
  const price =
    nonZeroOrNull(h.discountedPrice) ??
    nonZeroOrNull(h.actualPrice) ??
    nonZeroOrNull(h.priceLow) ??
    nonZeroOrNull(h.priceHigh);

  const gal = gallery(h.images);
  const thumbnailUrl = gal?.[0] ?? null;

  // Description: short. Use the first 1-3 features Drees ships for the card.
  const features = (h.features ?? []).map((f) => f.trim()).filter(Boolean);
  const description = features.length > 0 ? features.slice(0, 3).join(' • ') : null;

  // Property details + geo + 360 tour (Drees' QMI API exposes all per home).
  const extraDetails: Record<string, string> = {};
  if (h.homeType) extraDetails['Home Type'] = h.homeType;
  if (elevation) extraDetails['Elevation'] = elevation;
  if (planName) extraDetails['Plan'] = planName;
  if (h.storiesLow) extraDetails['Stories'] = String(h.storiesLow);
  const garages = nonZeroOrNull(h.garagesLow);
  if (garages) extraDetails['Garage'] = `${garages}-car`;
  const schools = Array.isArray(h.schoolDistricts) ? h.schoolDistricts.filter(Boolean) : [];
  if (schools.length > 0) extraDetails['School District'] = schools.join(', ');
  if (typeof h.latitude === 'number') extraDetails._latitude = String(h.latitude);
  if (typeof h.longitude === 'number') extraDetails._longitude = String(h.longitude);
  if (h.uTourUrl) extraDetails._virtualTourUrl = h.uTourUrl;
  if (floorplanUrl) extraDetails._floorplanUrl = floorplanUrl;

  return {
    externalId: `drees-qmi/${id}`,
    builderName: 'Drees Homes',
    title,
    city,
    state,
    description,
    bedsMin: beds,
    bedsMax: beds,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    thumbnailUrl,
    galleryUrls: gal,
    flyerPdfUrl: normalizeUrl(h.url),
    address: fullAddress(h),
    readyDate: parseMoveInDate(h.moveInDate),
    planName: planFull,
    communityName,
    homeType: 'showcase',
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Detail-page image fallback
// ─────────────────────────────────────────────────────────────────────────
//
// The QMI list API sometimes returns `images: null` for homes that DO have
// photos on their detail page.  We fetch the detail page HTML and extract
// the `imagePath` values embedded in the JSON payload.

// Detail pages need Accept: text/html to get the rendered HTML (which contains
// embedded JSON with imagePath values). The API's Accept: application/json
// header makes Episerver return a compact JSON view without imagePath.
const DETAIL_PAGE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

type DetailPageData = {
  images: DreesImage[] | null;
  floorplanUrl: string | null;
};

async function fetchDetailPageData(
  urlPath: string | null | undefined,
): Promise<DetailPageData | null> {
  if (!urlPath) return null;
  const fullUrl = urlPath.startsWith('http')
    ? urlPath
    : `${SITE_BASE}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      headers: DETAIL_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return null; // network error — skip gracefully
  }
  if (!res.ok) return null;

  const html = await res.text();
  // Unescape HTML entities (Drees embeds JSON with &quot; encoding)
  const decoded = html
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  // Extract exterior photos: imagePath values with transform/ URLs that
  // appear BEFORE the floorPlanImages block (exterior photos are listed
  // first in the page JSON, floorplans come later).
  const fpBlockIdx = decoded.indexOf('"floorPlanImages"');
  const exteriorSearchEnd = fpBlockIdx >= 0 ? fpBlockIdx : decoded.length;
  const exteriorSlice = decoded.slice(0, exteriorSearchEnd);
  const imgRe = /"imagePath"\s*:\s*"(https:\/\/assetcloud\.dreeshomes\.com\/transform\/[^"]+)"/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const images: DreesImage[] = [];
  while ((m = imgRe.exec(exteriorSlice)) !== null) {
    const imagePath = m[1];
    if (!seen.has(imagePath)) {
      seen.add(imagePath);
      images.push({ imagePath, altText: 'Exterior' });
    }
  }

  // Extract floorplan URL: first imagePath value inside the floorPlanImages
  // block. Can be either asset/*.svg or transform/* format depending on home.
  let floorplanUrl: string | null = null;
  if (fpBlockIdx >= 0) {
    const fpSlice = decoded.slice(fpBlockIdx, fpBlockIdx + 5000);
    const fpMatch = /"imagePath"\s*:\s*"(https:\/\/assetcloud\.dreeshomes\.com\/[^"]+)"/.exec(fpSlice);
    if (fpMatch) {
      floorplanUrl = fpMatch[1];
    }
  }

  return {
    images: images.length > 0 ? images : null,
    floorplanUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDreesAustinQmi(): Promise<{
  rows: ScrapedDreesQmiRow[];
  rawCount: number;
  skipped: number;
}> {
  // pageSize 200 leaves plenty of headroom — Austin QMI currently ~51 homes.
  const body = {
    pageSize: 200,
    pageNumber: 1,
    contentid: AUSTIN_CONTENT_ID,
    selectedPoiContentIds: [],
    searchByArea: true,
    searchByCity: false,
    sortBy: 'MoveInDate',
    sortOrder: 'Asc',
    isModelHome: false,
  };

  let res: Response;
  try {
    res = await fetch(QMI_URL, {
      method: 'POST',
      headers: COMMON_HEADERS,
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Drees QMI fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Drees QMI returned HTTP ${res.status}`);
  }

  let parsed: DreesQmiResponse;
  try {
    parsed = (await res.json()) as DreesQmiResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Drees QMI non-JSON body: ${msg}`);
  }

  const homes = parsed.data?.homes ?? [];
  const rawCount = homes.length;

  if (rawCount === 0) {
    return { rows: [], rawCount: 0, skipped: 0 };
  }

  // ── Detail-page enrichment ───────────────────────────────────────────
  // Always fetch detail pages for ALL homes to extract:
  //  1. Exterior photos for homes where the QMI API returned images: null
  //  2. Floorplan SVG URLs (not available in the QMI API response)
  // Batched at CONCURRENCY=5 to be polite to dreeshomes.com.
  const floorplanMap = new Map<string, string | null>();
  const CONCURRENCY = 5;
  for (let i = 0; i < homes.length; i += CONCURRENCY) {
    const batch = homes.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (h) => {
        try {
          const data = await fetchDetailPageData(h.url);
          if (data) {
            const key = h.url ?? h.productFavoriteId ?? '';
            floorplanMap.set(key, data.floorplanUrl);
            if ((!h.images || h.images.length === 0) && data.images && data.images.length > 0) {
              h.images = data.images;
            }
          }
        } catch {
          // skip — home keeps null images and no floorplan
        }
      }),
    );
  }

  const rows: ScrapedDreesQmiRow[] = [];
  let skipped = 0;
  for (const h of homes) {
    const key = h.url ?? h.productFavoriteId ?? '';
    const fp = floorplanMap.get(key) ?? null;
    const row = normalize(h, fp);
    if (row) rows.push(row);
    else skipped++;
  }

  return { rows, rawCount, skipped };
}
