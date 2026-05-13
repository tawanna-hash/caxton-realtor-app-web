// lib/scrapers/david-weekley.ts
//
// Fetches David Weekley Homes Austin communities from their public
// CommunityData JSON API and enriches per-community fields (beds/baths/sqft
// /price max) using the FloorPlanData JSON API.
//
// API details (CommunityData discovered Session 12, FloorPlanData added
// Session 13 to fill in null beds/baths/etc fields):
//   Endpoint 1: GET /Search/CommunityData?marketId=markets%2F4
//     Returns: 26 community objects with Name/City/BasePrice/SqFootage/Thumbnail
//     Does NOT include beds/baths data, no description, no priceMax
//   Endpoint 2: GET /Search/FloorPlanData?marketId=markets%2F4&pageNumber=1
//     Returns: 156 floor-plan objects, each tagged with CommunityId.
//     Has the missing fields: Bedrooms.Min/Max, FullBaths.Min/Max,
//     HalfBaths.Min/Max, SquareFootage.Min/Max, BasePrice.
//   Both URLs use case-sensitive uppercase Search; server 301-redirects to
//   lowercase. `redirect: 'follow'` is required.
//
// Austin's market ID is "markets/4" — confirmed Session 12 from the
// listing page's `<input id="MarketId" value="markets/4" />` field.
//
// Per-community fields we read (after enrichment merge):
//   Id              → externalId
//   Name            → title
//   City.Name       → city
//   City.StateAbbreviation → state
//   BasePrice       → priceMin  (CommunityData)
//                     OR min(plan.BasePrice) where set  (FloorPlanData fallback)
//   priceMax        → max(plan.BasePrice) across plans  (FloorPlanData)
//   MinSqFootage    → sqftMin (CommunityData)
//                     OR min(plan.SquareFootage.Min)  (FloorPlanData fallback)
//   MaxSqFootage    → sqftMax (CommunityData)
//                     OR max(plan.SquareFootage.Max)  (FloorPlanData fallback)
//   Thumbnail       → thumbnailUrl
//   Token           → flyerPdfUrl (community page URL)
//   beds/baths     → aggregated from FloorPlanData
//                     bathsTotal per plan = FullBaths + 0.5 * HalfBaths
//                     so values like 2.5 / 3.5 are expected
//
// Communities without listed floor plans (e.g. pre-launch, sold out) appear
// in CommunityData but have zero plans in FloorPlanData — those stay with
// null beds/baths/priceMax fields and the existing CommunityData values for
// sqft/priceMin.

const COMMUNITY_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/CommunityData?marketId=markets%2F4';

const FLOOR_PLAN_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/FloorPlanData?marketId=markets%2F4&pageNumber=1';

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

// Per-community aggregate after grouping floor plans
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

// ─────────────────────────────────────────────────────────────────────────
// FloorPlanData fetch + aggregation
// ─────────────────────────────────────────────────────────────────────────

async function fetchFloorPlanAggregates(): Promise<
  Map<string, CommunityAggregate>
