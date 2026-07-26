// lib/scrapers/drees.ts
//
// Drees Homes Austin — Communities scraper (100% rebuild).
//
// Conforms to docs/community-scraper-template.md.
//
// Drees runs a Vue SPA at https://www.dreeshomes.com/new-homes-austin/.
// The community list is hydrated by a single POST to the community API:
//
//   POST https://www.dreeshomes.com/api/en/dreeshomes/community
//   body: {
//     pageSize: 50, pageNumber: 1,
//     contentid: 959,                  ← Austin area content id
//     selectedPoiContentIds: [],
//     searchByArea: true, searchByCity: false,
//     sortBy: "Price", sortOrder: "Asc",
//     view: "floorplans",               ← returns amenities, phone, schools, etc.
//     mapState: false, sort: "Price-Asc"
//   }
//
// Response: { data: { neighborhoods: [...] }, totalRecords, isSuccess }
//
// The `view=floorplans` surface returns enriched fields: amenities,
// modelPhone, schoolDistricts, drivingDirections, officehoursList, mapImage.
//
// Each community's detail page HTML also carries embedded JSON with the
// new home specialist name (phoneNumber, newHomeSpecialistName, faqList,
// communitySummaryList). We fetch each detail page for specialist name
// as a fallback enrichment.
//
// One row per Austin neighborhood → kind='listing', homeType='community'.
// Structured detail lives in the `communityData` JSONB column.

import type { CommunityData, CommunityHomePlan } from './david-weekley';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const COMMUNITY_URL =
  'https://www.dreeshomes.com/api/en/dreeshomes/community';

// Austin metro: contentId 959, page /new-homes-austin/
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
  Referer: `${SITE_BASE}/new-homes-austin/?view=floorplans&sort=Price-Asc`,
} as const;

const DETAIL_PAGE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// API response types — only the fields we read.
// ─────────────────────────────────────────────────────────────────────────

type DreesImage = {
  imagePath?: string | null;
  path?: string | null;
  altText?: string | null;
  caption?: string | null;
};

type DreesAmenity = {
  id?: number | null;
  name?: string | null;
};

type DreesOfficeHour = {
  dayOfWeek?: string | null;
  startTimeString?: string | null;
  endTimeString?: string | null;
  byAppointmentOnlyOnThisDay?: boolean | null;
  closedOnThisDay?: boolean | null;
};

type DreesMapImage = {
  imagePath?: string | null;
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
  neighborhoodCount?: number | null;
  lat?: number | null;
  lng?: number | null;
  url?: string | null;
  images?: DreesImage[] | null;
  isCommunity?: boolean | null;
  caption?: string | null;
  homeTypes?: string[] | null;
  amenities?: DreesAmenity[] | null;
  modelPhone?: string | null;
  schoolDistricts?: string[] | null;
  drivingDirections?: string | null;
  officehoursList?: DreesOfficeHour[] | null;
  mapImage?: DreesMapImage | null;
};

// POST /api/en/dreeshomes/plan — floor plans for a given community contentId.
// Response: { data: { plans: [...] } }. Each plan carries its own
// neighborhoodName (a community can have several priced sub-neighborhoods,
// e.g. "Caliterra - 80'", "Caliterra - 110'") — we pool all plans returned
// for the community's contentId into one homePlans[] list.
type DreesPlan = {
  planName?: string | null;
  neighborhoodName?: string | null;
  url?: string | null;
  priceLow?: number | null;
  priceHigh?: number | null;
  sqFtLow?: number | null;
  sqFtHigh?: number | null;
  bedLow?: number | null;
  bedHigh?: number | null;
  bathLow?: number | null;
  bathHigh?: number | null;
  garagesLow?: number | null;
  garagesHigh?: number | null;
  storiesLow?: number | null;
  storiesHigh?: number | null;
  images?: DreesImage[] | null;
  moveInDate?: string | null;
  contentId?: number | null;
};

type DreesPlanResponse = {
  data?: {
    plans?: DreesPlan[] | null;
  } | null;
};

