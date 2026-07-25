// lib/scrapers/drees.ts
//
// Drees Homes Austin — Communities (neighborhoods) scraper.
//
// Drees runs a Vue SPA at https://www.dreeshomes.com/new-homes-austin/. The
// "view=neighborhoods" surface is hydrated by a single POST:
//
//   POST https://www.dreeshomes.com/api/en/dreeshomes/community
//   body: {
//     "pageSize": 50, "pageNumber": 1,
//     "contentid": 959,                  ← Austin area's content id
//     "selectedPoiContentIds": [],
//     "searchByArea": true, "searchByCity": false,
//     "sortBy": "City", "sortOrder": "Asc",
//     "view": "neighborhoods", "mapState": true, "sort": "City-Asc"
//   }
//
// Response: { data: { neighborhoods: [...] }, totalRecords, isSuccess }
//
// No auth/cookies required. Discovered via Chrome DevTools Network capture
// against the public /new-homes-austin/?view=neighborhoods URL.
//
// One row per Austin neighborhood. Each neighborhood becomes a 'listing'
// kind row with homeType='community' (same shape KB Home uses — communities
// land in builder_inventory as community-level rows, not per-home rows).
//
// Sister scraper: lib/scrapers/drees-move-in-ready.ts emits per-home rows
// from the /qmi endpoint for the same builder.

import type { CommunityData } from './david-weekley';

const COMMUNITY_URL =
  'https://www.dreeshomes.com/api/en/dreeshomes/community';

// Austin metro identifiers from the Drees /areas endpoint:
//   areaGuid:  304549ba-b3eb-42a4-be64-2ef35deabb25
//   contentId: 959
//   pageUrl:   /new-homes-austin/
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
  Referer: `${SITE_BASE}/new-homes-austin/?view=neighborhoods&mapState=true&sort=City-Asc`,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Response types — only the fields we read.
// ─────────────────────────────────────────────────────────────────────────

type DreesImage = {
  imagePath?: string | null;
  path?: string | null;
  altText?: string | null;
  caption?: string | null;
};

type DreesNeighborhood = {
  contentId?: number | null;
  productFavoriteId?: string | null;
  neighborhoodName?: string | null;
  neighborhoodType?: string | null;
  communityName?: string | null;
  address?: string | null;
  cityName?: string | null;
  stateInitials?: string | null;
  zipCode?: string | null;
  bedLow?: number | null;
  bedHigh?: number | null;
  bathLow?: number | null;
  bathHigh?: number | null;
  halfBathLow?: number | null;
  halfBathHigh?: number | null;
  sqFtLow?: number | null;
  sqFtHigh?: number | null;
  priceLow?: number | null;
  priceHigh?: number | null;
  planCount?: number | null;
  qmiCount?: number | null;
  modelQmiCount?: number | null;
  lat?: number | null;
  lng?: number | null;
  url?: string | null;
  images?: DreesImage[] | null;
};

type DreesCommunityResponse = {
  data?: {
    neighborhoods?: DreesNeighborhood[] | null;
  } | null;
  totalRecords?: number | null;
  isSuccess?: boolean | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per neighborhood.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedDreesCommunityRow = {
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
  sourceUrl: string | null;
  address: string | null;
  communityName: string | null;
  homeType: 'community';
  communityData: CommunityData;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function nonZeroOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n === 0) return null;
  return n;
}

// Drees half-bath fields aren't always meaningful, but if present:
// combined bath = full + 0.5 * half.
function combineBath(
  full: number | null | undefined,
  half: number | null | undefined,
): number | null {
  const f = nonZeroOrNull(full);
  if (f == null) return null;
  const h = half != null && Number.isFinite(half) && half > 0 ? half : 0;
  return f + h * 0.5;
}

// Drees imagePath is the bare assetcloud URL. Append the standard transform
// query the SPA uses for primary cards so we don't ship 5 MB hero images.
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

function fullAddress(n: DreesNeighborhood): string | null {
  const street = n.address?.trim() || '';
  const city = n.cityName?.trim() || '';
  const state = (n.stateInitials?.trim() || 'TX').toUpperCase();
  const zip = n.zipCode?.trim() || '';
  if (!street && !city) return null;
  const parts: string[] = [];
  if (street) parts.push(street);
  if (city) {
    parts.push(state ? `${city}, ${state}${zip ? ' ' + zip : ''}` : city);
  } else if (state) {
    parts.push(zip ? `${state} ${zip}` : state);
  }
  return parts.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────
// Per-neighborhood normalization
// ─────────────────────────────────────────────────────────────────────────

function deriveCommunityStatus(
  raw: string | null | undefined,
): 'coming-soon' | 'close-out' | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('coming soon')) return 'coming-soon';
  if (
    lower.includes('close out') ||
    lower.includes('close-out') ||
    lower.includes('final opportunit') ||
    lower.includes('closing soon')
  ) {
    return 'close-out';
  }
  return null;
}

function formatPriceRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max)!);
}

function formatSqftRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => n.toLocaleString();
  if (min != null && max != null && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max)!);
}

