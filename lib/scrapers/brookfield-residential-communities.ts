// lib/scrapers/brookfield-residential-communities.ts
//
// Brookfield Residential — Austin-area COMMUNITY scraper. Companion to the
// quick-move-in scraper (brookfield-residential.ts). One row per community,
// home_type='community', kind='listing', publication='realtyline' (Austin).
//
// Data source: the same Brookfield Sitecore Discover API, queried twice:
//   1. type=Community  → community records (amenities, schools/POIs, sales
//      centers, status, geo, price/sqft/bed/bath ranges, hero image)
//   2. type=Plan      → floor-plan records, grouped per community into
//      communityData.homePlans (name, beds/baths/sqft/price, elevation image)
// Communities are narrowed to the Austin-area bounding box (same box the
// move-in scraper uses) via community_geo.
//
// Field standard: docs/community-scraper-template.md
// (communities/6 — Barksdale, M/I Homes — is the gold-standard example).

import type { CommunityData, CommunityHomePlan, CommunitySchool } from './david-weekley';

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

// Austin-area bounding box (Travis County region). Same scope the move-in
// scraper uses — keep only communities whose community_geo falls inside it.
const AUSTIN_BBOX = {
  minLng: -98.32931627856341,
  minLat: 29.648959758996735,
  maxLng: -97.12951477134061,
  maxLat: 30.77463254100326,
};

const PAGE_SIZE = 100;
const GALLERY_LIMIT = 30;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Subset of a Sitecore Discover "Community" record — only fields we read. */
interface BrookfieldCommunity {
  id?: string;
  name?: string;
  url?: string;
  image_url?: string;
  minimumprice?: number;
  maximumprice?: number;
  minimumsquarefootage?: number;
  maximumsquarefootage?: number;
  minimumresidencebedrooms?: number;
  maximumresidencebedrooms?: number;
  minimumtotalbaths?: number;
  maximumtotalbaths?: number;
  minimumstories?: number;
  maximumstories?: number;
  minimumresidencegarage?: number;
  is55plus?: boolean | string;
  community_itemid?: string;
  community_name?: string;
  community_url?: string;
  community_addressline1?: string;
  community_geo?: string;
  community_city?: string;
  community_stateorprovince?: string;
  community_zipcode?: string;
  community_phonenumber?: string;
  community_status?: string;
  community_substatus?: string;
  community_description?: string;
  community_details?: string;
  community_headline?: string;
  community_amenities?: Array<{ name?: string; icon?: string }>;
  community_features?: Array<{ name?: string; description?: string; geo?: string }>;
  salescenters?: BrookfieldSalesCenter[];
}

interface BrookfieldSalesCenter {
  streetaddress1?: string;
  city?: string;
  state_province?: string;
  phonenumber?: string;
  geo?: string;
  latitude?: string;
  longitude?: string;
  mondayclosed?: boolean;
  mondaystarttime?: string;
  mondayendtime?: string;
  tuesdayclosed?: boolean;
  tuesdaystarttime?: string;
  tuesdayendtime?: string;
  wednesdayclosed?: boolean;
  wednesdaystarttime?: string;
  wednesdayendtime?: string;
  thursdayclosed?: boolean;
  thursdaystarttime?: string;
  thursdayendtime?: string;
  fridayclosed?: boolean;
  fridaystarttime?: string;
  fridayendtime?: string;
  saturdayclosed?: boolean;
  saturdaystarttime?: string;
  saturdayendtime?: string;
  sundayclosed?: boolean;
  sundaystarttime?: string;
  sundayendtime?: string;
}

/** Subset of a Sitecore Discover "Plan" record — only fields we read. */
interface BrookfieldPlan {
  id?: string;
  name?: string;
  url?: string;
  image_url?: string;
  floorplan_imageurl?: string;
  minimumprice?: number;
  maximumprice?: number;
  minimumsquarefootage?: number;
  maximumsquarefootage?: number;
  minimumresidencebedrooms?: number;
  maximumresidencebedrooms?: number;
  minimumtotalbaths?: number;
  minimumresidencefullbaths?: number;
  minimumresidencegarage?: number;
  minimumstories?: number;
  plan_status?: string;
  community_itemid?: string;
  community_name?: string;
}

interface DiscoverResponse {
  widgets?: Array<{
    content?: BrookfieldCommunity[] | BrookfieldPlan[];
    total_item?: number;
  }>;
}

export interface ScrapedBrookfieldCommunityRow {
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
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  galleryUrls: string[];
  communityName: string;
  homeType: 'community';
  communityData: CommunityData;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
}

/** Parse a "lat,lng" geo string into [lat, lng]. */
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

