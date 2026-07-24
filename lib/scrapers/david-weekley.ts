// lib/scrapers/david-weekley.ts
//
// David Weekley Homes Austin — per-home scraper (S13).
//
// Emits ONE ROW per move-in-ready showcase home (their "Quick Move-ins"),
// not per community. Each row has a specific address, ready date, plan
// name, and exact price — what realtors actually need to share with buyers.
//
// API: GET /Search/ShowcaseData?marketId=markets%2F4
//
// Field schema (each Showcase represents a SPECIFIC built home):
//   Id              "showcases/103806"
//   CommunityId     "communities/19971"
//   PlanMasterName  "Markham"
//   PlanMasterNumber "B367"
//   BasePrice       519990
//   SquareFootage   2382 (scalar)
//   Bedrooms        4    (scalar)
//   FullBaths       3
//   HalfBaths       1
//   Stories         2.0
//   Garages         2.0
//   ReadyDate       "2026-04-23T00:00:00"
//   FullAddress     "819 Perry Pass Unit 45, Round Rock, TX 78664"
//   CommunityPhoneNumber "(512) 821-8818"
//   Thumbnail       (presigned image URL)
//   Token           "/homes-ready-soon/tx/austin/round-rock/double-creek-crossing-craftsman-series/22230022"
//   VirtualTour     (matterport URL or null)
//   Latitude/Longitude
//
// To get community NAME (not just CommunityId), we also fetch CommunityData
// in parallel and build a CommunityId → name lookup. ShowcaseData alone
// doesn't include the friendly community name.
//
// Bath convention: FullBaths + 0.5 * HalfBaths (decimals like 3.5).
//
// HTTP details:
//   - Case-sensitive uppercase /Search/; 301-redirects to lowercase
//   - redirect: 'follow' required
//   - Referer header required, else 302 to /
//   - Austin's market ID is "markets/4" (URL-encode the slash)
//
// Why no FloorPlanData here: plans are build-to-order templates, not
// buyable inventory. Per S13 design decision, we surface only specific
// homes (showcases) since those are what realtors share with buyers.

const COMMUNITY_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/CommunityData?marketId=markets%2F4';

const SHOWCASE_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/ShowcaseData?marketId=markets%2F4';

const DW_BASE_URL = 'https://www.davidweekleyhomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://www.davidweekleyhomes.com/new-homes/tx/austin',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Response types — just what we read.
// ─────────────────────────────────────────────────────────────────────────

type DWCity = {
  Id?: string | null;
  Name?: string | null;
  StateAbbreviation?: string | null;
};

type DWCommunity = {
  Id?: string | null;
  Name?: string | null;
  City?: DWCity | null;
};

type CommunityDataResponse = {
  Communities?: DWCommunity[] | null;
};

type DWShowcase = {
  Id?: string | null;
  CommunityId?: string | null;
  PlanMasterName?: string | null;
  PlanMasterNumber?: string | null;
  BasePrice?: number | null;
  Bedrooms?: number | null;
  FullBaths?: number | null;
  HalfBaths?: number | null;
  SquareFootage?: number | null;
  Stories?: number | null;
  Garages?: number | null;
  ReadyDate?: string | null;
  FullAddress?: string | null;
  CommunityPhoneNumber?: string | null;
  Thumbnail?: string | null;
  Token?: string | null;
  VirtualTour?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  CallForPricing?: boolean | null;
};

type ShowcaseDataResponse = {
  Items?: DWShowcase[] | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per move-in-ready home.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedDavidWeekleyRow = {
  externalId: string;
  builderName: 'David Weekley Homes';
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
  sourceUrl: string | null;
  galleryUrls: string[] | null;
  // S13 per-home additions:
  address: string | null;
  readyDate: string | null; // YYYY-MM-DD
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

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return DW_BASE_URL + path;
  return null;
}

function bathsFor(
  fullBaths: number | null | undefined,
  halfBaths: number | null | undefined,
): number | null {
  if (fullBaths == null || !Number.isFinite(fullBaths)) return null;
  const halves = halfBaths != null && Number.isFinite(halfBaths) ? halfBaths : 0;
  return fullBaths + 0.5 * halves;
}

// Parse city from a FullAddress like:
//   "819 Perry Pass Unit 45, Round Rock, TX 78664"
//                            ^^^^^^^^^^
// Splits on commas, takes the second-to-last (city is always before
// state+zip). Returns null on malformed input.
function cityFromFullAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  // Need at least: street, city, state+zip → 3 parts.
  if (parts.length < 3) return null;
  return parts[parts.length - 2] || null;
}

