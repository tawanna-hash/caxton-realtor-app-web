// lib/scrapers/david-weekley-communities.ts
//
// David Weekley Homes — Community scraper.
// Fetches the Austin community list from /search/CommunityData (26 communities)
// then enriches each with structured detail (home plans, amenities, schools,
// tax info, sales office + directions) from the community detail page's
// embedded `window.pageData` JSON.
//
// One row per community. `homeType = 'community'`, `kind = 'listing'`.
// Public surface: realtynewsnow.app/communities/[id].
//
// Template: docs/community-scraper-template.md

import type { CommunityData, CommunitySchool } from './david-weekley';

const DW_BASE_URL = 'https://www.davidweekleyhomes.com';
const AUSTIN_MARKET_ID = 'markets/4';
const COMMUNITY_DATA_URL = `${DW_BASE_URL}/search/CommunityData?marketId=${encodeURIComponent(AUSTIN_MARKET_ID)}`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: `${DW_BASE_URL}/new-homes/tx/austin`,
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

const DETAIL_PAGE_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Row type
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedDavidWeekleyCommunityRow = {
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
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  galleryUrls: string[];
  communityName: string | null;
  homeType: 'community';
  communityData: CommunityData;
};

// ─────────────────────────────────────────────────────────────────────────
// API types
// ─────────────────────────────────────────────────────────────────────────

type DWCity = { Name?: string | null; StateAbbreviation?: string | null };

type DWCommunity = {
  Id: string;
  Name: string;
  Token: string | null;
  City: DWCity | null;
  BasePrice: number | null;
  CallForPricing: boolean | null;
  MinSqFootage: number | null;
  MaxSqFootage: number | null;
  Amenities: string[] | null;
  SchoolDistricts: string[] | null;
  CommunityStatuses: number | null;
  CommunityType: number | null;
  CommunityPhoneNumber: string | null;
  Latitude: number | null;
  Longitude: number | null;
  Thumbnail: string | null;
  VirtualTour: string | null;
  IsActiveAdultAgeQualified: boolean | null;
};

type CommunityDataResponse = { Communities: DWCommunity[] | null };

// ─────────────────────────────────────────────────────────────────────────
// Helpers (moved from david-weekley.ts — community page extraction)
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

// The community view model is embedded inline as `window.pageData = { ... };`.
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
// community_data blob.
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
            url: token ? `${DW_BASE_URL}${token}` : null,
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
  return extractCommunityData(html);
}

// ─────────────────────────────────────────────────────────────────────────
// Community list normalization
// ─────────────────────────────────────────────────────────────────────────

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return DW_BASE_URL + path;
  return null;
}

function nonZeroOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n === 0) return null;
  return n;
}

function deriveCommunityStatus(
  communityStatuses: number | null,
  title: string,
): 'coming-soon' | 'close-out' | null {
  // CommunityStatuses: 1 = Active/Selling, 2 = Coming Soon, 3 = Close-Out
  if (communityStatuses === 2) return 'coming-soon';
  if (communityStatuses === 3) return 'close-out';
  // Fallback: scan the name
  const t = title.toLowerCase();
  if (t.includes('coming soon')) return 'coming-soon';
  if (t.includes('close out') || t.includes('close-out') || t.includes('final opportunit')) {
    return 'close-out';
  }
  return null;
}

function synthesizeDescription(
  name: string,
  city: string,
  priceMin: number | null,
  sqftMin: number | null,
  sqftMax: number | null,
  amenities: string[],
  status: 'coming-soon' | 'close-out' | null,
): string {
  const parts: string[] = [`${name} is a David Weekley Homes community in ${city}, TX.`];
  const specs: string[] = [];
  if (priceMin != null) specs.push(`homes from $${priceMin.toLocaleString()}`);
  if (sqftMin != null && sqftMax != null && sqftMin !== sqftMax) {
    specs.push(`${sqftMin.toLocaleString()}\u2013${sqftMax.toLocaleString()} sq. ft.`);
  } else if (sqftMin != null) {
    specs.push(`${sqftMin.toLocaleString()} sq. ft.`);
  }
  if (specs.length) parts.push(specs.join(', ') + '.');
  if (amenities.length > 0) {
    const list = amenities.slice(0, 5).join(', ');
    const suffix = amenities.length > 5 ? ' and more' : '';
    parts.push(`Amenities include ${list}${suffix}.`);
  }
  if (status === 'coming-soon') parts.push('Coming soon.');
  else if (status === 'close-out') parts.push('Final opportunities.');
  return parts.join(' ');
}

