// lib/scrapers/giddens.ts
//
// Giddens Homes Austin — Quick Move-In Ready (QMI) inventory scraper.
//
// Source: https://giddenshomes.com/homes/
// The site is WordPress + SmartTouch Interactive plugin.
//
// Data source: WordPress REST API: wp-json/wp/v2/smarttouch_spec?per_page=100
// Each spec post includes meta.config with:
//   - details: { price, beds, baths, sqft, story, garage, status, available,
//                community: {id, name}, floorplan: {id, name}, agent: {id, name},
//                study, gameroom, mediaroom, seconddining }
//   - gallery: [{id, url, thumbnail}] — up to 30 photos
//   - floorplans: [{id, url, thumbnail}] — floorplan images
//   - location: { address, city, state, zip, county, location: {lat, lng} }
//
// Output: one `homeType: 'showcase'` row per spec home with
// galleryUrls, sourceUrl, extraDetails, address, readyDate.
//
// Conforms to docs/scraper-template.md.

const WP_API = 'https://giddenshomes.com/wp-json/wp/v2';
const GIDDENS_BASE_URL = 'https://giddenshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

const BUILDER_NAME = 'Giddens Homes' as const;

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per spec home
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedGiddensRow = {
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
  address: string | null;
  readyDate: string | null;
  planName: string | null;
  communityName: string | null;
  homeType: 'showcase';
  extraDetails: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────
// WordPress REST API types
// ─────────────────────────────────────────────────────────────────────────

type WpImage = { id: number; url: string; thumbnail?: string };

type WpSpecConfig = {
  details?: {
    status?: { id: string; label: string };
    price?: string;
    beds?: string;
    baths?: string;
    sqft?: string;
    story?: string;
    garage?: string;
    available?: string;
    community?: { id: number; name: string };
    floorplan?: { id: number; name: string };
    agent?: { id: string; name: string };
    study?: boolean;
    gameroom?: boolean;
    mediaroom?: boolean;
    seconddining?: boolean;
    secondliving?: boolean;
  };
  gallery?: WpImage[];
  floorplans?: WpImage[];
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
    location?: { lat: number; lng: number };
  };
};

