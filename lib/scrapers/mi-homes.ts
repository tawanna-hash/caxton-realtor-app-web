import * as cheerio from 'cheerio';

// lib/scrapers/mi-homes.ts
//
// M/I Homes Austin — per-home scraper (S13).
//
// Emits ONE ROW per move-in-ready inventory home, not per community.
// Each row has a specific address, ready date, plan name, and exact price.
//
// API: GET /sitecore/api/ssc/MIHomes-Project-Website-Api/Search
//       ?search=Greater%20Austin
//       &searchtype=inventory          ← KEY: filters to specific homes
//       &latCenter=30.1&lngCenter=-97.9
//       &x1=30.75&x2=29.75&y1=-97.35&y2=-98.30&zoom=9
// Widened bbox (matches the community-card API) so inventory in outlying
// communities — Manor (Carillon), Dripping Springs (Heritage), San Marcos
// (High Branch) — is captured, not just the central-Austin box.
//
// Without `searchtype=inventory`, the same endpoint returns 8 community
// cards (CardType='community'). With it, returns 93+ inventory cards
// (CardType='inventory') — one per buyable lot.
//
// Per-home fields (from the inventory CardType response):
//   id            → externalId (already a Sitecore item ID)
//   JdeLotId      → secondary unique key (JD Edwards lot id)
//   displayname   → plan name with elevation (e.g., "Abilene - C")
//   PlanElevation → elevation letter only
//   plan          → plan name root
//   CommunityName → friendly community name (for UI grouping)
//   streetaddress → street part only
//   city/Zipcode/state → for assembling full address
//   maxPrice      → list price (minPrice == maxPrice for inventory)
//   readyDate     → ISO 8601, e.g. "2026-05-28T04:00:00Z"
//   bedrooms      → scalar number
//   bathrooms     → scalar number (already combined full+0.5*half; can be 2.5)
//   square        → STRING with thousands comma, e.g. "1,640" — must strip
//   image         → thumbnail URL
//   url           → home detail page path
//   HomeType      → "Single Family Home" — not super useful, kept for fallback
//
// Discovered via Chrome DevTools Network tab (S13). The same Sitecore
// endpoint serves both community cards and per-home cards based on the
// `searchtype` parameter (note: lowercase, not camelCase — `searchType` 500s).

const SEARCH_URL =
  'https://www.mihomes.com/sitecore/api/ssc/MIHomes-Project-Website-Api/Search' +
  '?search=Greater%20Austin' +
  '&searchtype=inventory' +
  '&latCenter=30.1&lngCenter=-97.9' +
  '&x1=30.75&x2=29.75' +
  '&y1=-97.35&y2=-98.30' +
  '&zoom=9';

const MI_BASE_URL = 'https://www.mihomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.mihomes.com/new-homes/texas/greater-austin/quick-move-in-homes',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Response types — just what we read.
// ─────────────────────────────────────────────────────────────────────────

type MILocation = {
  Latitude?: number | null;
  Longitude?: number | null;
};

type MISeries = {
  Id?: string | null;
  Name?: string | null;
};

type MIInventoryItem = {
  id?: string | null;
  JdeLotId?: string | null;
  LotItemId?: string | null;
  CardType?: string | null;
  HomeType?: string | null;
  CommunityName?: string | null;
  displayname?: string | null;
  name?: string | null;
  plan?: string | null;
  PlanElevation?: string | null;
  streetaddress?: string | null;
  city?: string | null;
  state?: string | null;
  Zipcode?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  price?: number | null;
  readyDate?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square?: string | null; // e.g., "1,640" — strings with commas
  garage?: string | null;
  stories?: number | null;
  image?: string | null;
  url?: string | null;
  series?: MISeries[] | null;
  Location?: MILocation | null;
};

type MISearchResponse = {
  results?: MIInventoryItem[] | null;
  outOfRange?: boolean | null;
  communities?: unknown[] | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per move-in-ready home.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedMIHomesRow = {
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
  galleryUrls: string[] | null;
  // Structured key/value details from the detail page's "Additional Details"
  // <dl> (county, school district, MLS, foundation, owner's suite, ...).
  extraDetails: Record<string, string> | null;
  // S13 per-home additions:
  address: string | null;
  readyDate: string | null; // YYYY-MM-DD
  planName: string | null;
  communityName: string | null;
  homeType: 'showcase';
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
  if (path.startsWith('/')) return MI_BASE_URL + path;
  return null;
}

// Parse "1,640" → 1640. Returns null on malformed input.
function parseSqftString(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "Texas" → "TX". Leaves unknown values alone in case M/I expands.
function stateToAbbrev(state: string | null | undefined): string {
  if (!state) return 'TX';
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  if (s.toLowerCase() === 'texas') return 'TX';
  return s.toUpperCase();
}

// "2026-05-28T04:00:00Z" → "2026-05-28"
function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.length < 10) return null;
  const candidate = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate;
}

