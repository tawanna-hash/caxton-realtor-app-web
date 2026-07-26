// lib/scrapers/mi-homes-communities.ts
//
// M/I Homes — COMMUNITY scraper (companion to mi-homes.ts which handles
// per-home inventory). Emits ONE ROW per community (home_type='community')
// with rich community_data (plans w/ elevation images, amenities, sales
// office, gallery, schools district) so the generic community detail page
// renders like the David Weekley communities.
//
// Two data sources, both public + server-fetchable (no browser needed):
//
//   1. Community-card API (Sitecore Search, NO searchtype=inventory):
//        GET /sitecore/api/ssc/MIHomes-Project-Website-Api/Search
//          ?search=Greater%20Austin  (widened bbox so Manor / Dripping
//           Springs / San Marcos communities are included — the default
//           bbox omits Carillon, Heritage, High Branch)
//      Returns CardType='community' cards with: id, CommunityName, url,
//      city/state/Zipcode/streetaddress, Location{lat,lng}, minPrice/
//      maxPrice, square ("1,545-4,152"), bathroomsRange, SEOModel
//      (Min/Max beds/baths/sqft, lat/lng, StartingPrice), flags (status
//      badges), image, Description (HTML), school (district), series.
//
//   2. Community detail page HTML (per community):
//        <script type="application/ld+json"> blocks:
//          - ProductModel (one per floorplan): name, sku, image[], url,
//            offers.price, numberOfBedrooms{min,max},
//            numberOfFullBathrooms{min,max}, numberOfPartialBathrooms,
//            floorSize{min,max}. Garage is DOM-only (.home-card-meta-item).
//          - HomeAndConstructionBusiness: image[] (gallery), address,
//            geo{lat,lng}, telephone, openingHoursSpecification.
//        <div id="amenities">: data-tooltip icons + nearby landmark links.
//
// The detail fetch is best-effort: if it is blocked/fails, we still write a
// community row + card-derived community_data (price/sqft/image/address/
// description/status). Plans/amenities/gallery only land when the detail
// page is reachable.

import type { CommunityData, CommunityHomePlan } from './david-weekley';

const MI_BASE_URL = 'https://www.mihomes.com';

const COMMUNITIES_SEARCH_URL =
  'https://www.mihomes.com/sitecore/api/ssc/MIHomes-Project-Website-Api/Search' +
  '?search=Greater%20Austin' +
  '&latCenter=30.1&lngCenter=-97.9' +
  // Widened from the inventory bbox so Manor (Carillon), Dripping Springs
  // (Heritage) and San Marcos (High Branch) fall inside the viewport.
  '&x1=30.75&x2=29.75&y1=-97.35&y2=-98.30&zoom=9';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const JSON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.mihomes.com/new-homes/texas/greater-austin/communities',
} as const;

const HTML_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.mihomes.com/new-homes/texas/greater-austin/communities',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type MIFlag = { text: string; color: string | null };
type MISeries = { id: string; name: string; price: number | null; url: string };

export type MICommunityCard = {
  id: string;
  communityName: string;
  url: string;
  city: string;
  state: string;
  zip: string | null;
  streetAddress: string | null;
  lat: number | null;
  lng: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  sqftRange: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  image: string | null;
  descriptionHtml: string | null;
  schoolDistrict: string | null;
  flags: MIFlag[];
  series: MISeries[];
};

export type ScrapedMICommunityRow = {
  externalId: string;
  builderName: 'M/I Homes';
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
  galleryUrls: string[];
  communityName: string | null;
  homeType: 'community';
  communityData: CommunityData;
};

// Raw API item shape (only what we read).
type MICommunityApiItem = {
  id?: string | null;
  CardType?: string | null;
  CommunityName?: string | null;
  name?: string | null;
  displayname?: string | null;
  url?: string | null;
  city?: string | null;
  state?: string | null;
  Zipcode?: string | null;
  streetaddress?: string | null;
  Location?: { Latitude?: number | null; Longitude?: number | null } | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  square?: string | null;
  bathroomsRange?: string | null;
  image?: string | null;
  Description?: string | null;
  school?: string | null;
  flags?: { text?: string | null; color?: string | null; IsActive?: boolean | null }[] | null;
  series?: { Id?: string | null; Name?: string | null; Price?: number | null; Url?: string | null }[] | null;
  SEOModel?: {
    MinNumberOfBedrooms?: number | null;
    MaxNumberOfBedrooms?: number | null;
    MinNumberOfBathrooms?: number | null;
    MaxNumberOfBathrooms?: number | null;
    MinSqft?: number | null;
    MaxSqft?: number | null;
    Latitude?: number | null;
    Longitude?: number | null;
    StartingPrice?: number | null;
    MaxPrice?: number | null;
  } | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.trim();
  if (!p) return null;
  if (p.startsWith('http')) return p;
  if (p.startsWith('/')) return MI_BASE_URL + p;
  return null;
}

