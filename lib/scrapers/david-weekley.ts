// lib/scrapers/david-weekley.ts
//
// Fetches David Weekley Homes Austin communities from THREE public JSON APIs
// and aggregates per-community fields by unioning the data:
//   1. CommunityData    — 26 community headers (name/city/sqft/priceMin/thumbnail)
//   2. FloorPlanData    — 156 plan templates with Bedrooms.Min/Max ranges
//   3. ShowcaseData     —  77 specific inventory homes ("Quick Move-ins")
//
// Why both Plan and Showcase: some communities (~6 of 26) have stopped offering
// build-to-order floor plans and only sell inventory homes. ShowcaseData
// covers them. Conversely some communities have plans but no inventory.
// Most have both. Union gives full coverage.
//
// API details:
//   GET /Search/CommunityData?marketId=markets%2F4
//     Returns: { Communities: [{Id, Name, City, BasePrice, MinSqFootage, ...}] }
//   GET /Search/FloorPlanData?marketId=markets%2F4&pageNumber=1
//     Returns: { Items: [{Id: "FloorPlans/...", CommunityId, BasePrice,
//                Bedrooms:{Min,Max}, FullBaths:{Min,Max}, ...}] }
//   GET /Search/ShowcaseData?marketId=markets%2F4
//     Returns: { Items: [{Id: "showcases/...", CommunityId, BasePrice,
//                Bedrooms: 4 (scalar), FullBaths: 3 (scalar),
//                SquareFootage: 3993, ...}] }
//
// All three use case-sensitive uppercase `Search` and 301-redirect to
// lowercase; `redirect: 'follow'` required.
//
// Austin's market ID is "markets/4". URL-encode the slash.
//
// Bath convention: FullBaths + 0.5 * HalfBaths (e.g. "3 full + 1 half" = 3.5).
// Decimal column required in DB.
//
// Aggregation pattern: for each community Id, collect data points from both
// FloorPlans (use Min and Max of each ranged field) and Showcases (use the
// scalar value). Take min/max across all collected points. Empty if neither
// source has data for that community.
//
// Per-community fields after aggregation merge:
//   Id              → externalId
//   Name            → title
//   City.Name       → city
//   BasePrice/OverrideBasePrice  → priceMin
//                                  OR min across plan+showcase BasePrice if null
//   priceMax        → max across plan+showcase BasePrice
//   MinSqFootage    → sqftMin (CommunityData)
//                     OR min from FloorPlan.SquareFootage.Min + Showcase.SquareFootage
//   MaxSqFootage    → sqftMax  (CommunityData)
//                     OR max from same sources
//   Thumbnail       → thumbnailUrl
//   Token           → flyerPdfUrl (community page URL)
//   bedsMin/Max    → from FloorPlan.Bedrooms.{Min,Max} + Showcase.Bedrooms scalar
//   bathsMin/Max   → from FloorPlan.{FullBaths+0.5*HalfBaths}{Min,Max} +
//                       Showcase.{FullBaths + 0.5*HalfBaths} scalar

const COMMUNITY_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/CommunityData?marketId=markets%2F4';

const FLOOR_PLAN_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/FloorPlanData?marketId=markets%2F4&pageNumber=1';

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
  Token?: string | null;
  StateAbbreviation?: string | null;
  Title?: string | null;
};

type DWCommunity = {
  Id?: string | null;
  Token?: string | null;
  Name?: string | null;
  CommunityNumber?: string | null;
  City?: DWCity | null;
  BasePrice?: number | null;
  OverrideBasePrice?: number | null;
  IsOverrideBasePrice?: boolean | null;
  MinSqFootage?: number | null;
  MaxSqFootage?: number | null;
  OverrideSqFootage?: number | null;
  IsOverrideSqFootage?: boolean | null;
  Thumbnail?: string | null;
  CallForPricing?: boolean | null;
  HidePlans?: boolean | null;
  HideShowcases?: boolean | null;
  FloorPlanCount?: number | null;
  ShowcaseCount?: number | null;
  CommunityType?: string | null;
};

type CommunityDataResponse = {
  Communities?: DWCommunity[] | null;
  NeighborhoodGroups?: unknown[] | null;
  CurrentMarketName?: string | null;
};

type DWMinMax = {
  Minimum?: number | null;
  Maximum?: number | null;
};

type DWFloorPlan = {
  Id?: string | null;
  CommunityId?: string | null;
  PlanMasterName?: string | null;
  BasePrice?: number | null;
  Bedrooms?: DWMinMax | null;
  FullBaths?: DWMinMax | null;
  HalfBaths?: DWMinMax | null;
  SquareFootage?: DWMinMax | null;
  Stories?: DWMinMax | null;
  Garages?: DWMinMax | null;
};