function stateToAbbrev(state: string | null | undefined): string | null {
  if (!state) return null;
  const map: Record<string, string> = { texas: 'TX' };
  return map[state.trim().toLowerCase()] ?? null;
}

function fmtInt(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return n.toLocaleString('en-US');
}

/** "From $390,000" for a single price, "$390,000 - $557,990" for a range. */
function formatPriceRange(min: number | null, max: number | null): string | null {
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo && hi && lo !== hi) return `$${fmtInt(lo)} - $${fmtInt(hi)}`;
  if (lo) return `From $${fmtInt(lo)}`;
  if (hi) return `From $${fmtInt(hi)}`;
  return null;
}

function formatIntRange(min: number | null, max: number | null): string | null {
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo && hi && lo !== hi) return `${fmtInt(lo)} - ${fmtInt(hi)}`;
  if (lo) return fmtInt(lo);
  if (hi) return fmtInt(hi);
  return null;
}

/** Derive the public lifecycle badge from Brookfield status strings. */
function deriveStatus(
  status: string | null,
  substatus: string | null,
): 'coming-soon' | 'close-out' | null {
  const hay = `${status ?? ''} ${substatus ?? ''}`.toLowerCase();
  if (/coming soon|pre-selling|grand opening/.test(hay)) return 'coming-soon';
  if (/close.?out|final opportunit|closing soon|sold out/.test(hay)) return 'close-out';
  return null;
}

const SCHOOL_RE =
  /elementary|intermediate|middle school|high school|academy|\bisd\b|\bschool\b|k-12|pre-?k|primary|college prep/i;

/** A feature is a school if its name reads like one. */
function isSchoolFeature(name: string | null): boolean {
  if (!name) return false;
  return SCHOOL_RE.test(name);
}

/** "10:00" from an ISO-ish datetime the sales-center payload uses. */
function timeOfDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : null;
}

function to12h(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]}${ap}`;
}

/** Build a compact hours string from a sales center's per-day open/close. */
function buildSalesHours(sc: BrookfieldSalesCenter): string | null {
  const days: Array<{ abbr: string; closed: boolean; start: string | null; end: string | null }> = [
    { abbr: 'Mon', closed: !!sc.mondayclosed, start: timeOfDay(sc.mondaystarttime), end: timeOfDay(sc.mondayendtime) },
    { abbr: 'Tue', closed: !!sc.tuesdayclosed, start: timeOfDay(sc.tuesdaystarttime), end: timeOfDay(sc.tuesdayendtime) },
    { abbr: 'Wed', closed: !!sc.wednesdayclosed, start: timeOfDay(sc.wednesdaystarttime), end: timeOfDay(sc.wednesdayendtime) },
    { abbr: 'Thu', closed: !!sc.thursdayclosed, start: timeOfDay(sc.thursdaystarttime), end: timeOfDay(sc.thursdayendtime) },
    { abbr: 'Fri', closed: !!sc.fridayclosed, start: timeOfDay(sc.fridaystarttime), end: timeOfDay(sc.fridayendtime) },
    { abbr: 'Sat', closed: !!sc.saturdayclosed, start: timeOfDay(sc.saturdaystarttime), end: timeOfDay(sc.saturdayendtime) },
    { abbr: 'Sun', closed: !!sc.sundayclosed, start: timeOfDay(sc.sundaystarttime), end: timeOfDay(sc.sundayendtime) },
  ];
  const open = days.filter((d) => !d.closed && d.start && d.end);
  if (open.length === 0) return null;
  // Group consecutive days that share the same (start,end) window.
  const groups: Array<{ days: string[]; start: string; end: string }> = [];
  for (const d of open) {
    const last = groups[groups.length - 1];
    if (last && last.start === d.start && last.end === d.end) {
      last.days.push(d.abbr);
    } else {
      groups.push({ days: [d.abbr], start: d.start!, end: d.end! });
    }
  }
  const parts = groups.map((g) => {
    const span =
      g.days.length > 1 ? `${g.days[0]}-${g.days[g.days.length - 1]}` : g.days[0];
    return `${span} ${to12h(g.start)}-${to12h(g.end)}`;
  });
  return parts.join(', ');
}

// ─── Discover API ────────────────────────────────────────────────────────────

async function fetchDiscoverPage<T>(
  typeValue: 'Community' | 'Plan',
  offset: number,
): Promise<{ content: T[]; total: number }> {
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
                { name: 'type', type: 'eq', value: typeValue },
                { name: 'state_name', type: 'eq', value: 'Texas' },
              ],
            },
            sort: { value: [{ name: 'community_name_ascending' }], choices: true },
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
    throw new Error(`Brookfield Discover fetch failed (${typeValue} offset ${offset}): ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Brookfield Discover returned HTTP ${res.status} (${typeValue} offset ${offset})`);
  }

  let body: DiscoverResponse;
  try {
    body = (await res.json()) as DiscoverResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Brookfield Discover non-JSON body (${typeValue} offset ${offset}): ${msg}`);
  }

  const widget = body.widgets?.[0];
  const content = Array.isArray(widget?.content) ? (widget!.content as T[]) : [];
  const total = widget?.total_item ?? content.length;
  return { content, total };
}