function stateToAbbrev(state: string | null | undefined): string {
  if (!state) return 'TX';
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  if (s.toLowerCase() === 'texas') return 'TX';
  return s.toUpperCase();
}

// Format an integer with thousands commas.
function withCommas(n: number | null): string | null {
  if (n == null) return null;
  return Math.round(n).toLocaleString('en-US');
}

// {minValue, maxValue} → "3" | "3-4" | null
function rangeStr(q: { minValue?: number | null; maxValue?: number | null } | null | undefined): string | null {
  if (!q) return null;
  const lo = num(q.minValue);
  const hi = num(q.maxValue);
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null && lo === hi) return String(lo);
  if (lo != null && hi != null) return `${lo}-${hi}`;
  return lo != null ? String(lo) : hi != null ? String(hi) : null;
}

// floorSize → "1,485-1,531"
function sqftRangeStr(q: { minValue?: number | null; maxValue?: number | null } | null | undefined): string | null {
  const r = rangeStr(q);
  if (!r) return null;
  return r
    .split('-')
    .map((part) => withCommas(Number(part)) ?? part)
    .join('-');
}

// full + half bath QuantitativeValues → "2" | "2-3" | "2.5"
function formatBath(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function bathsRange(
  full: { minValue?: number | null; maxValue?: number | null } | null | undefined,
  half: { minValue?: number | null; maxValue?: number | null } | null | undefined,
): string | null {
  const fmin = num(full?.minValue) ?? 0;
  const fmax = num(full?.maxValue) ?? fmin;
  const hmin = num(half?.minValue) ?? 0;
  const hmax = num(half?.maxValue) ?? hmin;
  if (fmin === 0 && fmax === 0 && hmin === 0 && hmax === 0) return null;
  const tmin = fmin + 0.5 * hmin;
  const tmax = fmax + 0.5 * hmax;
  return tmin === tmax ? formatBath(tmin) : `${formatBath(tmin)}-${formatBath(tmax)}`;
}

// Map M/I status flags → the community page's status enum.
//   "Take One Last Look"          → close-out
//   "GET THE FIRST LOOK" / coming → coming-soon
//   else                          → null (no badge)
function mapStatusFromFlags(flags: MIFlag[]): 'coming-soon' | 'close-out' | null {
  const texts = flags.map((f) => f.text.toLowerCase());
  if (texts.some((t) => t.includes('last look'))) return 'close-out';
  if (texts.some((t) => t.includes('first look') || t.includes('coming soon'))) return 'coming-soon';
  return null;
}

// Prefer a price-y flag ("From the $300s") for the priceFrom display;
// otherwise synthesize from minPrice.
function priceFromFromCard(card: MICommunityCard): string | null {
  for (const f of card.flags) {
    const t = f.text;
    if (/\$\s*\d/i.test(t) || /high \$|low \$|mid \$/i.test(t) || /from the/i.test(t)) {
      return t;
    }
  }
  if (card.minPrice != null) return `From $${withCommas(card.minPrice)}`;
  return null;
}

// Minimal HTML entity decoder (numeric + common named) for description text.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í',
  oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
  ccedil: 'ç', szlig: 'ß', bull: '•', middot: '·', deg: '°',
};
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m));
}

// Strip <style>/<script>, tags, decode entities, collapse whitespace.
function cleanHtmlDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return s.length ? s : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Community-card API
// ─────────────────────────────────────────────────────────────────────────