type WpSpecPost = {
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

function parseConfig(post: WpSpecPost): WpSpecConfig | null {
  try {
    return JSON.parse(post.meta?.config ?? '{}') as WpSpecConfig;
  } catch {
    return null;
  }
}

// Convert "2026-08" → "2026-08-01" for readyDate
function toReadyDate(available: string | null | undefined): string | null {
  if (!available) return null;
  const trimmed = available.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  return null;
}

// Title fallback: planName at communityName
function buildTitle(
  planName: string | null,
  communityName: string | null,
  address: string | null,
): string {
  if (planName && communityName) return `${planName} at ${communityName}`;
  if (planName) return planName;
  if (communityName) return communityName;
  if (address) return address;
  return 'Untitled Home';
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch all spec homes from WordPress REST API
// ─────────────────────────────────────────────────────────────────────────

async function fetchSpecs(): Promise<WpSpecPost[]> {
  const url = `${WP_API}/smarttouch_spec?per_page=100&orderby=title&order=asc`;
  const res = await fetch(url, {
    headers: COMMON_HEADERS,
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Spec API returned ${res.status}`);
  }
  return (await res.json()) as WpSpecPost[];
}

// ─────────────────────────────────────────────────────────────────────────
// Normalize: map API data → ScrapedGiddensRow
// ─────────────────────────────────────────────────────────────────────────

function normalize(
  post: WpSpecPost,
  config: WpSpecConfig,
): ScrapedGiddensRow | null {
  const d = config.details ?? {};
  const loc = config.location ?? {};

  // Address
  const streetAddress = loc.address?.trim() ?? null;
  const city = loc.city?.trim() ?? d.community?.name?.trim() ?? '';
  const state = loc.state?.trim() ?? 'TX';

  // Full address
  const fullAddress = streetAddress
    ? `${streetAddress}, ${city}, ${state} ${loc.zip ?? ''}`.trim()
    : null;

  // Plan and community names
  const planName = d.floorplan?.name?.trim() || null;
  const communityName = d.community?.name?.trim() || null;

  // Title per template: planName at communityName
  const title = buildTitle(planName, communityName, streetAddress);

  // Gallery (full-size URLs)
  const galleryImages: string[] = (config.gallery ?? [])
    .map((g) => normalizeUrl(g.url))
    .filter((u): u is string => u !== null);
  const thumbnailUrl = galleryImages[0] ?? null;

  // Floorplan images (for extraDetails)
  const floorplanImages: string[] = (config.floorplans ?? [])
    .map((g) => normalizeUrl(g.url))
    .filter((u): u is string => u !== null);

  // Price
  const price = parseNum(d.price);

  // Beds/baths/sqft
  const beds = parseNum(d.beds);
  const baths = parseNum(d.baths);
  const sqft = parseNum(d.sqft);

  // Ready date
  const readyDate = toReadyDate(d.available);

  // Source URL — the spec home's canonical WordPress permalink
  const sourceUrl = post.link || null;

  // Status
  const statusLabel = d.status?.label?.trim() ?? null;
  const isAvailable = d.status?.id === 'available';

  // Extra details
  const extraDetails: Record<string, string | number | boolean> = {};

  if (statusLabel) extraDetails['Status'] = statusLabel;
  if (d.story) extraDetails['Stories'] = d.story;
  if (d.garage) extraDetails['Garage'] = d.garage;
  if (d.agent?.name) extraDetails['Sales Agent'] = d.agent.name;
  if (loc.county) extraDetails['County'] = loc.county;
  if (loc.zip) extraDetails['ZIP'] = loc.zip;

  // Room features
  if (d.study) extraDetails['Study'] = 'Yes';
  if (d.gameroom) extraDetails['Game Room'] = 'Yes';
  if (d.mediaroom) extraDetails['Media Room'] = 'Yes';
  if (d.seconddining) extraDetails['Second Dining'] = 'Yes';
  if (d.secondliving) extraDetails['Second Living'] = 'Yes';

  // Floorplan image
  if (floorplanImages.length > 0) {
    extraDetails['_floorplanUrl'] = floorplanImages[0];
  }

  // GPS coordinates
  if (loc.location) {
    extraDetails['_latitude'] = String(loc.location.lat);
    extraDetails['_longitude'] = String(loc.location.lng);
  }

  // Description
  const description = `${planName ? `The ${planName} plan` : 'This home'} is located in ${(communityName ?? city) || 'Austin'}${streetAddress ? ` at ${streetAddress}` : ''}. ${isAvailable ? 'Available' : (statusLabel ?? 'Contact us')}${readyDate ? ` ${readyDate}` : ''}.`;

  return {
    externalId: `giddens/spec/${post.id}`,
    builderName: BUILDER_NAME,
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
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl,
    galleryUrls: galleryImages.slice(0, 30),
    address: fullAddress,
    readyDate,
    planName,
    communityName,
    homeType: 'showcase',
    extraDetails,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export async function fetchGiddensAustin(): Promise<{
  rows: ScrapedGiddensRow[];
  rawCount: number;
  skipped: number;
}> {
  const posts = await fetchSpecs();
  const rawCount = posts.length;

  const rows: ScrapedGiddensRow[] = [];
  let skipped = 0;

  for (const post of posts) {
    const config = parseConfig(post);
    if (!config) {
      console.warn(
        `[giddens] could not parse config for spec post ${post.id}`,
      );
      skipped++;
      continue;
    }

    const row = normalize(post, config);
    if (!row) {
      skipped++;
      continue;
    }

    rows.push(row);
  }

  return { rows, rawCount, skipped };
}