// Convert "2026-04-23T00:00:00" to "2026-04-23".
function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.length < 10) return null;
  // First 10 chars are YYYY-MM-DD regardless of timezone suffix.
  const candidate = trimmed.slice(0, 10);
  // Sanity-check format.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate;
}

// ─────────────────────────────────────────────────────────────────────────
// Fetchers
// ─────────────────────────────────────────────────────────────────────────

async function fetchCommunityData(): Promise<DWCommunity[]> {
  let res: Response;
  try {
    res = await fetch(COMMUNITY_DATA_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley CommunityData fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`David Weekley CommunityData returned HTTP ${res.status}`);
  }
  let body: CommunityDataResponse;
  try {
    body = (await res.json()) as CommunityDataResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley CommunityData non-JSON body: ${msg}`);
  }
  return Array.isArray(body.Communities) ? body.Communities : [];
}

async function fetchShowcases(): Promise<DWShowcase[]> {
  let res: Response;
  try {
    res = await fetch(SHOWCASE_DATA_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley ShowcaseData fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`David Weekley ShowcaseData returned HTTP ${res.status}`);
  }
  let body: ShowcaseDataResponse;
  try {
    body = (await res.json()) as ShowcaseDataResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley ShowcaseData non-JSON body: ${msg}`);
  }
  return Array.isArray(body.Items) ? body.Items : [];
}

// ─────────────────────────────────────────────────────────────────────────
// Per-showcase normalization
// ─────────────────────────────────────────────────────────────────────────

type CommunityLookup = Map<
  string,
  { name: string; city: string; state: string }
>;

function buildCommunityLookup(communities: DWCommunity[]): CommunityLookup {
  const map: CommunityLookup = new Map();
  for (const c of communities) {
    if (!c.Id) continue;
    map.set(c.Id, {
      name: (c.Name || '').trim() || 'Unknown community',
      city: (c.City?.Name || 'Austin').trim(),
      state: (c.City?.StateAbbreviation || 'TX').toUpperCase(),
    });
  }
  return map;
}