// Assemble street + city + state + zip into a display address.
// Falls back to whatever pieces we have.
function fullAddress(item: MIInventoryItem): string | null {
  const street = item.streetaddress?.trim() || '';
  const city = item.city?.trim() || '';
  const state = stateToAbbrev(item.state);
  const zip = item.Zipcode?.trim() || '';

  if (!street) return null;

  const parts = [street];
  if (city) {
    const cityState = state ? `${city}, ${state}` : city;
    parts.push(zip ? `${cityState} ${zip}` : cityState);
  } else if (state) {
    parts.push(zip ? `${state} ${zip}` : state);
  } else if (zip) {
    parts.push(zip);
  }
  return parts.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────
// Per-inventory normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(item: MIInventoryItem): ScrapedMIHomesRow | null {
  // Need a stable unique id. Sitecore item id is best; JdeLotId as fallback.
  const externalId =
    item.id?.trim() ||
    (item.JdeLotId ? `jde/${item.JdeLotId}` : null);
  if (!externalId) return null;

  const communityName = item.CommunityName?.trim() || null;
  const planName = item.displayname?.trim() || item.plan?.trim() || null;

  // Title: "Abilene - C at Cascades at Onion Creek"
  let title: string;
  if (planName && communityName) {
    title = `${planName} at ${communityName}`;
  } else if (planName) {
    title = planName;
  } else if (communityName) {
    title = `Inventory home at ${communityName}`;
  } else if (item.streetaddress) {
    title = item.streetaddress;
  } else {
    title = 'M/I inventory home';
  }

  const city = item.city?.trim() || 'Austin';
  const state = stateToAbbrev(item.state);

  // Scalars on a specific home. Store min=max so range-aware UI still works.
  const beds = item.bedrooms != null && Number.isFinite(item.bedrooms) ? item.bedrooms : null;
  const baths = item.bathrooms != null && Number.isFinite(item.bathrooms) ? item.bathrooms : null;
  const sqft = parseSqftString(item.square);
  // For inventory cards, maxPrice == minPrice. Either works.
  const price = nonZeroOrNull(item.maxPrice) ?? nonZeroOrNull(item.minPrice) ?? nonZeroOrNull(item.price);

  return {
    externalId,
    builderName: 'M/I Homes',
    title,
    city,
    state,
    description: null,
    bedsMin: beds,
    bedsMax: beds,
    bathsMin: baths,
    bathsMax: baths,
    sqftMin: sqft,
    sqftMax: sqft,
    priceMin: price,
    priceMax: price,
    thumbnailUrl: item.image?.trim() || null,
    flyerPdfUrl: null,
    sourceUrl: normalizeUrl(item.url),
    galleryUrls: null,
    extraDetails: null,
    address: fullAddress(item),
    readyDate: dateOnly(item.readyDate),
    planName,
    communityName,
    homeType: 'showcase',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Per-home detail-page enrichment (gallery + marketing description)
// ─────────────────────────────────────────────────────────────────────────
//
// The Sitecore inventory API gives core specs (beds/baths/sqft/price/ready/
// plan/address) + a single thumbnail, but NOT the photo gallery or the
// marketing description. Those live on each home's detail page, embedded in
// the server-rendered HTML:
//   - Gallery: each photo is a `data-image` attribute holding a comma-separated
//     srcset (`URL 300w,URL 600w,...,URL 1800w`). We pick the 1800w variant.
//   - Description: the <p> block starting at "Step inside ..." and ending at the
//     `<!-- and done -->` marker (immediately before "About the Community").

const MI_DETAIL_GALLERY_LIMIT = 30;

type MIHomeDetailSpecs = {
  beds: number | null;
  fullBaths: number | null;
  halfBaths: number | null;
  garage: number | null;
  stories: number | null;
  sqft: number | null;
};

function parseSpecNumber(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

async function fetchMIHomeDetail(detailUrl: string): Promise<{
  galleryUrls: string[] | null;
  description: string | null;
  specs: MIHomeDetailSpecs;
  extraDetails: Record<string, string> | null;
  floorplanUrl: string | null;
  latitude: string | null;
  longitude: string | null;
}> {
  let res: Response;
  try {
    res = await fetch(detailUrl, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I home detail fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`M/I home detail HTTP ${res.status} for ${detailUrl}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Gallery: pick the 1800w variant from each data-image srcset.
  const gallery = new Set<string>();
  $('[data-image]').each((_, el) => {
    const srcset = $(el).attr('data-image') || '';
    if (!srcset) return;
    let chosen: string | null = null;
    for (const entry of srcset.split(',')) {
      const m = entry.trim().match(/^(.+?)\s+(\d+)w$/);
      if (!m) continue;
      if (m[2] === '1800') {
        chosen = m[1];
        break;
      }
      if (chosen === null) chosen = m[1];
    }
    if (chosen) gallery.add(chosen);
  });
  const galleryUrls =
    gallery.size > 0 ? Array.from(gallery).slice(0, MI_DETAIL_GALLERY_LIMIT) : null;

  // Specs: the plan-specification-item label/value grid (bedrooms, full/half
  // bathrooms, garages, stories, square feet). The Sitecore inventory API
  // sometimes omits bedrooms, so we backfill from here.
  const specs: MIHomeDetailSpecs = {
    beds: null,
    fullBaths: null,
    halfBaths: null,
    garage: null,
    stories: null,
    sqft: null,
  };
  $('.plan-specification-item__label').each((_, el) => {
    const label = $(el).text().trim().toLowerCase();
    const raw = $(el).siblings('.plan-specification-item__value').first().text().trim();
    const num = parseSpecNumber(raw);
    if (num === null) return;
    if (label === 'bedrooms') specs.beds = num;
    else if (label === 'full bathrooms') specs.fullBaths = num;
    else if (label === 'half bathrooms') specs.halfBaths = num;
    else if (label === 'garages' || label === 'garage') specs.garage = num;
    else if (label === 'stories') specs.stories = num;
    else if (label === 'square feet') specs.sqft = num;
  });

  // Additional Details: the <dl> of label/value pairs (County, School
  // District, MLS Number, Foundation Type, Owner's Suite, Home Type,
  // Homesite, Base Plan Width & Depth). Stored verbatim as a map.
  let extraDetails: Record<string, string> | null = null;
  $('dl').each((_, dl) => {
    if (extraDetails) return;
    const $dl = $(dl);
    const txt = $dl.text();
    if (!/School District|MLS Number|Foundation Type/i.test(txt)) return;
    const map: Record<string, string> = {};
    $dl.find('dt').each((__, dt) => {
      const label = $(dt).text().trim();
      const value = $(dt).next('dd').text().trim();
      if (label && value) map[label] = value;
    });
    if (Object.keys(map).length > 0) extraDetails = map;
  });

  // Floorplan: the interactive ML3D Solutions viewer iframe URL.
  const floorplanUrl =
    $('iframe#floor-plan').attr('data-src') ||
    $('iframe#floor-plan').attr('src') ||
    null;

  // Geo coordinates (JSON-LD GeoCoordinates) for the map embed.
  const latMatch = html.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const lngMatch = html.match(/"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const latitude = latMatch ? latMatch[1] : null;
  const longitude = lngMatch ? lngMatch[1] : null;

  // Description: the full block from the body's opening paragraph to the
  // `<!-- and done -->` marker. The opener wording varies per home ("Step
  // inside ...", "Discover this ..."), so use the meta description's opening
  // words as a signature to locate the body opener (its last occurrence before
  // the done marker), then slice to the marker and strip tags. This captures
  // <p>s, <ul> bullet lists (e.g. Key Features), and any other blocks in the
  // run. Falls back to the contiguous <p> run, then to the meta description.
  let description: string | null = null;
  const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
  const doneIdx = html.indexOf('<!-- and done -->');
  if (doneIdx !== -1) {
    const sig = metaDesc.replace(/\s+/g, ' ').slice(0, 25).trim();
    const startIdx = sig ? html.lastIndexOf(sig, doneIdx) : -1;
    if (startIdx !== -1) {
      const frag = html.slice(startIdx, doneIdx);
      const text = cheerio.load(frag).text().replace(/\s+/g, ' ').trim();
      if (text.length > 0) description = text;
    }
    if (!description) {
      const before = html.slice(0, doneIdx);
      const paras: { start: number; end: number; inner: string }[] = [];
      const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(before)) !== null) {
        paras.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
      }
      if (paras.length > 0) {
        let runStart = paras.length - 1;
        for (let i = paras.length - 2; i >= 0; i--) {
          const between = before.slice(paras[i].end, paras[i + 1].start);
          if (/^\s*$/.test(between)) runStart = i;
          else break;
        }
        const text = paras
          .slice(runStart)
          .map((pp) => cheerio.load(pp.inner).text())
          .join('\n\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/ *\n */g, '\n')
          .trim();
        if (text.length > 0) description = text;
      }
    }
  }
  if (!description && metaDesc.length > 0) {
    description = metaDesc;
  }

  return { galleryUrls, description, specs, extraDetails, floorplanUrl, latitude, longitude };
}

// Bounded-concurrency mapper so we don't fire ~93 detail requests at once.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchMIHomesAustin(): Promise<{
  rows: ScrapedMIHomesRow[];
  rawCount: number;
  skipped: number;
  detailFetched: number;
  detailErrors: number;
}> {
  let res: Response;
  try {
    res = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: COMMON_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes Search fetch failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`M/I Homes Search returned HTTP ${res.status}`);
  }

  let body: MISearchResponse;
  try {
    body = (await res.json()) as MISearchResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`M/I Homes Search non-JSON body: ${msg}`);
  }

  // Filter to inventory CardType. Defensive — endpoint should already
  // honor the searchtype filter, but if M/I changes routing we want
  // to ignore community/plan cards that might leak in.
  const all = Array.isArray(body.results) ? body.results : [];
  const inventoryOnly = all.filter((r) => r.CardType === 'inventory');
  const rawCount = inventoryOnly.length;

  if (rawCount === 0) {
    // Not necessarily an error — Austin inventory may genuinely be zero.
    // Return empty rather than throw, so the cron logs success.
    return { rows: [], rawCount: 0, skipped: 0, detailFetched: 0, detailErrors: 0 };
  }

  const rows: ScrapedMIHomesRow[] = [];
  let skipped = 0;
  for (const item of inventoryOnly) {
    const normalized = normalize(item);
    if (normalized) {
      rows.push(normalized);
    } else {
      skipped++;
    }
  }

  // Enrich each home with gallery + description + specs from its detail page.
  // Best-effort: a detail fetch failure leaves the API-only row intact.
  let detailFetched = 0;
  let detailErrors = 0;
  await mapWithConcurrency(rows, 6, async (row) => {
    if (!row.sourceUrl) return;
    try {
      const detail = await fetchMIHomeDetail(row.sourceUrl);
      if (detail.galleryUrls) row.galleryUrls = detail.galleryUrls;
      // Merge the <dl> details + floorplan URL + geo into extraDetails.
      // Floorplan/geo use _-prefixed keys so the property-details panel skips
      // them (they render as dedicated Floorplan / Location sections).
      if (detail.extraDetails || detail.floorplanUrl || detail.latitude) {
        const ed: Record<string, string> = { ...(detail.extraDetails ?? {}) };
        if (detail.floorplanUrl) ed._floorplanUrl = detail.floorplanUrl;
        if (detail.latitude) ed._latitude = detail.latitude;
        if (detail.longitude) ed._longitude = detail.longitude;
        if (Object.keys(ed).length > 0) row.extraDetails = ed;
      }
      // Backfill specs the Sitecore API omitted (bedrooms is frequently null).
      if (row.bedsMin == null && detail.specs.beds != null) {
        row.bedsMin = detail.specs.beds;
        row.bedsMax = detail.specs.beds;
      }
      if (row.bathsMin == null && detail.specs.fullBaths != null) {
        const b = detail.specs.fullBaths + (detail.specs.halfBaths ?? 0) * 0.5;
        row.bathsMin = b;
        row.bathsMax = b;
      }
      if (row.sqftMin == null && detail.specs.sqft != null) {
        row.sqftMin = detail.specs.sqft;
        row.sqftMax = detail.specs.sqft;
      }
      // The inventory page surfaces garage only via /(\d+)-car garage/ parsed
      // from the description. If M/I's description doesn't phrase it that way,
      // append a compact specs line so garage still shows.
      let desc = detail.description;
      // M/I's body description sometimes opens with a templated wrong street
      // address; if the row's real street address isn't present, swap it into
      // the opener ("at <wrong> in <city>, <st>" -> "at <real> in ...").
      if (desc && row.address) {
        const street = row.address.split(',')[0].trim();
        if (street && !desc.toLowerCase().includes(street.toLowerCase())) {
          desc = desc.replace(/(at\s+)([^,\n]+?)(\s+in\s+)/, `$1${street}$3`);
        }
      }
      if (desc && detail.specs.garage != null && !/(\d+)-car garage/i.test(desc)) {
        desc = `${desc}\n\nKey Features: ${detail.specs.garage}-car garage`;
      }
      if (desc) row.description = desc;
      detailFetched++;
    } catch (err) {
      detailErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[mi-homes] detail enrich failed for', row.sourceUrl, msg);
    }
  });

  return { rows, rawCount, skipped, detailFetched, detailErrors };
}
