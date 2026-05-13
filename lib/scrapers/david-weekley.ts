// lib/scrapers/david-weekley.ts
//
// Fetches David Weekley Homes Austin communities from their public
// CommunityData JSON API (the same endpoint their listing page's JS calls)
// and normalizes each result into a shape our upsert function accepts.
//
// API details (discovered Session 12 via DevTools Network tab):
//   Endpoint: GET /Search/CommunityData?marketId=markets%2F4
//   Auth: none (anonymous, public consumer API)
//   Response: JSON object with `Communities` array of 26 community objects
//   The case-sensitive URL `/Search/CommunityData` returns a 301 redirect to
//   the lowercase `/search/communitydata`; we set redirect: 'follow' so the
//   client transparently lands on the 200.
//
// Austin's market ID is "markets/4" — confirmed from the listing page's
// `<input id="MarketId" value="markets/4" />` field. URL-encode the slash.
//
// Per-community fields we read:
//   Id              → externalId (e.g. "communities/3450")
//   Name            → title
//   City.Name       → city  (nested object with Name/StateAbbreviation)
//   City.StateAbbreviation → state
//   BasePrice       → priceMin
//   OverrideBasePrice → priceMin override when IsOverrideBasePrice=true
//   MinSqFootage    → sqftMin
//   MaxSqFootage    → sqftMax
//   OverrideSqFootage → sqft override when IsOverrideSqFootage=true
//   Thumbnail       → thumbnailUrl (absolute https URL)
//   Token           → community URL path; combined with base = flyerPdfUrl
//
// What we DON'T have at community level:
//   - bedsMin/bedsMax/bathsMin/bathsMax — only on /Search/FloorPlanData
//     (per-plan endpoint). Future enhancement: call that endpoint too and
//     aggregate per community. For now these fields stay null and admins
//     fill them in during review.
//   - description — no description field in this response. We leave null.
//
// Communities with CallForPricing=true have BasePrice=0 or null. Treat as
// pre-launch and import with null prices (same approach as M/I "0" prices).

const COMMUNITY_DATA_URL =
  'https://www.davidweekleyhomes.com/Search/CommunityData?marketId=markets%2F4';

const DW_BASE_URL = 'https://www.davidweekleyhomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

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

// ─────────────────────────────────────────────────────────────────────────
// Per-community normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(c: DWCommunity): ScrapedDavidWeekleyRow | null {
  // Must have a stable ID for dedup. Format is like "communities/3450" —
  // use it verbatim since it's a string and uniquely identifies the community.
  if (!c.Id || typeof c.Id !== 'string' || c.Id.trim().length === 0) {
    return null;
  }

  const title = (c.Name || '').trim();
  if (!title) return null;

  // City is a nested object. Fall back to "Austin" if the API ever returns
  // a community without one (shouldn't happen, but defensive).
  const cityName = (c.City?.Name || 'Austin').trim();
  const stateAbbrev = (c.City?.StateAbbreviation || 'TX').toUpperCase();

  // Price: BasePrice is the canonical price. If IsOverrideBasePrice is true
  // and OverrideBasePrice is set, the override is what the page actually
  // displays. CallForPricing=true means BasePrice will be 0 — treat as null.
  let priceMin: number | null = null;
  if (c.IsOverrideBasePrice && c.OverrideBasePrice) {
    priceMin = nonZeroOrNull(c.OverrideBasePrice);
  } else {
    priceMin = nonZeroOrNull(c.BasePrice);
  }
  // CommunityData doesn't expose a max community-level price; would require
  // aggregating across all plans. Leave priceMax null until we add per-plan.
  const priceMax = null;

  // Sqft: same override pattern. OverrideSqFootage applies to BOTH min and
  // max (it's a single "all plans are X sqft" override). When not overriding,
  // use the actual min/max.
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

  // Thumbnail is the community hero image, absolute URL with a CDN host.
  const thumbnailUrl = c.Thumbnail?.trim() || null;

  // Token is a relative URL path like "/new-homes/tx/austin/austin/wolf-ranch".
  // Combine with base for the "View flyer" link (semantic hack: M/I and KB
  // both use the community page URL here since neither has per-community PDFs).
  const flyerPdfUrl = normalizeUrl(c.Token);

  return {
    externalId: c.Id,
    builderName: 'David Weekley Homes',
    title,
    city: cityName,
    state: stateAbbrev,
    description: null, // CommunityData has no description field
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
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

export async function fetchDavidWeekleyAustin(): Promise<{
  rows: ScrapedDavidWeekleyRow[];
  rawCount: number;
  skipped: number;
}> {
  let res: Response;
  try {
    res = await fetch(COMMUNITY_DATA_URL, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.davidweekleyhomes.com/new-homes/tx/austin',
      },
      // Follow the 301 from /Search/CommunityData (uppercase S) to
      // /search/communitydata (lowercase). 'follow' is the default but stated
      // explicitly because the redirect IS required to land on the 200.
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`David Weekley returned HTTP ${res.status}`);
  }

  let body: CommunityDataResponse;
  try {
    body = (await res.json()) as CommunityDataResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley returned non-JSON body: ${msg}`);
  }

  const communities = Array.isArray(body.Communities) ? body.Communities : [];
  const rawCount = communities.length;

  if (rawCount === 0) {
    // Successful HTTP but zero communities — Weekley restructured or our
    // marketId is stale. Surface as an error so cron shows red.
    throw new Error(
      'David Weekley CommunityData returned zero communities (marketId stale?)',
    );
  }

  const rows: ScrapedDavidWeekleyRow[] = [];
  let skipped = 0;
  for (const c of communities) {
    const normalized = normalize(c);
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }

  return { rows, rawCount, skipped };
}