function normalize(
  s: DWShowcase,
  lookup: CommunityLookup,
): ScrapedDavidWeekleyRow | null {
  if (!s.Id || typeof s.Id !== 'string' || s.Id.trim().length === 0) {
    return null;
  }

  const community = s.CommunityId ? lookup.get(s.CommunityId) ?? null : null;
  const communityName = community?.name ?? null;

  const planName = s.PlanMasterName?.trim() || null;

  // Title: "The Markham at Double Creek Crossing"
  // Fallback chain: plan+community → plan only → community only → generic.
  let title: string;
  if (planName && communityName) {
    title = `The ${planName} at ${communityName}`;
  } else if (planName) {
    title = `The ${planName}`;
  } else if (communityName) {
    title = `Inventory home at ${communityName}`;
  } else {
    title = `David Weekley inventory home`;
  }

  // City: from FullAddress if parseable, else from community lookup, else default.
  const cityFromAddr = cityFromFullAddress(s.FullAddress);
  const city = cityFromAddr ?? community?.city ?? 'Austin';
  const state = community?.state ?? 'TX';

  // Beds/baths/sqft/price are SCALAR on a showcase (specific home, not range).
  // Store as min=max so range-aware UI continues to work without changes.
  const beds = s.Bedrooms != null && Number.isFinite(s.Bedrooms) ? s.Bedrooms : null;
  const baths = bathsFor(s.FullBaths, s.HalfBaths);
  const sqft =
    s.SquareFootage != null && Number.isFinite(s.SquareFootage) && s.SquareFootage > 0
      ? s.SquareFootage
      : null;
  const price = s.CallForPricing ? null : nonZeroOrNull(s.BasePrice);

  // Property details + geo + virtual tour (ShowcaseData JSON exposes all per
  // home). _-prefixed keys are meta (map / tour); the rest render in the
  // property-details panel.
  const extraDetails: Record<string, string> = {};
  if (planName) extraDetails['Plan'] = planName;
  if (s.Stories) extraDetails['Stories'] = String(s.Stories);
  const garages = nonZeroOrNull(s.Garages);
  if (garages) extraDetails['Garage'] = `${garages}-car`;
  if (typeof s.Latitude === 'number') extraDetails._latitude = String(s.Latitude);
  if (typeof s.Longitude === 'number') extraDetails._longitude = String(s.Longitude);
  if (s.VirtualTour) extraDetails._virtualTourUrl = s.VirtualTour;

  const readyDate = dateOnly(s.ReadyDate);
  const address = s.FullAddress?.trim() || null;

  // Deterministic fallback description: ShowcaseData carries no prose per
  // home, so synthesize one from the structured fields so the inventory
  // detail page has copy where a description would render (Drees/La Cima
  // pull real marketing copy from their feeds; David Weekley's has none).
  const descParts: string[] = [];
  if (planName && communityName) descParts.push(`The ${planName} at ${communityName}`);
  else if (planName) descParts.push(`The ${planName}`);
  else if (communityName) descParts.push(`Inventory home at ${communityName}`);
  const specParts: string[] = [];
  if (beds != null) specParts.push(`${beds} bedrooms`);
  if (baths != null) specParts.push(`${baths} bathrooms`);
  if (sqft != null) specParts.push(`${sqft.toLocaleString()} sq ft`);
  if (price != null) specParts.push(`from $${price.toLocaleString()}`);
  if (specParts.length) descParts.push(specParts.join(', ') + '.');
  if (readyDate) descParts.push(`Ready ${readyDate}.`);
  if (address) descParts.push(`Located at ${address}, ${city}, ${state}.`);
  const description = descParts.join(' ').trim() || null;
  const galleryUrls = s.Thumbnail?.trim() ? [s.Thumbnail.trim()] : null;
  const sourceUrl = normalizeUrl(s.Token);

  return {
    externalId: s.Id,
    builderName: 'David Weekley Homes',
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
    thumbnailUrl: s.Thumbnail?.trim() || null,
    flyerPdfUrl: normalizeUrl(s.Token),
    sourceUrl,
    galleryUrls,
    address,
    readyDate,
    planName,
    communityName,
    homeType: 'showcase',
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDavidWeekleyAustin(): Promise<{
  rows: ScrapedDavidWeekleyRow[];
  rawCount: number;
  skipped: number;
}> {
  // Fetch both endpoints in parallel. CommunityData is non-fatal — if it
  // fails we still produce showcase rows, just without friendly community
  // names (will fall back to "Inventory home").
  const [communities, showcases] = await Promise.all([
    fetchCommunityData().catch((err) => {
      console.warn(`DW CommunityData lookup failed (non-fatal): ${err.message}`);
      return [] as DWCommunity[];
    }),
    fetchShowcases(),
  ]);

  const lookup = buildCommunityLookup(communities);
  const rawCount = showcases.length;

  if (rawCount === 0) {
    throw new Error(
      'David Weekley ShowcaseData returned zero showcases (no inventory?)',
    );
  }

  const rows: ScrapedDavidWeekleyRow[] = [];
  let skipped = 0;
  for (const sc of showcases) {
    const normalized = normalize(sc, lookup);
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }

  return { rows, rawCount, skipped };
}


// ─────────────────────────────────────────────────────────────────────────
// Community-page data extraction (backfill for pre-S13 community rows +
// structured community_data JSONB: home plans, amenities, schools, tax info,
// sales office + driving directions, gallery, price/sqft, lifecycle status).
// ─────────────────────────────────────────────────────────────────────────

const DESCRIPTION_MARKER = "data-bind=\"css: { 'hidden-details': DetailsHidden }\"";

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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Strip tags but preserve line breaks from <br>/<p>/<li> before removing markup.
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

function extractCommunityDescription(html: string): string | null {
  const start = html.indexOf(DESCRIPTION_MARKER);
  if (start === -1) return null;
  const innerStart = html.indexOf('>', start) + 1;
  if (innerStart <= start) return null;
  const end = html.indexOf('</div>', innerStart);
  const inner = end === -1 ? html.slice(innerStart) : html.slice(innerStart, end);
  const text = inner
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const decoded = decodeEntities(text);
  const cleaned = decoded
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}\u2022 /g, '\n\u2022 ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

export type CommunityHomePlan = {
  name: string;
  url?: string | null;
  priceDisplay?: string | null;
  basePrice?: number | null;
  sqftDisplay?: string | null;
  beds?: string | null;
  baths?: string | null;
  garages?: string | null;
  stories?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  isModel?: boolean;
};

export type CommunitySchool = {
  name: string;
  grades?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type CommunityData = {
  communityName?: string | null;
  availability?: string | null;
  status?: 'coming-soon' | 'close-out' | null;
  adultOnly?: boolean;
  priceFrom?: string | null;
  basePrice?: number | null;
  sqftRange?: string | null;
  city?: string | null;
  imageUrls?: string[];
  amenities?: string[];
  salesOffice?: {
    address?: string | null;
    hours?: string | null;
    directions?: string[];
    lat?: number | null;
    lng?: number | null;
  } | null;
  homePlans?: CommunityHomePlan[];
  schools?: { district?: string | null; list: CommunitySchool[] } | null;
  taxInfo?: { entities: { name: string; rate: string }[]; total?: string | null } | null;
};

// The community view model is embedded inline as `window.pageData = { ... };`.
// We brace-balance forward from that opening brace (string-aware) to capture
// the full JSON object, then JSON.parse it.
function extractCommunityViewModel(html: string): Record<string, unknown> | null {
  const anchor = html.indexOf('window.pageData');
  if (anchor === -1) return null;
  const open = html.indexOf('{', anchor);
  if (open === -1) return null;
  let depth = 0;
  let i = open;
  let inStr = false;
  let esc = false;
  while (i < html.length) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
    i++;
  }
  return null;
}

// Render a { Minimum, Maximum } range object as "min-max" or "min".
function rangeText(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { Minimum?: unknown; Maximum?: unknown };
  const min = o.Minimum;
  const max = o.Maximum;
  if (min == null && max == null) return null;
  if (min != null && max != null && String(min) !== String(max)) {
    return `${min}-${max}`;
  }
  return min != null ? String(min) : max != null ? String(max) : null;
}

function deriveStatus(
  availability?: string | null,
  title?: string | null,
): 'coming-soon' | 'close-out' | null {
  const t = `${availability ?? ''} ${title ?? ''}`.toLowerCase();
  if (t.includes('coming soon')) return 'coming-soon';
  if (
    t.includes('final opportunit') ||
    t.includes('close out') ||
    t.includes('close-out') ||
    t.includes('closing soon')
  ) {
    return 'close-out';
  }
  return null;
}

function extractSchools(html: string): { district?: string | null; list: CommunitySchool[] } | null {
  const districtMatch = html.match(/School District:<\/span>\s*([^<]+)/);
  const district = districtMatch ? decodeEntities(districtMatch[1]).trim() : null;
  const list: CommunitySchool[] = [];
  const chunks = html.split('<article class="school-details"').slice(1);
  for (const c of chunks) {
    const end = c.indexOf('</article>');
    const article = end === -1 ? c : c.slice(0, end);
    const nameM = article.match(/school-name">([^<]+)</);
    if (!nameM) continue;
    const rawName = decodeEntities(nameM[1]).trim();
    const gradesM = rawName.match(/\(([^)]+)\)\s*$/);
    const grades = gradesM ? gradesM[1].trim() : null;
    const name = gradesM ? rawName.replace(/\s*\([^)]+\)\s*$/, '').trim() : rawName;
    const addrChunks = article.match(/<address>([\s\S]*?)<\/address>/g) ?? [];
    let address: string | null = null;
    let phone: string | null = null;
    for (const ac of addrChunks) {
      const t = stripTags(ac);
      if (/^[\d().\-\s]+$/.test(t)) phone = t;
      else address = address ?? t.replace(/\n+/g, ', ');
    }
    const webM = article.match(/href="([^"]+)"[^>]*>\s*School Web/);
    list.push({
      name,
      grades,
      address,
      phone,
      website: webM ? webM[1] : null,
    });
  }
  if (!district && list.length === 0) return null;
  return { district, list };
}