type DreesCommunityResponse = {
  data?: {
    neighborhoods?: DreesNeighborhood[] | null;
  } | null;
  totalRecords?: number | null;
  isSuccess?: boolean | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per neighborhood (community-scraper-template §2).
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedCommunityRow = {
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
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  galleryUrls: string[];
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

// Drees half-bath fields: combined bath = full + 0.5 * half.
function combineBath(
  full: number | null | undefined,
  half: number | null | undefined,
): number | null {
  const f = nonZeroOrNull(full);
  if (f == null) return null;
  const h = half != null && Number.isFinite(half) && half > 0 ? half : 0;
  return f + h * 0.5;
}

// Drees imagePath is a bare assetcloud URL. Append the standard transform
// query the SPA uses so we don't ship multi-MB hero images.
function withImageTransform(
  rawPath: string | null | undefined,
  width: number,
): string | null {
  if (!rawPath) return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) {
    return trimmed.includes('?')
      ? trimmed
      : `${trimmed}?io=transform:fill,width:${width}`;
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

function gallery(images: DreesImage[] | null | undefined): string[] {
  if (!images || images.length === 0) return [];
  const out: string[] = [];
  for (const img of images) {
    const url = withImageTransform(img.imagePath ?? img.path ?? null, 1200);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
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
    parts.push(
      state ? `${city}, ${state}${zip ? ' ' + zip : ''}` : city,
    );
  } else if (state) {
    parts.push(zip ? `${state} ${zip}` : state);
  }
  return parts.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────
// Office hours + HTML helpers
// ─────────────────────────────────────────────────────────────────────────

const DAY_ABBR: Record<string, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

function formatOfficeHours(
  hours: DreesOfficeHour[] | null | undefined,
): string | null {
  if (!hours || hours.length === 0) return null;
  const parts: string[] = [];
  for (const h of hours) {
    if (h.closedOnThisDay) {
      parts.push(`${DAY_ABBR[h.dayOfWeek ?? ''] ?? h.dayOfWeek}: Closed`);
      continue;
    }
    const start = h.startTimeString ?? '';
    const end = h.endTimeString ?? '';
    if (!start && !end) continue;
    let label = `${DAY_ABBR[h.dayOfWeek ?? ''] ?? h.dayOfWeek}: ${start}-${end}`;
    if (h.byAppointmentOnlyOnThisDay) label += ' (by appt)';
    parts.push(label);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2B;/g, '+')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function extractAmenityNames(
  amenities: DreesAmenity[] | null | undefined,
): string[] {
  if (!amenities || amenities.length === 0) return [];
  const names: string[] = [];
  for (const a of amenities) {
    const name = a?.name?.trim();
    if (name && !names.includes(name)) names.push(decodeHtmlEntities(name));
  }
  return names;
}

function extractMapImageUrl(
  mapImage: DreesMapImage | null | undefined,
): string | null {
  if (!mapImage) return null;
  const raw = mapImage.imagePath ?? null;
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle status derivation (community-scraper-template §8)
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
  if (min != null && max != null && min !== max)
    return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max)!);
}

function formatSqftRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => n.toLocaleString();
  if (min != null && max != null && min !== max)
    return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max)!);
}

// ─────────────────────────────────────────────────────────────────────────
// Detail page enrichment
// ─────────────────────────────────────────────────────────────────────────
//
// The community list API (view=floorplans) returns most enriched fields.
// The detail page HTML adds the new home specialist name as a fallback.

type CommunityDetailData = {
  amenities: string[];
  schoolDistrict: string | null;
  phoneNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  specialistName: string | null;
};