function normalize(
  c: DWCommunity,
  detail: { description: string | null; communityData: CommunityData } | null,
): ScrapedDavidWeekleyCommunityRow | null {
  if (!c.Id || typeof c.Id !== 'string' || c.Id.trim().length === 0) {
    return null;
  }

  const communityName = (c.Name || '').trim() || c.Id;
  const city = (c.City?.Name || 'Austin').trim();
  const state = (c.City?.StateAbbreviation || 'TX').toUpperCase();

  const priceMin = c.CallForPricing ? null : nonZeroOrNull(c.BasePrice);
  const sqftMin = nonZeroOrNull(c.MinSqFootage);
  const sqftMax = nonZeroOrNull(c.MaxSqFootage);

  const sourceUrl = normalizeUrl(c.Token);
  const thumbnailUrl = c.Thumbnail?.trim() || null;
  const galleryUrls: string[] = thumbnailUrl ? [thumbnailUrl] : [];

  const status = deriveCommunityStatus(c.CommunityStatuses, communityName);

  // Merge API data with detail page communityData.
  // Detail page provides: home plans, schools (structured), tax info, sales
  // office, description, richer amenities.
  // API provides: basic price/sqft, amenities (string[]), school districts
  // (string[]), lat/lng, phone, thumbnail, virtual tour.
  const cd: CommunityData = detail
    ? { ...detail.communityData }
    : {};

  // Always set communityName + city from the API (authoritative).
  cd.communityName = communityName;
  cd.city = city;

  // API amenities as fallback when detail page has none.
  if ((!cd.amenities || cd.amenities.length === 0) && c.Amenities && c.Amenities.length > 0) {
    cd.amenities = c.Amenities;
  }

  // API school district as fallback when detail page has none.
  if ((!cd.schools || !cd.schools.district) && c.SchoolDistricts && c.SchoolDistricts.length > 0) {
    cd.schools = { district: c.SchoolDistricts[0], list: cd.schools?.list ?? [] };
  } else if (!cd.schools) {
    cd.schools = null;
  }

  // API lat/lng as fallback when detail page has none.
  if (!cd.salesOffice) {
    const lat = typeof c.Latitude === 'number' ? c.Latitude : null;
    const lng = typeof c.Longitude === 'number' ? c.Longitude : null;
    cd.salesOffice = {
      address: null,
      hours: null,
      directions: [],
      lat,
      lng,
    };
  } else if (cd.salesOffice.lat == null && typeof c.Latitude === 'number') {
    cd.salesOffice.lat = c.Latitude;
    cd.salesOffice.lng = c.Longitude;
  }

  // Price/sqft from API.
  cd.basePrice = cd.basePrice ?? priceMin;
  if (!cd.priceFrom && priceMin != null) {
    cd.priceFrom = `From $${priceMin.toLocaleString()}`;
  }
  if (!cd.sqftRange && sqftMin != null && sqftMax != null) {
    cd.sqftRange = sqftMin !== sqftMax
      ? `${sqftMin.toLocaleString()}\u2013${sqftMax.toLocaleString()}`
      : `${sqftMin.toLocaleString()}`;
  }

  // Status from API (overrides detail page derivation when available).
  cd.status = status;

  // Adult-only (55+) flag.
  cd.adultOnly = c.IsActiveAdultAgeQualified === true || /kissing tree/i.test(communityName);

  // Image URLs.
  if ((!cd.imageUrls || cd.imageUrls.length === 0) && thumbnailUrl) {
    cd.imageUrls = [thumbnailUrl];
  }

  // Description: prefer detail page, else synthesize.
  const description = detail?.description
    || synthesizeDescription(communityName, city, priceMin, sqftMin, sqftMax, cd.amenities ?? [], status);

  return {
    externalId: c.Id,
    builderName: 'David Weekley Homes',
    title: communityName,
    city,
    state,
    description,
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax: null,
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl,
    galleryUrls,
    communityName,
    homeType: 'community',
    communityData: cd,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchDavidWeekleyAustinCommunities(): Promise<{
  rows: ScrapedDavidWeekleyCommunityRow[];
  rawCount: number;
  skipped: number;
}> {
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

  let parsed: CommunityDataResponse;
  try {
    parsed = (await res.json()) as CommunityDataResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`David Weekley CommunityData non-JSON body: ${msg}`);
  }

  const communities = parsed.Communities ?? [];
  const rawCount = communities.length;

  if (rawCount === 0) {
    return { rows: [], rawCount: 0, skipped: 0 };
  }

  // Enrich each community with detail page data (home plans, schools, tax,
  // sales office, description). Concurrency-limited to stay within
  // maxDuration.
  const rows: ScrapedDavidWeekleyCommunityRow[] = [];
  let skipped = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < communities.length; i += CONCURRENCY) {
    const batch = communities.slice(i, i + CONCURRENCY);
    const details = await Promise.all(
      batch.map(async (c) => {
        const url = normalizeUrl(c.Token);
        if (!url) return null;
        return fetchDavidWeekleyCommunityData(url);
      }),
    );
    for (let j = 0; j < batch.length; j++) {
      const row = normalize(batch[j], details[j]);
      if (row) rows.push(row);
      else skipped++;
    }
  }

  return { rows, rawCount, skipped };
}