function extractTaxInfo(html: string): { entities: { name: string; rate: string }[]; total?: string | null } | null {
  const start = html.indexOf('taxes-name');
  if (start === -1) return null;
  const block = html.slice(start, start + 3000);
  const entities: { name: string; rate: string }[] = [];
  for (const m of block.matchAll(/<div>([^<]+?)<\/div>/g)) {
    const raw = decodeEntities(m[1]).trim();
    const em = raw.match(/^(.+?)\s*[-\u2013]\s*([\d.]+%?)$/);
    if (em) entities.push({ name: em[1].trim(), rate: em[2].trim() });
  }
  const totalM = block.match(/TOTAL[^<]*?([\d.]+%?)/i);
  const total = totalM ? totalM[1] : null;
  if (entities.length === 0 && !total) return null;
  return { entities, total };
}

// Parse a David Weekley community page into the description text + a structured
// community_data blob. Tolerates a missing/failed view model (falls back to
// whatever HTML sections are present).
export function extractCommunityData(html: string): {
  description: string | null;
  communityData: CommunityData;
} {
  const description = extractCommunityDescription(html);
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleM ? decodeEntities(titleM[1]) : null;
  const vm = extractCommunityViewModel(html);
  const cd: CommunityData = {};
  if (vm) {
    const str = (k: string) => (typeof vm[k] === 'string' ? (vm[k] as string) : null);
    const num = (k: string) => (typeof vm[k] === 'number' ? (vm[k] as number) : null);
    cd.availability = str('communityAvailability');
    cd.communityName = str('communityName');
    cd.priceFrom = str('communityFromPrice');
    cd.basePrice = num('basePrice');
    cd.sqftRange = str('communitySqFt');
    cd.city = str('city');
    const imgs = str('imageUrls');
    cd.imageUrls = imgs ? imgs.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const am = str('amenities');
    cd.amenities = am ? am.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const so = vm['salesOffices'];
    if (Array.isArray(so) && so.length > 0) {
      const o = so[0] as Record<string, unknown>;
      const addr = typeof o['Address'] === 'string'
        ? stripTags(o['Address'] as string).replace(/\n+/g, ', ')
        : null;
      const hours = typeof o['Hours'] === 'string' ? stripTags(o['Hours'] as string) : null;
      const dirs = typeof o['DrivingDirections'] === 'string'
        ? stripTags(o['DrivingDirections'] as string)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      let lat: number | null = null;
      let lng: number | null = null;
      const sa = typeof o['SearchableAddress'] === 'string' ? (o['SearchableAddress'] as string) : null;
      if (sa) {
        const [la, lo] = sa.split(',').map((x) => Number(x.trim()));
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          lat = la;
          lng = lo;
        }
      }
      cd.salesOffice = { address: addr, hours, directions: dirs, lat, lng };
    }
    const fps = vm['floorplans'];
    if (Array.isArray(fps)) {
      // First .Url from a photo array (ExteriorPhotos / InteriorPhotos),
      // else null. ExteriorPhotos[0] is the elevation rendering shown on the
      // plan card on davidweekleyhomes.com (MainImageUrl is usually null).
      const firstImg = (arr: unknown): string | null => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const first = arr[0] as Record<string, unknown>;
        const u = first['Url'];
        return typeof u === 'string' ? u : null;
      };
      cd.homePlans = (fps as Record<string, unknown>[])
        .map((p) => {
          const name = typeof p['Name'] === 'string' ? (p['Name'] as string) : '';
          const token = typeof p['Token'] === 'string' ? (p['Token'] as string) : null;
          return {
            name,
            url: token ? `https://www.davidweekleyhomes.com${token}` : null,
            priceDisplay: typeof p['PriceDisplay'] === 'string' ? (p['PriceDisplay'] as string) : null,
            basePrice: typeof p['BasePrice'] === 'number' ? (p['BasePrice'] as number) : null,
            sqftDisplay: typeof p['SquareFootageDisplay'] === 'string' ? (p['SquareFootageDisplay'] as string) : null,
            beds: rangeText(p['Bedrooms']),
            baths: rangeText(p['FullBaths']),
            garages: rangeText(p['Garages']),
            stories: rangeText(p['Stories']),
            imageUrl:
              firstImg(p['ExteriorPhotos']) ??
              firstImg(p['InteriorPhotos']) ??
              (typeof p['MainImageUrl'] === 'string' ? (p['MainImageUrl'] as string) : null),
            status: typeof p['Status'] === 'string' ? (p['Status'] as string) : null,
            isModel: p['DisplayAsModel'] === true || p['IsModel'] === true,
          };
        })
        .filter((p) => p.name);
    }
  }
  cd.schools = extractSchools(html);
  cd.taxInfo = extractTaxInfo(html);
  cd.status = deriveStatus(cd.availability, title);
  return { description, communityData: cd };
}