async function fetchAllDiscover<T>(typeValue: 'Community' | 'Plan'): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const { content, total: t } = await fetchDiscoverPage<T>(typeValue, offset);
    if (t !== undefined) total = t;
    if (content.length === 0) break;
    all.push(...content);
    offset += PAGE_SIZE;
    if (content.length < PAGE_SIZE) break;
  }
  return all;
}

// ─── Normalize ───────────────────────────────────────────────────────────────

function buildCommunityAddress(
  c: BrookfieldCommunity,
  stateAbbrev: string | null,
  sc: BrookfieldSalesCenter | null,
): string | null {
  const line1 = str(sc?.streetaddress1) ?? str(c.community_addressline1);
  if (!line1) return null;
  const city = str(sc?.city) ?? str(c.community_city);
  const state = stateAbbrev ?? stateToAbbrev(c.community_stateorprovince);
  const zip = str(c.community_zipcode);
  const parts = [line1, city && state ? `${city}, ${state}` : city, zip].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function synthesizeDescription(c: BrookfieldCommunity, ctx: {
  priceFrom: string | null;
  sqftRange: string | null;
  beds: string | null;
  address: string | null;
}): string {
  const segments: string[] = [];
  const name = str(c.name);
  const city = str(c.community_city);
  if (name) {
    segments.push(`${name}${city ? `, ${city}` : ''}.`);
  }
  const stats: string[] = [];
  if (ctx.beds) stats.push(`${ctx.beds} bedrooms`);
  if (ctx.sqftRange) stats.push(`${ctx.sqftRange} sq ft`);
  if (ctx.priceFrom) stats.push(ctx.priceFrom);
  if (stats.length) segments.push(stats.join(', ') + '.');
  if (ctx.address) segments.push(`Sales office: ${ctx.address}.`);
  return segments.join(' ');
}

function normalizeCommunity(
  c: BrookfieldCommunity,
  plans: BrookfieldPlan[],
): ScrapedBrookfieldCommunityRow | null {
  const externalId = str(c.id);
  const communityName = str(c.name) ?? str(c.community_name);
  if (!externalId || !communityName) return null;

  const stateAbbrev =
    stateToAbbrev(c.community_stateorprovince) ?? 'TX';

  const priceMin = num(c.minimumprice);
  const priceMax = num(c.maximumprice);
  const sqftMin = num(c.minimumsquarefootage);
  const sqftMax = num(c.maximumsquarefootage);
  const bedsMin = num(c.minimumresidencebedrooms);
  const bedsMax = num(c.maximumresidencebedrooms);
  const bathsMin = num(c.minimumtotalbaths);
  const bathsMax = num(c.maximumtotalbaths);

  const priceFrom = formatPriceRange(priceMin, priceMax);
  const sqftRange = formatIntRange(sqftMin, sqftMax);
  const bedsLabel = bedsMin ? String(bedsMin) : null;

  const sc = Array.isArray(c.salescenters) && c.salescenters.length > 0 ? c.salescenters[0] : null;
  const address = buildCommunityAddress(c, stateAbbrev, sc);

  const scGeo = parseGeo(sc?.geo) ??
    (sc?.latitude && sc?.longitude ? [Number(sc.latitude), Number(sc.longitude)] : null) ??
    parseGeo(c.community_geo);

  const status = deriveStatus(str(c.community_status), str(c.community_substatus));
  const adultOnly = String(c.is55plus ?? '').toLowerCase() === 'true';

  // Amenities — clean list from community_amenities.
  const amenities: string[] = [];
  for (const a of c.community_amenities ?? []) {
    const n = str(a?.name);
    if (n && !amenities.includes(n)) amenities.push(n);
  }

  // Schools — features whose names read like schools.
  const schoolList: CommunitySchool[] = [];
  for (const f of c.community_features ?? []) {
    const n = str(f?.name);
    if (n && isSchoolFeature(n) && !schoolList.some((s) => s.name === n)) {
      schoolList.push({ name: n, grades: null, address: null, phone: null, website: null });
    }
  }
  const schools =
    schoolList.length > 0 ? { district: null, list: schoolList } : null;

  // Sales office.
  const hours = sc ? buildSalesHours(sc) : null;
  const salesOffice =
    address || scGeo || hours
      ? {
          address,
          hours,
          directions: undefined,
          lat: scGeo ? scGeo[0] : null,
          lng: scGeo ? scGeo[1] : null,
        }
      : null;

  // Home plans — the Plan records linked to this community.
  const homePlans: CommunityHomePlan[] = [];
  for (const p of plans) {
    const planName = str(p.name);
    if (!planName) continue;
    const pMin = num(p.minimumprice);
    const pMax = num(p.maximumprice);
    const sMin = num(p.minimumsquarefootage);
    const sMax = num(p.maximumsquarefootage);
    const pBeds = num(p.minimumresidencebedrooms);
    const pBaths = num(p.minimumtotalbaths) ?? num(p.minimumresidencefullbaths);
    const plan: CommunityHomePlan = {
      name: planName,
      url: normalizeUrl(p.url),
      priceDisplay: formatPriceRange(pMin, pMax),
      basePrice: pMin ?? null,
      sqftDisplay: formatIntRange(sMin, sMax),
      beds: pBeds ? String(pBeds) : null,
      baths: pBaths ? String(pBaths) : null,
      garages: num(p.minimumresidencegarage) ? String(num(p.minimumresidencegarage)) : null,
      stories: num(p.minimumstories) ? String(num(p.minimumstories)) : null,
      imageUrl: str(p.image_url) ?? str(p.floorplan_imageurl),
      status: str(p.plan_status),
      isModel: false,
    };
    homePlans.push(plan);
  }

  // Gallery: hero image + unique plan elevations.
  const imageUrls: string[] = [];
  const hero = str(c.image_url);
  if (hero) imageUrls.push(hero);
  for (const p of plans) {
    const img = str(p.image_url);
    if (img && !imageUrls.includes(img)) imageUrls.push(img);
    if (imageUrls.length >= GALLERY_LIMIT) break;
  }

  const description =
    str(c.community_description) ??
    str(c.community_details) ??
    str(c.community_headline) ??
    synthesizeDescription(c, { priceFrom, sqftRange, beds: bedsLabel, address });

  const communityData: CommunityData = {
    communityName,
    status,
    adultOnly,
    priceFrom,
    basePrice: priceMin ?? null,
    sqftRange,
    city: str(c.community_city),
    imageUrls,
    amenities: amenities.length > 0 ? amenities : undefined,
    salesOffice,
    homePlans,
    schools,
    taxInfo: null,
  };

  return {
    externalId,
    builderName: 'Brookfield Residential',
    title: communityName,
    city: str(c.community_city) ?? 'Austin',
    state: stateAbbrev,
    description,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax,
    thumbnailUrl: hero,
    sourceUrl: normalizeUrl(c.url) ?? normalizeUrl(c.community_url),
    galleryUrls: imageUrls,
    communityName,
    homeType: 'community',
    communityData,
  };
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Fetch Brookfield Residential communities for the Austin area, plus their
 * floor plans, and return normalized community rows ready for upsert.
 */
export async function fetchBrookfieldResidentialCommunities(): Promise<{
  rows: ScrapedBrookfieldCommunityRow[];
  rawCount: number;
  planCount: number;
  skipped: number;
}> {
  const [communities, plans] = await Promise.all([
    fetchAllDiscover<BrookfieldCommunity>('Community'),
    fetchAllDiscover<BrookfieldPlan>('Plan'),
  ]);

  // Narrow to the Austin-area bounding box via community geo.
  const austin = communities.filter((c) => {
    const geo = parseGeo(c.community_geo);
    return geo ? inAustinBbox(geo[0], geo[1]) : false;
  });

  const rawCount = austin.length;
  if (rawCount === 0) {
    return { rows: [], rawCount: 0, planCount: plans.length, skipped: 0 };
  }

  // Index plans by community_itemid (fall back to community_name).
  const plansByCommunity = new Map<string, BrookfieldPlan[]>();
  for (const p of plans) {
    const key = str(p.community_itemid) ?? str(p.community_name);
    if (!key) continue;
    const arr = plansByCommunity.get(key) ?? [];
    arr.push(p);
    plansByCommunity.set(key, arr);
  }

  const rows: ScrapedBrookfieldCommunityRow[] = [];
  let skipped = 0;
  for (const c of austin) {
    const key = str(c.community_itemid) ?? str(c.community_name);
    const cPlans = key ? plansByCommunity.get(key) ?? [] : [];
    const row = normalizeCommunity(c, cPlans);
    if (row) rows.push(row);
    else skipped++;
  }

  return { rows, rawCount, planCount: plans.length, skipped };
}
