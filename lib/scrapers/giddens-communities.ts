// lib/scrapers/giddens-communities.ts
//
// Giddens Homes Austin — Communities scraper (per-community rows).
//
// Source: https://giddenshomes.com/communities/
// The site is WordPress + SmartTouch Interactive plugin.
//
// Data sources:
//   1. WordPress REST API: wp-json/wp/v2/smarttouch_community?per_page=100
//      → returns community posts with meta.config containing:
//        - gallery[] (community photos)
//        - details.story (marketing copy)
//        - location (address, city, state, zip, lat, lng, county)
//        - pois[] (nearby points of interest / amenities)
//        - logo
//   2. Per-community detail page HTML (https://giddenshomes.com/communities/<slug>/)
//      → contains structured floorplan div blocks with data-* attributes:
//        data-bedrooms, data-bathrooms, data-sqft, data-story, data-garage,
//        data-series, data-other (features), and an <img> elevation photo.
//
// Output: one `homeType: 'community'` row per community with full
// CommunityData (homePlans, salesOffice, imageUrls, amenities).
//
// Conforms to docs/community-scraper-template.md.

import type { CommunityData, CommunityHomePlan } from './david-weekley';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const WP_API = 'https://giddenshomes.com/wp-json/wp/v2';
const GIDDENS_BASE_URL = 'https://giddenshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

const DETAIL_PAGE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

const BUILDER_NAME = 'Giddens Homes' as const;

// Skip the "Build On Your Lot" pseudo-community (id=8401).
const SKIP_IDS = new Set([8401]);

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per community
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedGiddensCommunityRow = {
  externalId: string;
  builderName: 'Giddens Homes';
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
  communityName: string;
  homeType: 'community';
  communityData: CommunityData;
};

// ─────────────────────────────────────────────────────────────────────────
// WordPress REST API types
// ─────────────────────────────────────────────────────────────────────────

type WpImage = { id: number; url: string; thumbnail?: string };

type WpCommunityConfig = {
  id: number;
  logo?: WpImage;
  gallery?: WpImage[];
  details?: {
    story?: string;
    model?: { id: string; name: string };
  };
  location?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    county?: string;
    location?: { lat: number; lng: number };
  };
  pois?: {
    name: string;
    description?: string;
    icon?: { url?: string };
  }[];
  hideFromListings?: boolean;
};

type WpCommunityPost = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  meta: { config: string };
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('/')) return GIDDENS_BASE_URL + trimmed;
  return null;
}

function parseNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseConfig(post: WpCommunityPost): WpCommunityConfig | null {
  try {
    return JSON.parse(post.meta?.config ?? '{}') as WpCommunityConfig;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch all communities from WordPress REST API
// ─────────────────────────────────────────────────────────────────────────

async function fetchCommunities(): Promise<WpCommunityPost[]> {
  const url = `${WP_API}/smarttouch_community?per_page=100&orderby=title&order=asc`;
  const res = await fetch(url, {
    headers: COMMON_HEADERS,
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Community API returned ${res.status}`);
  }
  return (await res.json()) as WpCommunityPost[];
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch a community detail page and parse floorplan divs
// ─────────────────────────────────────────────────────────────────────────

type ParsedFloorplan = {
  name: string;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  story: string | null;
  garage: string | null;
  imageUrl: string | null;
  series: string | null;
};

async function fetchCommunityFloorplans(
  slug: string,
): Promise<ParsedFloorplan[]> {
  const url = `${GIDDENS_BASE_URL}/communities/${slug}/`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: DETAIL_PAGE_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  const html = await res.text();

  // Match each floorplan div block.
  // <div ... class="floorplan" rel="2575" data-bedrooms="4" data-bathrooms="3.5"
  //      data-garage="3" data-story="1" data-sqft="4238" data-series="estatecollection" ...>
  //   <div class="title"><span>Avalon</span></div>
  //   <div class="photo">...<img src="/wp-content/uploads/.../avalon-480x270.jpg" .../>...</div>
  // </div>
  const plans: ParsedFloorplan[] = [];

  const divRe =
    /<div[^>]*class="[^"]*floorplan[^"]*"[^>]*data-floorplan="(\d+)"[^>]*>/g;
  let divMatch: RegExpExecArray | null;

  while ((divMatch = divRe.exec(html)) !== null) {
    const divOpen = divMatch[0];

    // Extract data attributes from the opening div tag
    const attr = (name: string): string | null => {
      const m = new RegExp(`data-${name}="([^"]*)"`).exec(divOpen);
      return m ? m[1] : null;
    };

    // Extract the plan name from the title span
    const afterDiv = html.slice(divMatch.index, divMatch.index + 2000);
    const nameMatch = /class="title"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/.exec(
      afterDiv,
    );
    const name = nameMatch ? nameMatch[1].trim() : null;
    if (!name) continue;

    // Extract the elevation image
    const imgMatch = /<img[^>]*src="([^"]+)"[^>]*>/i.exec(afterDiv);

    // Extract the series name from the .series div
    const seriesMatch = /class="series"[^>]*>([^<]+)</.exec(afterDiv);

    // Format sqft with commas
    const sqftRaw = attr('sqft');
    const sqftDisplay = sqftRaw
      ? parseInt(sqftRaw, 10).toLocaleString('en-US')
      : null;

    plans.push({
      name,
      beds: attr('bedrooms'),
      baths: attr('bathrooms'),
      sqft: sqftDisplay,
      story: attr('story'),
      garage: attr('garage'),
      imageUrl: normalizeUrl(imgMatch ? imgMatch[1] : null),
      series: seriesMatch ? seriesMatch[1].trim() : attr('series'),
    });
  }

  return plans;
}

