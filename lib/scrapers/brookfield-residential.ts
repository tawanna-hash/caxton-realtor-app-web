// lib/scrapers/brookfield-residential.ts
//
// Brookfield Residential — Austin-area quick-move-in inventory scraper.
//
// Data source: Brookfield's Sitecore Discover API
//   POST https://discover.sitecorecloud.io/discover/v2/227641806
//   Authorization: <embedded api key>
// returns one "Lot" record per move-in-ready home with beds/baths/sqft/price,
// community + plan + neighborhood, community geo (lat/lng), thumbnail, and the
// public detail-page URL. Per-home enrichment (gallery photos, Matterport 3D
// tour, floor-plan image, marketing copy) is pulled from each detail page's
// __NEXT_DATA__ blob.
//
// Field standard: docs/scraper-template.md (M/I Homes listing 199 is the gold
// standard). Every ScrapedBrookfieldRow is upserted with home_type='showcase',
// kind='listing', publication='realtyline' (Austin).

// ─── Constants ──────────────────────────────────────────────────────────────

const DISCOVER_URL = 'https://discover.sitecorecloud.io/discover/v2/227641806';
// Public, bundle-embedded Sitecore Discover key (not a user secret).
const DISCOVER_AUTH = '01-898dcc0f-3448a2ae5943d090f7db142d843f489f04ddbb58';
const DISCOVER_SOURCE = '1125798'; // Brookfield property-listings source id
const RFK_ID = 'brp_real_estate_data';

const BASE_URL = 'https://www.brookfieldresidential.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
};

// Geographic scope: the Travis County / Austin-area bounding box the user
// scoped their search to (minLng, minLat, maxLng, maxLat). Brookfield builds
// across several TX metros (Frisco, Katy, Austin, San Marcos); we keep only
// the Austin-area lots by checking community_geo against this box.
const AUSTIN_BBOX = {
  minLng: -98.32931627856341,
  minLat: 29.648959758996735,
  maxLng: -97.12951477134061,
  maxLat: 30.77463254100326,
};

const PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = 5;
const GALLERY_LIMIT = 30;
const DETAIL_TIMEOUT_MS = 30_000;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Subset of the Sitecore Discover "Lot" record — only the fields we read. */
interface BrookfieldLot {
  id?: string;
  name?: string;
  addressline1?: string;
  city?: string;
  state_name?: string;
  postalcode?: string;
  type?: string;
  baseprice?: number;
  minimumprice?: number;
  displayprice?: number;
  minimumsquarefootage?: number;
  maximumsquarefootage?: number;
  minimumresidencebedrooms?: number;
  maximumresidencebedrooms?: number;
  minimumresidencefullbaths?: number;
  maximumtotalbaths?: number;
  minimumresidencegarage?: number;
  minimumstories?: number;
  lotsize?: number;
  community_name?: string;
  community_url?: string;
  community_geo?: string;
  community_city?: string;
  community_stateorprovince?: string;
  nh_name?: string;
  plan_name?: string;
  plan_url?: string;
  hometype?: string;
  buildstatus?: string[];
  inferredlotstatus?: string;
  datehomeisplannedtobecomplete?: string;
  image_url?: string;
  url?: string;
  hasvirtualtours?: boolean;
}

interface DiscoverResponse {
  widgets?: Array<{
    content?: BrookfieldLot[];
    total_item?: number;
  }>;
}

interface BrookfieldDetail {
  galleryUrls?: string[];
  virtualTourUrl?: string | null;
  floorplanUrl?: string | null;
}

export interface ScrapedBrookfieldRow {
  externalId: string;
  builderName: string;
  title: string;
  city: string;
  state: string;
  description: string;
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
  address: string | null;
  readyDate: string | null;
  planName: string | null;
  communityName: string | null;
  homeType: 'community' | 'showcase' | 'plan' | 'listing';
  sourceUrl: string | null;
  galleryUrls: string[];
  extraDetails: Record<string, string> | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}