async function fetchCommunityDetailData(
  urlPath: string | null | undefined,
): Promise<CommunityDetailData | null> {
  const url = normalizeUrl(urlPath);
  if (!url) return null;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: DETAIL_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }

  const decoded = html.replace(/&quot;/g, '"');

  // Extract amenities JSON array (fallback when API doesn't return them)
  const amenities: string[] = [];
  const amenMatch = decoded.match(/"amenities"\s*:\s*\[/);
  if (amenMatch) {
    const start = amenMatch.index! + amenMatch[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < decoded.length; i++) {
      if (decoded[i] === '[') depth++;
      else if (decoded[i] === ']') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    try {
      const arr = JSON.parse(decoded.slice(start, end));
      for (const a of arr) {
        if (a && typeof a.name === 'string') {
          amenities.push(decodeHtmlEntities(a.name));
        }
      }
    } catch {
      /* parse failed — skip amenities */
    }
  }

  // Extract school district from FAQ
  let schoolDistrict: string | null = null;
  const faqMatches = decoded.matchAll(
    /"question"\s*:\s*"([^"]+)","answer"\s*:\s*"([^"]+)"/g,
  );
  for (const m of faqMatches) {
    if (m[1].toLowerCase().includes('school district')) {
      schoolDistrict = decodeHtmlEntities(m[2]);
      break;
    }
  }

  // Extract phone number
  let phoneNumber: string | null = null;
  const phoneMatch = decoded.match(/"phoneNumber"\s*:\s*"([^"]+)"/);
  if (phoneMatch) phoneNumber = phoneMatch[1];

  // Extract latitude/longitude
  let latitude: number | null = null;
  let longitude: number | null = null;
  const latMatch = decoded.match(/"latitude"\s*:\s*([0-9.-]+)/);
  const lngMatch = decoded.match(/"longitude"\s*:\s*([0-9.-]+)/);
  if (latMatch) latitude = parseFloat(latMatch[1]);
  if (lngMatch) longitude = parseFloat(lngMatch[1]);

  // Extract new home specialist name
  let specialistName: string | null = null;
  const specialistMatch = decoded.match(
    /"newHomeSpecialistName"\s*:\s*"([^"]+)"/,
  );
  if (specialistMatch) specialistName = specialistMatch[1];

  return {
    amenities,
    schoolDistrict,
    phoneNumber,
    latitude,
    longitude,
    specialistName,
  };
}

const PLAN_URL = 'https://www.dreeshomes.com/api/en/dreeshomes/plan';

// POST /api/en/dreeshomes/plan — floor plans for a community's contentId.
// A community can fan out into several priced sub-neighborhoods (e.g.
// "Caliterra - 80'", "Caliterra - 110'"); the plan endpoint pools all of
// them under the parent contentId, so one call covers the whole community.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCommunityPlans(
  contentId: number | null | undefined,
): Promise<DreesPlan[]> {
  if (contentId == null || !Number.isFinite(contentId)) return [];

  const body = {
    pageSize: 100,
    pageNumber: 1,
    contentid: contentId,
  };

  // Retry once after a 3s backoff — Drees rate-limits the plan endpoint
  // after ~20 rapid requests, causing 429/403 on later batches.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(PLAN_URL, {
        method: 'POST',
        headers: COMMON_HEADERS,
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      });
    } catch {
      if (attempt === 0) {
        await sleep(3000);
        continue;
      }
      return [];
    }
    if (res.ok) {
      let parsed: DreesPlanResponse;
      try {
        parsed = (await res.json()) as DreesPlanResponse;
      } catch {
        return [];
      }
      return parsed.data?.plans ?? [];
    }
    // Non-OK — retry once after backoff
    if (attempt === 0) {
      await sleep(3000);
      continue;
    }
  }
  return [];
}

// Fetches a plan's detail page and extracts the first exterior elevation
// image. Drees' plan API always returns images=null, but each plan's own
// detail page embeds a JSON gallery with imagePath URLs for exterior photos
// and elevation renders. We grab the first non-SVG imagePath (the primary
// exterior photo shown on Drees' floorplan cards). Some elevation render
// URLs (ending in -jpg) 404 on the CDN, so we prefer exterior photos
// which always appear first in the gallery JSON.
async function fetchPlanElevationImage(
  planUrl: string | null | undefined,
): Promise<string | null> {
  if (!planUrl) return null;
  const fullUrl = planUrl.startsWith('http')
    ? planUrl
    : `${SITE_BASE}${planUrl.startsWith('/') ? '' : '/'}${planUrl}`;

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      headers: DETAIL_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const html = await res.text();
  const decoded = html
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  // Find the first imagePath that's a photo (not SVG floor plan).
  // Exterior photos appear first in the page JSON, before elevation
  // renders and SVG floor plans. We match ALL imagePath values and
  // return the first one that isn't an SVG.
  const imgRe =
    /"imagePath"\s*:\s*"(https:\/\/assetcloud\.dreeshomes\.com\/transform\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(decoded)) !== null) {
    const url = m[1];
    if (!url.endsWith('.svg') && !url.includes('-svg')) {
      return url;
    }
  }
  return null;
}

// Batch-fetch elevation images for all plans in a community.
// Returns a map of plan index → image URL (or null).
async function fetchPlanImages(
  plans: DreesPlan[],
): Promise<(string | null)[]> {
  if (plans.length === 0) return [];
  const CONCURRENCY = 5;
  const results: (string | null)[] = new Array(plans.length).fill(null);
  for (let i = 0; i < plans.length; i += CONCURRENCY) {
    const batch = plans.slice(i, i + CONCURRENCY);
    const images = await Promise.all(
      batch.map((p) => fetchPlanElevationImage(p.url)),
    );
    for (let j = 0; j < batch.length; j++) {
      results[i + j] = images[j];
    }
  }
  return results;
}