function normalize(n: DreesNeighborhood): ScrapedDreesCommunityRow | null {
  // Stable id. contentId is Drees' internal numeric id (preferred);
  // productFavoriteId is a string like "AUST::PROV::PRV6" (fallback).
  const id =
    (n.contentId != null && Number.isFinite(n.contentId)
      ? `content/${n.contentId}`
      : null) ||
    (n.productFavoriteId ? `fav/${n.productFavoriteId}` : null);
  if (!id) return null;

  // Title: prefer the marketing neighborhoodName ("The Hollows Sanctuary - 85'")
  // and fall back to communityName.
  const neighborhoodName = n.neighborhoodName?.trim() || null;
  const communityName = n.communityName?.trim() || null;
  const title = neighborhoodName || communityName || 'Drees community';

  const city = n.cityName?.trim() || 'Austin';
  const state = (n.stateInitials?.trim() || 'TX').toUpperCase();

  const bedsMin = nonZeroOrNull(n.bedLow);
  const bedsMax = nonZeroOrNull(n.bedHigh);
  const bathsMin = combineBath(n.bathLow, n.halfBathLow);
  const bathsMax = combineBath(n.bathHigh, n.halfBathHigh);
  const sqftMin = nonZeroOrNull(n.sqFtLow);
  const sqftMax = nonZeroOrNull(n.sqFtHigh);
  const priceMin = nonZeroOrNull(n.priceLow);
  const priceMax = nonZeroOrNull(n.priceHigh);

  const gal = gallery(n.images);
  const thumbnailUrl = gal?.[0] ?? null;

  // Synthesize description per template §6.
  const descParts: string[] = [];
  if (title) descParts.push(`${title}.`);
  const specParts: string[] = [];
  if (n.planCount && n.planCount > 0) {
    specParts.push(`${n.planCount} floor plan${n.planCount === 1 ? '' : 's'}`);
  }
  if (n.qmiCount && n.qmiCount > 0) {
    specParts.push(
      `${n.qmiCount} move-in ready home${n.qmiCount === 1 ? '' : 's'}`,
    );
  }
  if (n.neighborhoodType && n.neighborhoodType.trim()) {
    specParts.push(n.neighborhoodType.trim());
  }
  if (specParts.length > 0) descParts.push(specParts.join(', ') + '.');
  const description = descParts.length > 0 ? descParts.join(' ') : null;

  // communityData: build from available API fields.
  const communityData: CommunityData = {
    communityName: communityName ?? neighborhoodName ?? title,
    status: deriveCommunityStatus(n.neighborhoodType),
    adultOnly: false,
    priceFrom: priceMin != null || priceMax != null
      ? formatPriceRange(priceMin, priceMax)
      : null,
    sqftRange: sqftMin != null || sqftMax != null
      ? formatSqftRange(sqftMin, sqftMax)
      : null,
    amenities: [],
    homePlans: [],
    schools: { district: null, list: [] },
    taxInfo: { entities: [], total: null },
    salesOffice: {
      address: fullAddress(n),
      hours: null,
      lat: typeof n.lat === 'number' ? n.lat : null,
      lng: typeof n.lng === 'number' ? n.lng : null,
      directions: [],
    },
    imageUrls: gal ?? [],
  };

  return {
    externalId: `drees/${id}`,
    builderName: 'Drees Homes',
    title,
    city,
    state,
    description,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax,
    thumbnailUrl,
    galleryUrls: gal,
    flyerPdfUrl: null,
    sourceUrl: normalizeUrl(n.url),
    address: fullAddress(n),
    communityName: communityName ?? neighborhoodName,
    homeType: 'community',
    communityData,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDreesAustinCommunities(): Promise<{
  rows: ScrapedDreesCommunityRow[];
  rawCount: number;
  skipped: number;
}> {
  // pageSize 50 leaves headroom — Austin currently has 17 neighborhoods.
  const body = {
    pageSize: 50,
    pageNumber: 1,
    contentid: AUSTIN_CONTENT_ID,
    selectedPoiContentIds: [],
    searchByArea: true,
    searchByCity: false,
    sortBy: 'City',
    sortOrder: 'Asc',
    view: 'neighborhoods',
    mapState: true,
    sort: 'City-Asc',
  };

  let res: Response;
  try {
    res = await fetch(COMMUNITY_URL, {
      method: 'POST',
      headers: COMMON_HEADERS,
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Drees community fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Drees community returned HTTP ${res.status}`);
  }

  let parsed: DreesCommunityResponse;
  try {
    parsed = (await res.json()) as DreesCommunityResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Drees community non-JSON body: ${msg}`);
  }

  const neighborhoods = parsed.data?.neighborhoods ?? [];
  const rawCount = neighborhoods.length;

  if (rawCount === 0) {
    return { rows: [], rawCount: 0, skipped: 0 };
  }

  const rows: ScrapedDreesCommunityRow[] = [];
  let skipped = 0;
  for (const n of neighborhoods) {
    const row = normalize(n);
    if (row) rows.push(row);
    else skipped++;
  }

  return { rows, rawCount, skipped };
}