const STATE_ABBREV: Record<string, string> = {
  texas: 'TX',
  arizona: 'AZ',
  california: 'CA',
  colorado: 'CO',
  delaware: 'DE',
  maryland: 'MD',
  'north carolina': 'NC',
  'south carolina': 'SC',
  virginia: 'VA',
  florida: 'FL',
};

function stateToAbbrev(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_ABBREV[state.trim().toLowerCase()] ?? null;
}

/** Parse a "lat,lng" community_geo string into [lat, lng]. */
function parseGeo(geo: string | null | undefined): [number, number] | null {
  if (!geo) return null;
  const parts = geo.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((p) => !Number.isFinite(p))) return null;
  return [parts[0], parts[1]];
}

function inAustinBbox(lat: number, lng: number): boolean {
  return (
    lat >= AUSTIN_BBOX.minLat &&
    lat <= AUSTIN_BBOX.maxLat &&
    lng >= AUSTIN_BBOX.minLng &&
    lng <= AUSTIN_BBOX.maxLng
  );
}

/** Format a ready date as "Month YYYY" for readable synthesized copy. */
function formatReadyLabel(iso: string | null | undefined): string | null {
  const d = dateOnly(iso);
  if (!d) return null;
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return d;
  return `${date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${date.getUTCFullYear()}`;
}

/** Pull the Matterport (or other) tour URL out of an <iframe src="..."> blob. */
function extractIframeSrc(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = /src=["']([^"']+)["']/.exec(html);
  return m ? m[1] : null;
}

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
}

function firstNonZero(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && v > 0) return v;
  }
  // Fall back to the first explicit value (even 0) if any present.
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

// ─── Discover API ────────────────────────────────────────────────────────────

async function fetchDiscoverPage(offset: number): Promise<{
  content: BrookfieldLot[];
  total: number;
}> {
  const payload = {
    context: { locale: { country: 'us', language: 'en' } },
    widget: {
      items: [
        {
          rfk_id: RFK_ID,
          entity: 'map',
          search: {
            filter: {
              type: 'and',
              filters: [
                { name: 'type', type: 'eq', value: 'Lot' },
                { name: 'shouldcountasquickmovein', type: 'eq', value: true },
                { name: 'state_name', type: 'eq', value: 'Texas' },
              ],
            },
            sort: {
              value: [{ name: 'community_name_ascending' }],
              choices: true,
            },
            content: {},
            limit: PAGE_SIZE,
            offset,
          },
          sources: [DISCOVER_SOURCE],
        },
      ],
    },
  };

  let res: Response;
  try {
    res = await fetch(DISCOVER_URL, {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': 'application/json',
        Authorization: DISCOVER_AUTH,
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Brookfield Discover fetch failed (offset ${offset}): ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Brookfield Discover returned HTTP ${res.status} (offset ${offset})`);
  }

  let body: DiscoverResponse;
  try {
    body = (await res.json()) as DiscoverResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Brookfield Discover non-JSON body (offset ${offset}): ${msg}`);
  }

  const widget = body.widgets?.[0];
  const content = Array.isArray(widget?.content) ? widget!.content! : [];
  const total = widget?.total_item ?? 0;
  return { content, total };
}

/** Fetch every Texas quick-move-in lot via Discover (paginated). */
async function fetchQMITexasHomes(): Promise<BrookfieldLot[]> {
  const all: BrookfieldLot[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const { content, total: t } = await fetchDiscoverPage(offset);
    if (t !== undefined) total = t;
    if (content.length === 0) break;
    all.push(...content);
    offset += PAGE_SIZE;
    if (content.length < PAGE_SIZE) break;
  }
  return all;
}

// ─── Detail-page enrichment ──────────────────────────────────────────────────

/** Recursively find every fullGalleryImages object that has an `images` key. */
function findGalleryObjects(root: unknown): unknown[] {
  const out: unknown[] = [];
  const visit = (o: unknown) => {
    if (Array.isArray(o)) {
      for (const v of o) visit(v);
    } else if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>;
      if ('images' in obj && 'virtualTours' in obj) out.push(obj);
      for (const v of Object.values(obj)) visit(v);
    }
  };
  visit(root);
  return out;
}