// Drees uses 0 as a "not applicable" sentinel on the *High side of a
// low/high pair (e.g. bedLow=5, bedHigh=0 means "5 beds", not "5 - 0").
// Formats a range, treating a zero bound as absent whenever the other
// bound is a positive number.
function formatDreesRange(
  low: number | null | undefined,
  high: number | null | undefined,
): string | null {
  const validLow = low != null && low > 0 ? low : null;
  const validHigh = high != null && high > 0 ? high : null;
  if (validLow == null && validHigh == null) return null;
  if (validLow != null && validHigh != null && validLow !== validHigh) {
    return `${validLow} - ${validHigh}`;
  }
  return String(validLow ?? validHigh);
}

// Maps a raw Drees plan record onto the shared CommunityHomePlan shape.
// `fallbackImageUrl` is the parent community's own thumbnail — Drees'
// plan API never returns per-plan images, so we use it to avoid every
// plan card showing "No image available".
function toHomePlan(
  p: DreesPlan,
  planImageUrl?: string | null,
  fallbackImageUrl?: string | null,
): CommunityHomePlan {
  const beds = formatDreesRange(p.bedLow, p.bedHigh);
  const baths = formatDreesRange(p.bathLow, p.bathHigh);
  const garages = formatDreesRange(p.garagesLow, p.garagesHigh);
  const stories = formatDreesRange(p.storiesLow, p.storiesHigh);
  const imageUrl =
    p.images && p.images.length > 0
      ? withImageTransform(p.images[0].imagePath ?? p.images[0].path, 800)
      : withImageTransform(planImageUrl, 800) ?? fallbackImageUrl ?? null;

  return {
    name: p.planName ?? 'Floor Plan',
    url: normalizeUrl(p.url),
    priceDisplay: formatPriceRange(p.priceLow ?? null, p.priceHigh ?? null),
    basePrice: p.priceLow ?? p.priceHigh ?? null,
    sqftDisplay: formatSqftRange(p.sqFtLow ?? null, p.sqFtHigh ?? null),
    beds,
    baths,
    garages,
    stories,
    imageUrl,
    status: null,
    isModel: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Per-neighborhood normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(
  n: DreesNeighborhood,
  detail?: CommunityDetailData | null,
  plans?: DreesPlan[] | null,
  planImages?: (string | null)[] | null,
): ScrapedCommunityRow | null {
  // Stable externalId (community-scraper-template §4).
  // Prefer numeric contentId; fall back to productFavoriteId string.
  const id =
    (n.contentId != null && Number.isFinite(n.contentId)
      ? `content/${n.contentId}`
      : null) ||
    (n.productFavoriteId ? `fav/${n.productFavoriteId}` : null);
  if (!id) return null;

  // Title fallback ladder (§5): neighborhoodName → communityName → generic.
  const neighborhoodName = n.neighborhoodName?.trim() || null;
  const communityName = n.communityName?.trim() || null;
  const title = neighborhoodName || communityName || 'Drees community';

  const city = n.cityName?.trim() || 'Austin';
  const state = (n.stateInitials?.trim() || 'TX').toUpperCase();

  // Numeric ranges across plans.
  const bedsMin = nonZeroOrNull(n.bedLow);
  const bedsMax = nonZeroOrNull(n.bedHigh);
  const bathsMin = combineBath(n.bathLow, n.halfBathLow);
  const bathsMax = combineBath(n.bathHigh, n.halfBathHigh);
  const sqftMin = nonZeroOrNull(n.sqFtLow);
  const sqftMax = nonZeroOrNull(n.sqFtHigh);
  const priceMin = nonZeroOrNull(n.priceLow);
  const priceMax = nonZeroOrNull(n.priceHigh);

  // Gallery + thumbnail (§7).
  const gal = gallery(n.images);
  const thumbnailUrl = gal[0] ?? null;

  // Description: synthesize from structured fields (§6).
  const descParts: string[] = [];
  if (title) descParts.push(`${title}.`);
  const specParts: string[] = [];
  if (n.planCount && n.planCount > 0) {
    specParts.push(
      `${n.planCount} floor plan${n.planCount === 1 ? '' : 's'}`,
    );
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

  // communityData: build from API fields + detail page enrichment (§8).
  const apiAmenities = extractAmenityNames(n.amenities);
  const amenities =
    apiAmenities.length > 0 ? apiAmenities : (detail?.amenities ?? []);
  const schoolDistrict =
    (n.schoolDistricts && n.schoolDistricts.length > 0
      ? n.schoolDistricts[0]
      : null) ??
    detail?.schoolDistrict ??
    null;
  const officeHours = formatOfficeHours(n.officehoursList);
  const directionsText = stripHtml(n.drivingDirections);
  const directions = directionsText ? [directionsText] : [];
  const phone = n.modelPhone ?? detail?.phoneNumber ?? null;
  const specialistName = detail?.specialistName ?? null;
  const mapImg = extractMapImageUrl(n.mapImage);
  const allImages = [...gal];
  if (mapImg && !allImages.includes(mapImg)) allImages.push(mapImg);

  const communityData: CommunityData = {
    communityName: communityName ?? neighborhoodName ?? title,
    status: deriveCommunityStatus(n.neighborhoodType),
    adultOnly: false,
    availability: n.caption ?? null,
    priceFrom:
      priceMin != null || priceMax != null
        ? formatPriceRange(priceMin, priceMax)
        : null,
    sqftRange:
      sqftMin != null || sqftMax != null
        ? formatSqftRange(sqftMin, sqftMax)
        : null,
    amenities,
    homePlans: (plans ?? []).map((p, idx) =>
      toHomePlan(p, planImages?.[idx] ?? null, allImages[0] ?? null),
    ),
    schools: {
      district: schoolDistrict,
      list: [],
    },
    taxInfo: { entities: [], total: null },
    salesOffice: {
      address: fullAddress(n),
      hours: officeHours,
      phone,
      specialistName,
      lat:
        detail?.latitude ??
        (typeof n.lat === 'number' ? n.lat : null),
      lng:
        detail?.longitude ??
        (typeof n.lng === 'number' ? n.lng : null),
      directions,
    },
    imageUrls: allImages,
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
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl: normalizeUrl(n.url),
    galleryUrls: allImages,
    communityName: communityName ?? neighborhoodName,
    homeType: 'community',
    communityData,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDreesAustinCommunities(): Promise<{
  rows: ScrapedCommunityRow[];
  rawCount: number;
  skipped: number;
}> {
  // pageSize 50 leaves headroom — Austin currently has ~17 neighborhoods.
  const body = {
    pageSize: 50,
    pageNumber: 1,
    contentid: AUSTIN_CONTENT_ID,
    selectedPoiContentIds: [],
    searchByArea: true,
    searchByCity: false,
    sortBy: 'Price',
    sortOrder: 'Asc',
    view: 'floorplans',
    mapState: false,
    sort: 'Price-Asc',
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

  // Enrich each community with detail page data (specialist name, lat/lng
  // fallback, amenities/school fallback) and floor plans (homePlans[] via
  // POST /api/en/dreeshomes/plan keyed by contentId). Batched at
  // CONCURRENCY=4 to be polite to dreeshomes.com.
  const rows: ScrapedCommunityRow[] = [];
  let skipped = 0;
  const CONCURRENCY = 4;
  for (let i = 0; i < neighborhoods.length; i += CONCURRENCY) {
    const batch = neighborhoods.slice(i, i + CONCURRENCY);
    const [details, plansBatches] = await Promise.all([
      Promise.all(batch.map((n) => fetchCommunityDetailData(n.url))),
      Promise.all(batch.map((n) => fetchCommunityPlans(n.contentId))),
    ]);
    // Fetch elevation images for each plan (batched at CONCURRENCY=5).
    const planImagesBatches = await Promise.all(
      plansBatches.map((plans) => fetchPlanImages(plans ?? [])),
    );
    for (let j = 0; j < batch.length; j++) {
      const row = normalize(
        batch[j],
        details[j],
        plansBatches[j],
        planImagesBatches[j],
      );
      if (row) rows.push(row);
      else skipped++;
    }
    // Small delay between batches to avoid Drees' plan API rate limiting
    if (i + CONCURRENCY < neighborhoods.length) {
      await sleep(500);
    }
  }

  return { rows, rawCount, skipped };
}