> {
  let res: Response;
  try {
    res = await fetch(FLOOR_PLAN_DATA_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    // FloorPlanData failure is non-fatal — we still want the CommunityData
    // rows even without enrichment. Log and return empty aggregates.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`David Weekley FloorPlanData fetch failed (non-fatal): ${msg}`);
    return new Map();
  }

  if (!res.ok) {
    console.warn(
      `David Weekley FloorPlanData returned HTTP ${res.status} (non-fatal)`,
    );
    return new Map();
  }

  let body: FloorPlanDataResponse;
  try {
    body = (await res.json()) as FloorPlanDataResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `David Weekley FloorPlanData non-JSON body (non-fatal): ${msg}`,
    );
    return new Map();
  }

  const plans = Array.isArray(body.Items) ? body.Items : [];
  if (plans.length === 0) return new Map();

  // Group plans by CommunityId
  const grouped = new Map<string, DWFloorPlan[]>();
  for (const p of plans) {
    if (!p.CommunityId) continue;
    const existing = grouped.get(p.CommunityId);
    if (existing) {
      existing.push(p);
    } else {
      grouped.set(p.CommunityId, [p]);
    }
  }

  // Aggregate min/max per community.
  // Convention: bathsTotal = FullBaths + 0.5 * HalfBaths (industry standard,
  // produces decimals like 2.5, 3.5). If the DB column is integer-only, this
  // will fail and need to be reduced to integers or written to a different
  // column.
  const aggregates = new Map<string, CommunityAggregate>();
  for (const [communityId, communityPlans] of grouped) {
    const beds: number[] = [];
    const bathsTotals: number[] = [];
    const sqftMins: number[] = [];
    const sqftMaxes: number[] = [];
    const prices: number[] = [];

    for (const p of communityPlans) {
      // Beds: take both endpoints of the plan's range
      const bMin = p.Bedrooms?.Minimum;
      const bMax = p.Bedrooms?.Maximum;
      if (bMin != null && Number.isFinite(bMin)) beds.push(bMin);
      if (bMax != null && Number.isFinite(bMax)) beds.push(bMax);

      // Baths: compute total per endpoint, then push.
      // FullBaths.Min + 0.5 * HalfBaths.Min for the lower bound,
      // FullBaths.Max + 0.5 * HalfBaths.Max for the upper bound.
      const fbMin = p.FullBaths?.Minimum;
      const fbMax = p.FullBaths?.Maximum;
      const hbMin = p.HalfBaths?.Minimum ?? 0;
      const hbMax = p.HalfBaths?.Maximum ?? 0;
      if (fbMin != null && Number.isFinite(fbMin)) {
        bathsTotals.push(fbMin + 0.5 * hbMin);
      }
      if (fbMax != null && Number.isFinite(fbMax)) {
        bathsTotals.push(fbMax + 0.5 * hbMax);
      }

      // SqFt: keep separate min and max
      const sfMin = p.SquareFootage?.Minimum;
      const sfMax = p.SquareFootage?.Maximum;
      if (sfMin != null && Number.isFinite(sfMin) && sfMin > 0) {
        sqftMins.push(sfMin);
      }
      if (sfMax != null && Number.isFinite(sfMax) && sfMax > 0) {
        sqftMaxes.push(sfMax);
      }

      // Prices
      if (p.BasePrice != null && Number.isFinite(p.BasePrice) && p.BasePrice > 0) {
        prices.push(p.BasePrice);
      }
    }

    aggregates.set(communityId, {
      bedsMin: beds.length > 0 ? Math.min(...beds) : null,
      bedsMax: beds.length > 0 ? Math.max(...beds) : null,
      bathsMin: bathsTotals.length > 0 ? Math.min(...bathsTotals) : null,
      bathsMax: bathsTotals.length > 0 ? Math.max(...bathsTotals) : null,
      sqftMin: minOfDefined(sqftMins),
      sqftMax: maxOfDefined(sqftMaxes),
      priceMin: minOfDefined(prices),
      priceMax: maxOfDefined(prices),
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
  // Must have a stable ID for dedup.
  if (!c.Id || typeof c.Id !== 'string' || c.Id.trim().length === 0) {
    return null;
  }

  const title = (c.Name || '').trim();
  if (!title) return null;

  const cityName = (c.City?.Name || 'Austin').trim();
  const stateAbbrev = (c.City?.StateAbbreviation || 'TX').toUpperCase();

  const agg = aggregates.get(c.Id) ?? null;

  // Price: CommunityData's BasePrice takes precedence; fallback to plan
  // aggregate priceMin if CommunityData has it null/zero.
  let priceMin: number | null = null;
  if (c.IsOverrideBasePrice && c.OverrideBasePrice) {
    priceMin = nonZeroOrNull(c.OverrideBasePrice);
  } else {
    priceMin = nonZeroOrNull(c.BasePrice);
  }
  if (priceMin == null && agg) priceMin = agg.priceMin;

  // priceMax: only available via plan aggregation
  const priceMax = agg?.priceMax ?? null;

  // Sqft: CommunityData first, then plan aggregate
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

  // Beds/baths: ONLY from FloorPlanData aggregate (CommunityData has no fields)
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
  // Fetch both endpoints in parallel. CommunityData is required; if it
  // fails the whole scrape fails. FloorPlanData is enrichment-only; if it
  // fails we proceed with null bed/bath/priceMax fields (same state as S12).
  const [communities, aggregates] = await Promise.all([
    fetchCommunityData(),
    fetchFloorPlanAggregates(),
  ]);

  const rawCount = communities.length;

  if (rawCount === 0) {
    throw new Error(
      'David Weekley CommunityData returned zero communities (marketId stale?)',
    );
  }

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