function readJsonValue(node: unknown): unknown {
  // Sitecore JSS stores rich values as { jsonValue: { value: ... } }.
  if (node && typeof node === 'object' && 'jsonValue' in node) {
    const jv = (node as Record<string, unknown>).jsonValue;
    if (jv && typeof jv === 'object' && 'value' in jv) {
      return (jv as Record<string, unknown>).value;
    }
  }
  return node;
}

function readSrc(node: unknown): string | null {
  const v = readJsonValue(node);
  if (v && typeof v === 'object' && 'src' in v) {
    return str((v as Record<string, unknown>).src);
  }
  if (typeof v === 'string') return str(v);
  return null;
}

/** Fetch a home's detail page and extract gallery, 3D tour, and floor plan. */
async function fetchBrookfieldDetail(
  detailUrl: string,
): Promise<BrookfieldDetail> {
  let res: Response;
  try {
    res = await fetch(detailUrl, {
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`detail fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`detail HTTP ${res.status}`);
  }
  const html = await res.text();

  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no __NEXT_DATA__ on detail page');

  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`__NEXT_DATA__ JSON parse failed: ${msg}`);
  }

  // Shape of a fullGalleryImages object: each section (images/virtualTours/
  // floorPlan) holds `items[]`, and each item holds an `images[]` array of
  // photo/tour/floor-plan objects.
  type GalleryImg = Record<string, unknown>;
  type GalleryItem = { images?: GalleryImg[] };
  type GallerySection = { items?: GalleryItem[] };
  type GalleryObject = {
    images?: GallerySection;
    virtualTours?: GallerySection;
    floorPlan?: GallerySection;
  };

  const galleries = findGalleryObjects(data) as GalleryObject[];
  // Prefer the gallery object with the most populated image items.
  const gallery = galleries
    .map((g) => ({ g, count: g.images?.items?.length ?? 0 }))
    .sort((a, b) => b.count - a.count)[0]?.g;

  const galleryUrls: string[] = [];
  if (gallery?.images?.items) {
    for (const item of gallery.images.items) {
      const imgs = item.images;
      if (!Array.isArray(imgs)) continue;
      for (const img of imgs) {
        const src = readSrc(img.galleryImage);
        if (src && !galleryUrls.includes(src)) galleryUrls.push(src);
        if (galleryUrls.length >= GALLERY_LIMIT) break;
      }
      if (galleryUrls.length >= GALLERY_LIMIT) break;
    }
  }

  let virtualTourUrl: string | null = null;
  if (gallery?.virtualTours?.items) {
    for (const item of gallery.virtualTours.items) {
      const imgs = item.images;
      if (!Array.isArray(imgs)) continue;
      for (const img of imgs) {
        const iframe = readJsonValue(img.iFrameURL);
        if (typeof iframe === 'string') {
          const src = extractIframeSrc(iframe);
          if (src) {
            virtualTourUrl = src;
            break;
          }
        }
      }
      if (virtualTourUrl) break;
    }
  }

  let floorplanUrl: string | null = null;
  if (gallery?.floorPlan?.items) {
    for (const item of gallery.floorPlan.items) {
      const imgs = item.images;
      if (!Array.isArray(imgs)) continue;
      for (const img of imgs) {
        const cover = readSrc(img.coverImageofFloorPlan);
        if (cover) {
          floorplanUrl = cover;
          break;
        }
        const svg = readSrc(img.svgImageofFloorPlan);
        if (svg) {
          floorplanUrl = svg;
          break;
        }
      }
      if (floorplanUrl) break;
    }
  }

  return {
    galleryUrls: galleryUrls.length > 0 ? galleryUrls : undefined,
    virtualTourUrl,
    floorplanUrl,
  };
}

// ─── Normalize ───────────────────────────────────────────────────────────────

function buildAddress(lot: BrookfieldLot, stateAbbrev: string | null): string | null {
  const line1 = str(lot.addressline1) ?? str(lot.name);
  if (!line1) return null;
  const cityStr = str(lot.city) ?? str(lot.community_city);
  const stateStr = stateAbbrev ?? stateToAbbrev(lot.community_stateorprovince);
  const zip = str(lot.postalcode);
  const parts = [line1, cityStr && stateStr ? `${cityStr}, ${stateStr}` : cityStr, zip]
    .filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' ') : null;
}

function synthesizeDescription(lot: BrookfieldLot, ctx: {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  readyLabel: string | null;
  address: string | null;
}): string {
  const plan = str(lot.plan_name);
  const community = str(lot.community_name);
  const neighborhood = str(lot.nh_name);
  const homeType = str(lot.hometype);

  const segments: string[] = [];
  const title = [plan, community ? `at ${community}` : null]
    .filter(Boolean)
    .join(' ');
  if (title) segments.push(`${title}.`);
  if (homeType) segments.push(`${homeType}.`);

  const stats: string[] = [];
  if (ctx.beds) stats.push(`${ctx.beds} bedroom${ctx.beds === 1 ? '' : 's'}`);
  if (ctx.baths) stats.push(`${ctx.baths} bathroom${ctx.baths === 1 ? '' : 's'}`);
  if (ctx.sqft) stats.push(`${ctx.sqft.toLocaleString('en-US')} sq ft`);
  if (ctx.price)
    stats.push(`from $${ctx.price.toLocaleString('en-US')}`);
  if (stats.length) segments.push(stats.join(', ') + '.');

  if (neighborhood) segments.push(`Located in the ${neighborhood} neighborhood${community ? ` of ${community}` : ''}.`);
  if (ctx.readyLabel) segments.push(`Ready ${ctx.readyLabel}.`);
  if (ctx.address) segments.push(`Address: ${ctx.address}.`);

  return segments.join(' ');
}

function normalize(
  lot: BrookfieldLot,
  detail: BrookfieldDetail,
): ScrapedBrookfieldRow | null {
  const externalId = str(lot.id);
  if (!externalId) return null;

  const communityName = str(lot.community_name);
  const planName = str(lot.plan_name);
  const stateAbbrev = stateToAbbrev(lot.state_name) ?? stateToAbbrev(lot.community_stateorprovince) ?? 'TX';

  const beds = firstNonZero(lot.minimumresidencebedrooms, lot.maximumresidencebedrooms);
  const baths = firstNonZero(lot.maximumtotalbaths, lot.minimumresidencefullbaths);
  const sqft = firstNonZero(lot.minimumsquarefootage, lot.maximumsquarefootage);
  const price = firstNonZero(lot.baseprice, lot.minimumprice, lot.displayprice);

  const readyIso = lot.datehomeisplannedtobecomplete;
  const readyDate = dateOnly(readyIso);
  const readyLabel = formatReadyLabel(readyIso);
  const address = buildAddress(lot, stateAbbrev);

  const titleParts = [planName, communityName ? `at ${communityName}` : null]
    .filter(Boolean);
  const title = titleParts.join(' ') || str(lot.name) || str(lot.addressline1) || externalId;

  const sourceUrl = normalizeUrl(lot.url);

  // Geo for the Location map (community center — closest available).
  const geo = parseGeo(lot.community_geo);

  // Build extraDetails. Non-_-prefixed keys render in the Property details
  // grid; _-prefixed keys render as dedicated sections (map / floorplan /
  // 3D tour) or stay internal.
  const extraDetails: Record<string, string> = {};
  if (homeTypeValue(lot)) extraDetails['Home Type'] = homeTypeValue(lot)!;
  if (lot.minimumresidencegarage)
    extraDetails['Garage'] = `${lot.minimumresidencegarage}-car`;
  if (communityName) extraDetails['Community'] = communityName;
  if (str(lot.nh_name)) extraDetails['Neighborhood'] = str(lot.nh_name)!;
  if (str(lot.inferredlotstatus)) extraDetails['Status'] = str(lot.inferredlotstatus)!;
  if (Array.isArray(lot.buildstatus) && lot.buildstatus.length)
    extraDetails['Move-in Timing'] = lot.buildstatus.join(', ');
  if (lot.minimumstories) extraDetails['Stories'] = String(lot.minimumstories);
  if (str(lot.community_stateorprovince)) extraDetails['County/Region'] = str(lot.community_stateorprovince)!;
  if (geo) {
    extraDetails['_latitude'] = String(geo[0]);
    extraDetails['_longitude'] = String(geo[1]);
  }
  if (detail.floorplanUrl) extraDetails['_floorplanUrl'] = detail.floorplanUrl;
  if (detail.virtualTourUrl) extraDetails['_virtualTourUrl'] = detail.virtualTourUrl;

  const galleryUrls = detail.galleryUrls ?? (str(lot.image_url) ? [str(lot.image_url)!] : []);

  return {
    externalId,
    builderName: 'Brookfield Residential',
    title,
    city: str(lot.city) ?? str(lot.community_city) ?? 'Austin',
    state: stateAbbrev,
    description: synthesizeDescription(lot, {
      beds,
      baths,
      sqft,
      price,
      readyLabel,
      address,
    }),
    bedsMin: beds,
    bedsMax: beds,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    flyerPdfUrl: null,
    thumbnailUrl: str(lot.image_url),
    address,
    readyDate,
    planName,
    communityName,
    homeType: 'showcase',
    sourceUrl,
    galleryUrls,
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };
}

function homeTypeValue(lot: BrookfieldLot): string | null {
  return str(lot.hometype);
}

// ─── Concurrency ─────────────────────────────────────────────────────────────

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Fetch Brookfield Residential quick-move-in homes for the Austin area,
 * enrich each with detail-page gallery / 3D tour / floor plan, and return
 * normalized rows ready for upsert.
 */
export async function fetchBrookfieldResidentialAustin(): Promise<{
  rows: ScrapedBrookfieldRow[];
  rawCount: number;
  skipped: number;
  detailFetched: number;
  detailErrors: number;
}> {
  const all = await fetchQMITexasHomes();
  // Narrow to the Austin-area bounding box via community geo.
  const austin = all.filter((lot) => {
    const geo = parseGeo(lot.community_geo);
    return geo ? inAustinBbox(geo[0], geo[1]) : false;
  });

  const rawCount = austin.length;
  if (rawCount === 0) {
    return { rows: [], rawCount: 0, skipped: 0, detailFetched: 0, detailErrors: 0 };
  }

  const rows: ScrapedBrookfieldRow[] = [];
  let skipped = 0;
  let detailFetched = 0;
  let detailErrors = 0;

  // Build lightweight stubs first so a detail failure never loses the row.
  const enriched: Array<{ lot: BrookfieldLot; detail: BrookfieldDetail }> = austin.map(
    (lot) => ({ lot, detail: {} }),
  );

  await mapWithConcurrency(enriched, DETAIL_CONCURRENCY, async (entry) => {
    const detailUrl = normalizeUrl(entry.lot.url);
    if (!detailUrl) return;
    try {
      entry.detail = await fetchBrookfieldDetail(detailUrl);
      detailFetched++;
    } catch (err) {
      detailErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[scrape-brookfield-residential] detail failed for ${detailUrl}: ${msg}`,
      );
    }
  });

  for (const { lot, detail } of enriched) {
    const row = normalize(lot, detail);
    if (row) rows.push(row);
    else skipped++;
  }

  return { rows, rawCount, skipped, detailFetched, detailErrors };
}