// ─────────────────────────────────────────────────────────────────────────
// Normalize: map API data + parsed floorplans → ScrapedCommunityRow
// ─────────────────────────────────────────────────────────────────────────

function toHomePlan(p: ParsedFloorplan): CommunityHomePlan {
  const features: string[] = [];
  if (p.series) features.push(p.series);

  return {
    name: p.name,
    url: null,
    priceDisplay: null,
    basePrice: null,
    sqftDisplay: p.sqft,
    beds: p.beds,
    baths: p.baths,
    garages: p.garage,
    stories: p.story,
    imageUrl: p.imageUrl,
    status: null,
    isModel: false,
  };
}

function normalize(
  post: WpCommunityPost,
  config: WpCommunityConfig,
  floorplans: ParsedFloorplan[],
): ScrapedGiddensCommunityRow | null {
  const title = post.title.rendered.trim();
  if (!title) return null;

  const loc = config.location ?? {};
  const city = loc.city ?? '';
  const state = loc.state ?? 'TX';

  // Gallery images (full-size URLs from config)
  const galleryImages: string[] = (config.gallery ?? [])
    .map((g) => normalizeUrl(g.url))
    .filter((u): u is string => u !== null);

  const thumbnailUrl = galleryImages[0] ?? null;
  const sourceUrl = `${GIDDENS_BASE_URL}/communities/${post.slug}/`;

  // Story / marketing copy
  const story = config.details?.story?.trim() ?? null;

  // Amenities from pois
  const amenities: string[] = (config.pois ?? [])
    .map((p) => p.name)
    .filter((n): n is string => !!n && n.length > 0);

  // Home plans
  const homePlans = floorplans.map(toHomePlan);

  // Compute beds/baths/sqft ranges across plans
  const bedsNums = homePlans
    .map((p) => parseNum(p.beds))
    .filter((n): n is number => n !== null);
  const bathsNums = homePlans
    .map((p) => parseNum(p.baths))
    .filter((n): n is number => n !== null);
  const sqftNums = homePlans
    .map((p) => parseNum(p.sqft))
    .filter((n): n is number => n !== null);

  const bedsMin = bedsNums.length ? Math.min(...bedsNums) : null;
  const bedsMax = bedsNums.length ? Math.max(...bedsNums) : null;
  const bathsMin = bathsNums.length ? Math.min(...bathsNums) : null;
  const bathsMax = bathsNums.length ? Math.max(...bathsNums) : null;
  const sqftMin = sqftNums.length ? Math.min(...sqftNums) : null;
  const sqftMax = sqftNums.length ? Math.max(...sqftNums) : null;

  // Sqft range display
  const sqftRange =
    sqftMin != null && sqftMax != null
      ? sqftMin === sqftMax
        ? `${sqftMin.toLocaleString('en-US')} sq.ft.`
        : `${sqftMin.toLocaleString('en-US')} - ${sqftMax.toLocaleString('en-US')} sq.ft.`
      : null;

  // Sales office
  const salesOffice = loc.address
    ? {
        address: loc.address,
        hours: null,
        phone: null,
        specialistName: null,
        directions: loc.location
          ? [
              `https://maps.google.com/?q=${encodeURIComponent(loc.address)}`,
            ]
          : [],
        lat: loc.location?.lat ?? null,
        lng: loc.location?.lng ?? null,
      }
    : null;

  const communityData: CommunityData = {
    communityName: title,
    availability: null,
    status: null,
    adultOnly: false,
    priceFrom: null,
    basePrice: null,
    sqftRange,
    city: city || null,
    imageUrls: galleryImages.slice(0, 30),
    amenities: amenities.length > 0 ? amenities : undefined,
    salesOffice,
    homePlans: homePlans.length > 0 ? homePlans : undefined,
    schools: null,
    taxInfo: null,
  };

  return {
    externalId: `giddens/community/${post.id}`,
    builderName: BUILDER_NAME,
    title,
    city,
    state,
    description: story,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin: null,
    priceMax: null,
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl,
    galleryUrls: galleryImages.slice(0, 30),
    communityName: title,
    homeType: 'community',
    communityData,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export async function fetchGiddensAustinCommunities(): Promise<{
  rows: ScrapedGiddensCommunityRow[];
  rawCount: number;
  skipped: number;
}> {
  const posts = await fetchCommunities();
  const rawCount = posts.length;

  const rows: ScrapedGiddensCommunityRow[] = [];
  let skipped = 0;

  for (const post of posts) {
    if (SKIP_IDS.has(post.id)) {
      skipped++;
      continue;
    }

    const config = parseConfig(post);
    if (!config) {
      console.warn(
        `[giddens-communities] could not parse config for post ${post.id}`,
      );
      skipped++;
      continue;
    }

    if (config.hideFromListings) {
      skipped++;
      continue;
    }

    // Fetch floorplans from the community detail page HTML.
    const floorplans = await fetchCommunityFloorplans(post.slug);

    const row = normalize(post, config, floorplans);
    if (!row) {
      skipped++;
      continue;
    }

    rows.push(row);

    // Small delay between community page fetches.
    await new Promise((r) => setTimeout(r, 300));
  }

  return { rows, rawCount, skipped };
}