type FloorPlanDataResponse = {
  PageSize?: number | null;
  PageNumber?: number | null;
  TotalResults?: number | null;
  TotalPages?: number | null;
  MoreResults?: boolean | null;
  Items?: DWFloorPlan[] | null;
};

// Showcase fields are scalars, not nested Min/Max ranges — each showcase
// is a specific home, not a plan template with variants.
type DWShowcase = {
  Id?: string | null;
  CommunityId?: string | null;
  PlanMasterName?: string | null;
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
};

type ShowcaseDataResponse = {
  PageSize?: number | null;
  PageNumber?: number | null;
  TotalResults?: number | null;
  TotalPages?: number | null;
  MoreResults?: boolean | null;
  Items?: DWShowcase[] | null;
};

// Per-community aggregate combining FloorPlan + Showcase data
type CommunityAggregate = {
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — same as ScrapedKBHomeRow / ScrapedMIHomesRow with
// builderName narrowed to 'David Weekley Homes'.
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

function minOfDefined(arr: Array<number | null | undefined>): number | null {
  const valid = arr.filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  );
  return valid.length > 0 ? Math.min(...valid) : null;
}

function maxOfDefined(arr: Array<number | null | undefined>): number | null {
  const valid = arr.filter(
    (n): n is number => n != null && Number.isFinite(n) && n > 0,
  );
  return valid.length > 0 ? Math.max(...valid) : null;
}

function bathsFor(fullBaths: number | null | undefined, halfBaths: number | null | undefined): number | null {
  if (fullBaths == null || !Number.isFinite(fullBaths)) return null;
  const halves = halfBaths != null && Number.isFinite(halfBaths) ? halfBaths : 0;
  return fullBaths + 0.5 * halves;
}

// ─────────────────────────────────────────────────────────────────────────
// FloorPlanData + ShowcaseData fetch and combined aggregation
// ─────────────────────────────────────────────────────────────────────────

// Per-community pools of data points across both endpoints. We collect raw
// values into arrays then compute min/max once at the end.
type CommunityPool = {
  beds: number[];
  baths: number[];
  sqftMins: number[];
  sqftMaxes: number[];
  prices: number[];
};

async function fetchFloorPlans(): Promise<DWFloorPlan[]> {
  try {
    const res = await fetch(FLOOR_PLAN_DATA_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`DW FloorPlanData HTTP ${res.status} (non-fatal)`);
      return [];
    }
    const body = (await res.json()) as FloorPlanDataResponse;
    return Array.isArray(body.Items) ? body.Items : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DW FloorPlanData failed (non-fatal): ${msg}`);
    return [];
  }
}

async function fetchShowcases(): Promise<DWShowcase[]> {
  try {
    const res = await fetch(SHOWCASE_DATA_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`DW ShowcaseData HTTP ${res.status} (non-fatal)`);
      return [];
    }
    const body = (await res.json()) as ShowcaseDataResponse;
    return Array.isArray(body.Items) ? body.Items : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DW ShowcaseData failed (non-fatal): ${msg}`);
    return [];
  }
}