function mapCommunityCard(item: MICommunityApiItem): MICommunityCard | null {
  const id = str(item.id);
  const url = str(item.url);
  const communityName = str(item.CommunityName) || str(item.name) || str(item.displayname);
  if (!id || !url || !communityName) return null;

  const seo = item.SEOModel || null;
  const loc = item.Location || seo;
  const flags: MIFlag[] = (item.flags || [])
    .filter((f) => f && f.IsActive !== false && str(f.text))
    .map((f) => ({ text: str(f.text) as string, color: str(f.color) }));
  const series: MISeries[] = (item.series || [])
    .map((s) => ({
      id: str(s.Id) || '',
      name: str(s.Name) || '',
      price: num(s.Price),
      url: normalizeUrl(s.Url) || '',
    }))
    .filter((s) => s.id && s.name);

  return {
    id,
    communityName,
    url,
    city: str(item.city) || 'Austin',
    state: stateToAbbrev(str(item.state)),
    zip: str(item.Zipcode),
    streetAddress: str(item.streetaddress),
    lat: num(loc?.Latitude) ?? null,
    lng: num(loc?.Longitude) ?? null,
    minPrice: num(item.minPrice) ?? num(seo?.StartingPrice) ?? null,
    maxPrice: num(item.maxPrice) ?? num(seo?.MaxPrice) ?? null,
    sqftRange: str(item.square),
    bedsMin: num(seo?.MinNumberOfBedrooms) ?? null,
    bedsMax: num(seo?.MaxNumberOfBedrooms) ?? null,
    bathsMin: num(seo?.MinNumberOfBathrooms) ?? null,
    bathsMax: num(seo?.MaxNumberOfBathrooms) ?? null,
    image: normalizeUrl(item.image),
    descriptionHtml: str(item.Description),
    schoolDistrict: str(item.school),
    flags,
    series,
  };
}