// Fetch a single David Weekley community page and return its description text
// + structured community_data blob, or null if the page can't be fetched.
export async function fetchDavidWeekleyCommunityData(
  pageUrl: string,
): Promise<{ description: string | null; communityData: CommunityData } | null> {
  let res: Response;
  try {
    res = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  return extractCommunityData(html);
}

// Collect absolute community detail-page URLs linked from a David Weekley
// category/listing page (e.g. /new-homes/tx/austin/coming-soon). The close-out
// and market pages are JS-rendered and yield no server-side community links, so
// this is best-effort — coming-soon is server-rendered and works reliably.
export type CommunityListResult = {
  urls: string[];
  status: number | null;
  htmlLength: number;
  linksFound: number;
  sampleHrefs: string[];
  error: string | null;
};

export async function fetchDavidWeekleyCommunityList(
  listUrl: string,
): Promise<CommunityListResult> {
  let res: Response;
  try {
    res = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch (e) {
    return {
      urls: [],
      status: null,
      htmlLength: 0,
      linksFound: 0,
      sampleHrefs: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!res.ok) {
    return {
      urls: [],
      status: res.status,
      htmlLength: 0,
      linksFound: 0,
      sampleHrefs: [],
      error: `HTTP ${res.status}`,
    };
  }
  const html = await res.text();
  const matches = new Set<string>();
  const allHrefs: string[] = [];
  for (const m of html.matchAll(/href="(\/new-homes\/tx\/[^"]+)"/g)) {
    const path = m[1].replace(/\/$/, '');
    allHrefs.push(path);
    const segs = path.split('/').filter(Boolean);
    // /new-homes/tx/austin/<city>/<community> => 5 segments
    // (market/city pages like /new-homes/tx/austin/bastrop have 4)
    if (
      segs.length === 5 &&
      !/(financing|close-out|coming-soon|design-center|model-home-gallery|homes-ready-soon)/.test(
        path,
      )
    ) {
      matches.add(`https://www.davidweekleyhomes.com${path}`);
    }
  }
  return {
    urls: [...matches],
    status: res.status,
    htmlLength: html.length,
    linksFound: allHrefs.length,
    sampleHrefs: allHrefs.slice(0, 8),
    error: null,
  };
}