function buildAggregates(
  plans: DWFloorPlan[],
  showcases: DWShowcase[],
): Map<string, CommunityAggregate> {
  const pools = new Map<string, CommunityPool>();

  function getPool(cid: string): CommunityPool {
    let p = pools.get(cid);
    if (!p) {
      p = { beds: [], baths: [], sqftMins: [], sqftMaxes: [], prices: [] };
      pools.set(cid, p);
    }
    return p;
  }

  // FloorPlan: each plan has Min/Max ranges. Push both endpoints.
  for (const plan of plans) {
    if (!plan.CommunityId) continue;
    const pool = getPool(plan.CommunityId);

    const bMin = plan.Bedrooms?.Minimum;
    const bMax = plan.Bedrooms?.Maximum;
    if (bMin != null && Number.isFinite(bMin)) pool.beds.push(bMin);
    if (bMax != null && Number.isFinite(bMax)) pool.beds.push(bMax);

    const baMin = bathsFor(plan.FullBaths?.Minimum, plan.HalfBaths?.Minimum ?? 0);
    const baMax = bathsFor(plan.FullBaths?.Maximum, plan.HalfBaths?.Maximum ?? 0);
    if (baMin != null) pool.baths.push(baMin);
    if (baMax != null) pool.baths.push(baMax);

    const sMin = plan.SquareFootage?.Minimum;
    const sMax = plan.SquareFootage?.Maximum;
    if (sMin != null && Number.isFinite(sMin) && sMin > 0) pool.sqftMins.push(sMin);
    if (sMax != null && Number.isFinite(sMax) && sMax > 0) pool.sqftMaxes.push(sMax);

    if (plan.BasePrice != null && Number.isFinite(plan.BasePrice) && plan.BasePrice > 0) {
      pool.prices.push(plan.BasePrice);
    }
  }

  // Showcase: each home has scalar values. Push as a single data point.
  for (const sc of showcases) {
    if (!sc.CommunityId) continue;
    const pool = getPool(sc.CommunityId);

    if (sc.Bedrooms != null && Number.isFinite(sc.Bedrooms)) {
      pool.beds.push(sc.Bedrooms);
    }
    const baths = bathsFor(sc.FullBaths, sc.HalfBaths);
    if (baths != null) pool.baths.push(baths);

    if (sc.SquareFootage != null && Number.isFinite(sc.SquareFootage) && sc.SquareFootage > 0) {
      pool.sqftMins.push(sc.SquareFootage);
      pool.sqftMaxes.push(sc.SquareFootage);
    }

    if (sc.BasePrice != null && Number.isFinite(sc.BasePrice) && sc.BasePrice > 0) {
      pool.prices.push(sc.BasePrice);
    }
  }

  // Reduce pools to aggregates
  const aggregates = new Map<string, CommunityAggregate>();
  for (const [cid, pool] of pools) {
    aggregates.set(cid, {
      bedsMin: pool.beds.length > 0 ? Math.min(...pool.beds) : null,
      bedsMax: pool.beds.length > 0 ? Math.max(...pool.beds) : null,
      bathsMin: pool.baths.length > 0 ? Math.min(...pool.baths) : null,
      bathsMax: pool.baths.length > 0 ? Math.max(...pool.baths) : null,
      sqftMin: minOfDefined(pool.sqftMins),
      sqftMax: maxOfDefined(pool.sqftMaxes),
      priceMin: minOfDefined(pool.prices),
      priceMax: maxOfDefined(pool.prices),
    });
  }

  return aggregates;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-community normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(
  c: DWCommunity,
  aggregates: Map<string, CommunityAggregate>,
): ScrapedDavidWeekleyRow | null {
  if (!c.Id || typeof c.Id !== 'string' || c.Id.trim().length === 0) {
    return null;
  }

  const title = (c.Name || '').trim();
  if (!title) return null;

  const cityName = (c.City?.Name || 'Austin').trim();
  const stateAbbrev = (c.City?.StateAbbreviation || 'TX').toUpperCase();

  const agg = aggregates.get(c.Id) ?? null;

  // Price: CommunityData first, then aggregate fallback.
  let priceMin: number | null = null;
  if (c.IsOverrideBasePrice && c.OverrideBasePrice) {
    priceMin = nonZeroOrNull(c.OverrideBasePrice);
  } else {
    priceMin = nonZeroOrNull(c.BasePrice);
  }
  if (priceMin == null && agg) priceMin = agg.priceMin;

  const priceMax = agg?.priceMax ?? null;

  // Sqft: CommunityData first, then aggregate fallback.
  let sqftMin: number | null = null;
  let sqftMax: number | null = null;
  if (c.IsOverrideSqFootage && c.OverrideSqFootage) {
    const overrideVal = nonZeroOrNull(c.OverrideSqFootage);
    sqftMin = overrideVal;
    sqftMax = overrideVal;
  } else {
    sqftMin = nonZeroOrNull(c.MinSqFootage);
    sqftMax = nonZeroOrNull(c.MaxSqFootage);
  }
  if (sqftMin == null && agg) sqftMin = agg.sqftMin;
  if (sqftMax == null && agg) sqftMax = agg.sqftMax;

  // Beds/baths come ONLY from aggregates (CommunityData has no fields).
  const bedsMin = agg?.bedsMin ?? null;
  const bedsMax = agg?.bedsMax ?? null;
  const bathsMin = agg?.bathsMin ?? null;
  const bathsMax = agg?.bathsMax ?? null;

  const thumbnailUrl = c.Thumbnail?.trim() || null;
  const flyerPdfUrl = normalizeUrl(c.Token);

  return {
    externalId: c.Id,
    builderName: 'David Weekley Homes',
    title,
    city: cityName,
    state: stateAbbrev,
    description: null,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax,
    thumbnailUrl,
    flyerPdfUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public: fetch + normalize
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

export async function fetchDavidWeekleyAustin(): Promise<{
  rows: ScrapedDavidWeekleyRow[];
  rawCount: number;
  skipped: number;
}> {
  // Fetch all three endpoints in parallel. CommunityData is required; the
  // other two are enrichment-only and degrade gracefully if they fail.
  const [communities, plans, showcases] = await Promise.all([
    fetchCommunityData(),
    fetchFloorPlans(),
    fetchShowcases(),
  ]);

  const rawCount = communities.length;

  if (rawCount === 0) {
    throw new Error(
      'David Weekley CommunityData returned zero communities (marketId stale?)',
    );
  }

  const aggregates = buildAggregates(plans, showcases);

  const rows: ScrapedDavidWeekleyRow[] = [];
  let skipped = 0;
  for (const c of communities) {
    const normalized = normalize(c, aggregates);
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }

  return { rows, rawCount, skipped };
}