export async function fetchMIHomesCommunities(): Promise<{
  cards: MICommunityCard[];
  rawCount: number;
}> {
  let res: Response;
  try {
    res = await fetch(COMMUNITIES_SEARCH_URL, {
      method: 'GET',
      headers: JSON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes community search fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`M/I Homes community search returned HTTP ${res.status}`);
  }

  let body: { results?: MICommunityApiItem[] | null };
  try {
    body = (await res.json()) as { results?: MICommunityApiItem[] | null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes community search non-JSON body: ${msg}`);
  }

  const all = Array.isArray(body.results) ? body.results : [];
  const communityItems = all.filter((r) => r && r.CardType === 'community');
  const cards: MICommunityCard[] = [];
  for (const item of communityItems) {
    const c = mapCommunityCard(item);
    if (c) cards.push(c);
  }
  return { cards, rawCount: communityItems.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Detail-page enrichment (best-effort)
// ─────────────────────────────────────────────────────────────────────────

type LdBlock = Record<string, unknown> & { '@type'?: string | string[] };

function parseLdJsonBlocks(html: string): LdBlock[] {
  const blocks: LdBlock[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const p of parsed) if (p && typeof p === 'object') blocks.push(p as LdBlock);
      } else if (parsed && typeof parsed === 'object') {
        blocks.push(parsed as LdBlock);
      }
    } catch {
      // skip malformed block
    }
  }
  return blocks;
}

function ldType(b: LdBlock): string | null {
  const t = b['@type'];
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.find((x) => typeof x === 'string') ?? null;
  return null;
}

// ProductModel blocks → homePlans. Garage values are DOM-only; we zip them
// onto plans by document order (each .home-card--plans holds one script).
function extractPlans(html: string): CommunityHomePlan[] {
  const blocks = parseLdJsonBlocks(html);
  const plans: CommunityHomePlan[] = [];
  for (const b of blocks) {
    if (ldType(b) !== 'ProductModel') continue;
    const name = str(b.name);
    if (!name) continue;
    const offers = (b.offers as Record<string, unknown> | undefined) || undefined;
    const price = num(offers?.price);
    const planUrl =
      normalizeUrl(str(offers?.url)) ||
      normalizeUrl(str(b.url)) ||
      null;
    const imgRaw = b.image;
    const img = Array.isArray(imgRaw) ? normalizeUrl(str(imgRaw[0])) : normalizeUrl(str(imgRaw));
    const beds = rangeStr(b.numberOfBedrooms as { minValue?: number | null; maxValue?: number | null } | undefined);
    const baths = bathsRange(
      b.numberOfFullBathrooms as { minValue?: number | null; maxValue?: number | null } | undefined,
      b.numberOfPartialBathrooms as { minValue?: number | null; maxValue?: number | null } | undefined,
    );
    const sqft = sqftRangeStr(b.floorSize as { minValue?: number | null; maxValue?: number | null } | undefined);
    plans.push({
      name,
      url: planUrl,
      priceDisplay: price != null ? `From $${withCommas(price)}` : null,
      basePrice: price,
      sqftDisplay: sqft,
      beds,
      baths,
      garages: null,
      stories: null,
      imageUrl: img,
      status: null,
      isModel: false,
    });
  }
  // Zip garage values (DOM order) onto plans.
  if (plans.length) {
    const garageVals = [
      // .home-card-meta-item layout: `Garage<span class="home-card-meta-value">2</span>`
      ...html.matchAll(/Garage\s*<span class="home-card-meta-value">([^<]+)/gi),
    ].map((m) => m[1].trim());
    plans.forEach((p, i) => {
      if (garageVals[i]) p.garages = garageVals[i];
    });
  }
  return plans;
}

// <div id="amenities"> → icon tooltips + nearby landmark link texts.
function extractAmenities(html: string): string[] {
  const out: string[] = [];
  const start = html.indexOf('id="amenities"');
  if (start < 0) return out;
  const chunk = html.slice(start, start + 8000);
  const end = chunk.indexOf('</section>');
  const block = end > 0 ? chunk.slice(0, end) : chunk;
  for (const m of block.matchAll(/data-tooltip="([^"]+)"/g)) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  for (const m of block.matchAll(/<a[^>]*href="[^"]+"[^>]*>([^<]{2,50})<\/a>/g)) {
    const t = decodeEntities(m[1].trim());
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

type MIBusiness = {
  gallery: string[];
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  hours: string | null;
};

function extractBusiness(html: string): MIBusiness {
  const blocks = parseLdJsonBlocks(html);
  const biz = blocks.find((b) => ldType(b) === 'HomeAndConstructionBusiness') as
    | (LdBlock & {
        image?: unknown;
        address?: Record<string, unknown> | null;
        telephone?: unknown;
        geo?: Record<string, unknown> | null;
        openingHoursSpecification?: unknown[] | null;
      })
    | undefined;
  if (!biz) return { gallery: [], address: null, phone: null, lat: null, lng: null, hours: null };

  const gallery: string[] = [];
  if (Array.isArray(biz.image)) {
    for (const u of biz.image) {
      const nu = normalizeUrl(str(u));
      if (nu && !gallery.includes(nu)) gallery.push(nu);
    }
  }

  let address: string | null = null;
  const addr = biz.address;
  if (addr) {
    const parts = [
      str(addr.streetAddress),
      [str(addr.addressLocality), str(addr.addressRegion)].filter(Boolean).join(', '),
      str(addr.postalCode),
    ].filter(Boolean);
    address = parts.length ? parts.join(', ') : null;
  }

  const geo = biz.geo;
  const hoursArr = Array.isArray(biz.openingHoursSpecification) ? biz.openingHoursSpecification : [];
  const hours =
    hoursArr.length > 0
      ? hoursArr
          .map((o) => {
            const obj = (o ?? {}) as Record<string, unknown>;
            const day = Array.isArray(obj.dayOfWeek)
              ? obj.dayOfWeek.join('/')
              : str(obj.dayOfWeek);
            const opens = str(obj.opens);
            const closes = str(obj.closes);
            return [day, opens && closes ? `${opens}-${closes}` : opens].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join('; ')
      : null;

  return {
    gallery,
    address,
    phone: str(biz.telephone),
    lat: num(geo?.latitude),
    lng: num(geo?.longitude),
    hours,
  };
}

// Card-only CommunityData (used directly when detail fetch is skipped/fails).
function cardToCommunityData(card: MICommunityCard): CommunityData {
  const addressParts = [card.streetAddress, card.city, stateToAbbrev(card.state), card.zip].filter(Boolean);
  return {
    communityName: card.communityName,
    city: card.city,
    priceFrom: priceFromFromCard(card),
    basePrice: card.minPrice,
    sqftRange: card.sqftRange,
    imageUrls: card.image ? [card.image] : [],
    amenities: [],
    salesOffice:
      card.streetAddress || card.lat != null
        ? {
            address: addressParts.length ? addressParts.join(', ') : null,
            hours: null,
            directions: [],
            lat: card.lat,
            lng: card.lng,
          }
        : null,
    homePlans: [],
    schools: card.schoolDistrict ? { district: card.schoolDistrict, list: [] } : null,
    status: mapStatusFromFlags(card.flags),
  };
}

// Fetch a community detail page and enrich card data with plans/amenities/
// gallery/sales-office. Never throws — on failure returns card-only data.
export async function fetchMIHomesCommunityData(
  card: MICommunityCard,
): Promise<{ data: CommunityData; detailFetched: boolean; error: string | null }> {
  const detailUrl = normalizeUrl(card.url);
  const base = cardToCommunityData(card);

  if (!detailUrl) {
    return { data: base, detailFetched: false, error: 'no detail url' };
  }

  let res: Response;
  try {
    res = await fetch(detailUrl, {
      method: 'GET',
      headers: HTML_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: base, detailFetched: false, error: msg };
  }
  if (!res.ok) {
    return { data: base, detailFetched: false, error: `HTTP ${res.status}` };
  }

  let html: string;
  try {
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: base, detailFetched: false, error: msg };
  }

  const plans = extractPlans(html);
  const amenities = extractAmenities(html);
  const biz = extractBusiness(html);

  // Merge enrichment over card base.
  const data: CommunityData = {
    ...base,
    amenities: amenities.length ? amenities : base.amenities,
    homePlans: plans.length ? plans : base.homePlans,
    imageUrls: biz.gallery.length ? biz.gallery : base.imageUrls,
    salesOffice: {
      address: biz.address ?? base.salesOffice?.address ?? null,
      hours: biz.hours ?? base.salesOffice?.hours ?? null,
      directions: base.salesOffice?.directions ?? [],
      lat: biz.lat ?? base.salesOffice?.lat ?? null,
      lng: biz.lng ?? base.salesOffice?.lng ?? null,
    },
  };
  return { data, detailFetched: true, error: null };
}

// Build the full row (card + enriched community_data) for the cron to upsert.
export async function fetchMIHomesCommunityRows(): Promise<{
  rows: ScrapedMICommunityRow[];
  rawCount: number;
  detailFetched: number;
  detailErrors: { community: string; error: string }[];
}> {
  const { cards, rawCount } = await fetchMIHomesCommunities();
  const rows: ScrapedMICommunityRow[] = [];
  let detailFetched = 0;
  const detailErrors: { community: string; error: string }[] = [];

  // Concurrency-limited detail enrichment.
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < cards.length) {
      const i = cursor++;
      const card = cards[i];
      const { data, detailFetched: df, error } = await fetchMIHomesCommunityData(card);
      if (df) detailFetched++;
      else detailErrors.push({ community: card.communityName, error: error ?? 'unknown' });
      rows.push({
        externalId: card.id,
        builderName: 'M/I Homes',
        title: card.communityName,
        city: card.city,
        state: card.state,
        description: cleanHtmlDescription(card.descriptionHtml),
        bedsMin: card.bedsMin,
        bedsMax: card.bedsMax,
        bathsMin: card.bathsMin,
        bathsMax: card.bathsMax,
        sqftMin: card.sqftRange ? parseSqftRangeLo(card.sqftRange) : null,
        sqftMax: card.sqftRange ? parseSqftRangeHi(card.sqftRange) : null,
        priceMin: card.minPrice,
        priceMax: card.maxPrice,
        thumbnailUrl: card.image,
        flyerPdfUrl: null,
        sourceUrl: normalizeUrl(card.url),
        galleryUrls: data.imageUrls ?? (card.image ? [card.image] : []),
        communityName: card.communityName,
        homeType: 'community',
        communityData: data,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cards.length) }, worker));

  return { rows, rawCount, detailFetched, detailErrors };
}

// "1,545-4,152" → 1545 / 4152
function parseSqftRangeLo(s: string): number | null {
  const m = s.replace(/,/g, '').split('-')[0];
  return m ? num(m) : null;
}
function parseSqftRangeHi(s: string): number | null {
  const parts = s.replace(/,/g, '').split('-');
  if (parts.length < 2) return null;
  return parts[1] ? num(parts[1]) : null;
}
