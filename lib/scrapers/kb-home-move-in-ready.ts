// lib/scrapers/kb-home-move-in-ready.ts
//
// KB Home Austin — Move-in-ready (MIR) homes scraper.
//
// Two-phase scrape:
//   Phase 1: Sitemap → community pages → extract `LocalQMIs` JSON array
//            (basic home data: price, beds, baths, sqft, gallery photos,
//             description, community info, MLS#)
//   Phase 2: For each MIR home, fetch its detail page (/mir?homesite={id})
//            to extract:
//            - kb-vu.com interactive floor plan URL
//            - Full amenities pictograms with labels (e.g. "Spacious living
//              room", "Walk-in kitchen pantry", "Smart thermostat")
//            - Any additional photos not in LocalQMIs
//            - Zillow interactive tour link (if present)
//
// `homeType = 'showcase'`, `kind = 'listing'`.
// Public surface: realtynewsnow.app/inventory/[id].
//
// Template: docs/scraper-template.md

const SITEMAP_URL = 'https://www.kbhome.com/sitemap.xml';

const SITEMAP_COMMUNITY_RE =
  /<loc>\s*(https:\/\/www\.kbhome\.com\/new-homes-austin\/[a-z0-9-]+)\s*<\/loc>/g;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const KB_BASE = 'https://www.kbhome.com';

// ─────────────────────────────────────────────────────────────────────────
// Row type — one row per move-in-ready home.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedKBHomeMIRRow = {
  externalId: string;
  builderName: 'KB Home';
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
  address: string | null;
  readyDate: string | null; // YYYY-MM-DD
  planName: string | null;
  communityName: string | null;
  homeType: 'showcase';
  floorPlanUrl: string | null;
  extraDetails: Record<string, string> | null;
};

// ─────────────────────────────────────────────────────────────────────────
// API types (LocalQMIs embedded JSON)
// ─────────────────────────────────────────────────────────────────────────

type KBPhoto = {
  image?: string | null;
  caption?: string | null;
  alternateText?: string | null;
} | null;

type KBMIRHome = {
  id?: number | null;
  name?: string | null;
  homesite?: number | string | null;
  address?: string | null;
  price?: number | string | null;
  pricedFromDisplayText?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garages?: number | null;
  size?: string | null;
  sizeDisplayText?: string | null;
  stories?: string | null;
  style?: string | null;
  amenities?: string | null;
  moveInDate?: string | null;
  moveInDateCopy?: string | null;
  mlsNumber?: number | string | null;
  mlsIdentifier?: string | null;
  thumbnailImage?: KBPhoto;
  websitePhotos?: KBPhoto[] | null;
  galleryPhotos?: KBPhoto[] | null;
  communityName?: string | null;
  city?: string | null;
  state?: string | null;
  stateAbbreviation?: string | null;
  zipCode?: string | null;
  communityOfficePhone?: string | null;
  communityOfficeAddress?: string | null;
  communityDirections?: string | null;
  communityHighlights?: string[] | null;
  communityPriceStatus?: string | null;
  communityCityState?: string | null;
  floorPlanLink?: string | null;
  pageUrl?: string | null;
  isTourable?: boolean | null;
  description?: unknown;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2019;/gi, '\u2019')
    .replace(/&#x201C;/gi, '\u201C')
    .replace(/&#x201D;/gi, '\u201D')
    .replace(/&#x2014;/gi, '\u2014')
    .replace(/&#x2013;/gi, '\u2013')
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
    .replace(/&amp;/g, '&')
    .replace(/&reg;/gi, '\u00AE')
    .replace(/&copy;/gi, '\u00A9');
}

function truncateText(s: string | null | undefined, maxLen = 800): string | null {
  if (!s) return null;
  const decoded = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (decoded.length === 0) return null;
  if (decoded.length <= maxLen) return decoded;
  const cut = decoded.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sanitizeKBUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const trimmed = u.trim();
  if (!trimmed) return null;
  return trimmed.replace(
    /^https:\/\/www\.kbhome\.com\/new-homes-austin\/[^/]+\/globalassets\//,
    'https://www.kbhome.com/globalassets/',
  );
}

function resolveUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return sanitizeKBUrl(path);
  if (path.startsWith('/')) return sanitizeKBUrl(KB_BASE + path);
  return null;
}

// Extract description fragments from the MIR description object.
// KB stores description as { fragments: [{ internalFormat: "<p>...</p>" }] }.
function extractDescription(desc: unknown): string | null {
  if (!desc || typeof desc !== 'object') return null;
  const d = desc as { fragments?: unknown[] };
  if (!Array.isArray(d.fragments)) return null;
  const parts: string[] = [];
  for (const f of d.fragments) {
    if (!f || typeof f !== 'object') continue;
    const fmt = (f as { internalFormat?: string }).internalFormat;
    if (typeof fmt === 'string' && fmt.trim()) {
      const text = decodeEntities(fmt.replace(/<[^>]+>/g, '').trim());
      if (text) parts.push(text);
    }
  }
  return parts.length > 0 ? truncateText(parts.join(' ')) : null;
}

// Convert ISO date to YYYY-MM-DD.
function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.length < 10) return null;
  const candidate = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate;
}

// Extract a JavaScript variable assignment like `varName = [...];`
function extractJSArray(html: string, varName: string): unknown[] | null {
  const anchor = html.indexOf(varName);
  if (anchor === -1) return null;
  const eq = html.indexOf('=', anchor);
  if (eq === -1) return null;
  const bracketStart = html.indexOf('[', eq);
  if (bracketStart === -1 || bracketStart - eq > 50) return null;
  let depth = 0;
  let inStr = false;
  let strChar = '';
  let escaped = false;
  for (let i = bracketStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === strChar) { inStr = false; continue; }
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
    if (c === '[') depth++;
    if (c === ']') {
      depth--;
      if (depth === 0) {
        const jsonStr = html.slice(bracketStart, i + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// MIR detail page enrichment
// ─────────────────────────────────────────────────────────────────────────

type MIRDetailEnrichment = {
  floorPlanUrl: string | null;
  amenities: string[] | null;
  zillowTourUrl: string | null;
  extraPhotos: string[];
};

function parseMIRDetailPage(html: string): MIRDetailEnrichment {
  // 1. Floor plan URL — KB uses kb-vu.com interactive floor plan viewer
  let floorPlanUrl: string | null = null;
  const fpMatch = html.match(
    /https:\/\/kb-vu\.com\/plan\/[A-Za-z0-9._-]+(?:\?[^"'\s&]+(?:&[^"'\s&]+)*)?/,
  );
  if (fpMatch) {
    floorPlanUrl = fpMatch[0]
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'");
  }

  // 2. Amenities pictograms with labels
  // Pattern: floorplan-pictograms/{slug}.svg"></div>...<span>{Label}</span>
  const amenities: string[] = [];
  const amenRe =
    /floorplan-pictograms\/([a-z-]+)\.svg"[^>]*><\/div>\s*<span>([^<]+)<\/span>/g;
  let amenMatch: RegExpExecArray | null;
  while ((amenMatch = amenRe.exec(html)) !== null) {
    const label = decodeEntities(amenMatch[2].trim());
    if (label && !amenities.includes(label)) {
      amenities.push(label);
    }
  }
  amenRe.lastIndex = 0;

  // 3. Zillow interactive tour link
  let zillowTourUrl: string | null = null;
  const zillowMatch = html.match(
    /https:\/\/www\.zillow\.com\/view-imx\/[a-f0-9-]+[^"'\s]*/,
  );
  if (zillowMatch) {
    zillowTourUrl = zillowMatch[0]
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'");
  }

  // 4. Any additional photos not already captured
  // Look for all globalassets image URLs
  const extraPhotos: string[] = [];
  const photoRe =
    /(?:src|data-src)="([^"]*globalassets\/images\/community-images[^"]*)"/g;
  let photoMatch: RegExpExecArray | null;
  while ((photoMatch = photoRe.exec(html)) !== null) {
    const u = resolveUrl(photoMatch[1]);
    if (u && !extraPhotos.includes(u)) {
      extraPhotos.push(u);
    }
  }
  photoRe.lastIndex = 0;

  return {
    floorPlanUrl,
    amenities: amenities.length > 0 ? amenities : null,
    zillowTourUrl,
    extraPhotos,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

async function fetchAustinCommunityUrls(): Promise<string[]> {
  const xml = await fetchUrl(SITEMAP_URL);
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  SITEMAP_COMMUNITY_RE.lastIndex = 0;
  while ((m = SITEMAP_COMMUNITY_RE.exec(xml)) !== null) {
    urls.add(m[1]);
  }
  SITEMAP_COMMUNITY_RE.lastIndex = 0;
  return Array.from(urls);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-home normalization
// ─────────────────────────────────────────────────────────────────────────

function normalize(
  home: KBMIRHome,
  communityUrl: string,
  enrichment: MIRDetailEnrichment | null,
): ScrapedKBHomeMIRRow | null {
  const id = home.id;
  if (id == null || !Number.isFinite(id)) return null;

  const externalId = `kb-mir-${id}`;
  const communityName = home.communityName?.trim() || null;
  const address = home.address?.trim() || null;

  // Title: prefer "Plan {planName} at {community}" — use floorPlanLink if name is generic
  const rawName = home.name?.trim() || null;
  const planName = rawName && !rawName.match(/^MIR Lot/i)
    ? rawName
    : null;
  let title: string;
  if (planName && communityName) {
    title = `${planName} at ${communityName}`;
  } else if (communityName) {
    // Use address for a more descriptive title
    const lotLabel = home.homesite ? ` (Lot ${home.homesite})` : '';
    title = `Move-in ready home at ${communityName}${lotLabel}`;
  } else {
    title = `KB Home move-in ready home ${id}`;
  }

  const city = home.city?.trim() || 'Austin';
  const state = (home.state || home.stateAbbreviation || 'TX').toUpperCase();

  const beds = toNum(home.bedrooms);
  const baths = toNum(home.bathrooms);
  const sqft = toNum(home.size);
  const price = toNum(home.price);

  // Gallery: merge galleryPhotos + websitePhotos + enrichment photos, dedupe by URL.
  const galleryRaw: string[] = [];
  const photoSources: KBPhoto[] = [
    ...(home.galleryPhotos ?? []),
    ...(home.websitePhotos ?? []),
  ];
  for (const p of photoSources) {
    const u = resolveUrl(p?.image);
    if (u && !galleryRaw.includes(u)) galleryRaw.push(u);
  }
  // Add any additional photos from the detail page
  if (enrichment) {
    for (const p of enrichment.extraPhotos) {
      if (p && !galleryRaw.includes(p)) galleryRaw.push(p);
    }
  }
  const thumbnailUrl = resolveUrl(home.thumbnailImage?.image);
  if (thumbnailUrl && !galleryRaw.includes(thumbnailUrl)) {
    galleryRaw.unshift(thumbnailUrl);
  }
  const galleryUrls = galleryRaw.length > 0 ? galleryRaw : null;

  const readyDate = dateOnly(home.moveInDate);
  const sourceUrl = home.pageUrl
    ? resolveUrl(home.pageUrl)
    : communityUrl;

  // Extra details — comprehensive capture.
  const extraDetails: Record<string, string> = {};
  if (home.stories) extraDetails['Stories'] = String(home.stories);
  const garages = toNum(home.garages);
  if (garages !== null) extraDetails['Garage'] = `${garages}-car`;
  if (home.style) extraDetails['Style'] = home.style;
  if (home.homesite != null) extraDetails['Lot'] = String(home.homesite);
  if (home.mlsNumber) extraDetails['MLS#'] = String(home.mlsNumber);
  if (home.mlsIdentifier) extraDetails['MLS'] = home.mlsIdentifier;
  if (home.moveInDateCopy) extraDetails['Availability'] = home.moveInDateCopy;
  if (home.isTourable) extraDetails['Tourable'] = 'Yes';
  if (home.zipCode) extraDetails['ZIP'] = home.zipCode;
  if (home.pricedFromDisplayText) extraDetails['Price Display'] = home.pricedFromDisplayText;
  if (home.sizeDisplayText) extraDetails['Sq Ft Display'] = home.sizeDisplayText;
  // Sales office info
  if (home.communityOfficePhone) extraDetails['Phone'] = home.communityOfficePhone;
  if (home.communityOfficeAddress) extraDetails['Sales Office'] = home.communityOfficeAddress;
  if (home.communityDirections) extraDetails['Directions'] = decodeEntities(home.communityDirections);
  if (home.communityPriceStatus) extraDetails['Price Range'] = home.communityPriceStatus;
  if (home.communityCityState) extraDetails['Community'] = home.communityCityState;
  if (home.floorPlanLink) extraDetails['Plan ID'] = home.floorPlanLink;
  // Amenity tag from LocalQMIs (e.g. "CoveredPatio")
  if (home.amenities) extraDetails['Home Amenities'] = home.amenities;
  // Enriched amenities from detail page (pictogram labels)
  if (enrichment?.amenities && enrichment.amenities.length > 0) {
    extraDetails['Features'] = enrichment.amenities.join(', ');
  }
  // Community highlights
  if (home.communityHighlights && home.communityHighlights.length > 0) {
    extraDetails['Community Highlights'] = home.communityHighlights.join('; ');
  }
  // Zillow tour link
  if (enrichment?.zillowTourUrl) extraDetails['Virtual Tour'] = enrichment.zillowTourUrl;

  // Description: prefer KB's embedded description, else synthesize.
  const kbDesc = extractDescription(home.description);
  let description: string | null;
  if (kbDesc) {
    // Append amenities/features to the description for searchability
    const featParts: string[] = [kbDesc];
    if (enrichment?.amenities && enrichment.amenities.length > 0) {
      featParts.push(`Features: ${enrichment.amenities.join(', ')}.`);
    }
    description = featParts.join(' ');
  } else {
    const descParts: string[] = [];
    if (planName && communityName) descParts.push(`${planName} at ${communityName}.`);
    else if (communityName) descParts.push(`Move-in ready home at ${communityName}.`);
    const specParts: string[] = [];
    if (beds !== null) specParts.push(`${beds} bedrooms`);
    if (baths !== null) specParts.push(`${baths} bathrooms`);
    if (sqft !== null) specParts.push(`${sqft.toLocaleString()} sq ft`);
    if (price !== null) specParts.push(`$${price.toLocaleString()}`);
    if (specParts.length) descParts.push(specParts.join(', ') + '.');
    if (readyDate) descParts.push(`Ready ${readyDate}.`);
    if (address) descParts.push(`Located at ${address}.`);
    if (enrichment?.amenities && enrichment.amenities.length > 0) {
      descParts.push(`Features: ${enrichment.amenities.join(', ')}.`);
    }
    description = descParts.join(' ').trim() || null;
  }

  return {
    externalId,
    builderName: 'KB Home',
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
    thumbnailUrl,
    flyerPdfUrl: null,
    sourceUrl,
    galleryUrls,
    address,
    readyDate,
    planName,
    communityName,
    homeType: 'showcase',
    floorPlanUrl: enrichment?.floorPlanUrl ?? null,
    extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchKBHomeAustinMIR(): Promise<{
  rows: ScrapedKBHomeMIRRow[];
  rawCount: number;
  skipped: number;
}> {
  let urls: string[];
  try {
    urls = await fetchAustinCommunityUrls();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`KB Home sitemap fetch failed: ${msg}`);
  }

  const rawCount = urls.length;
  if (rawCount === 0) {
    throw new Error(
      'KB Home sitemap returned zero Austin community URLs (URL pattern changed?)',
    );
  }

  const rows: ScrapedKBHomeMIRRow[] = [];
  let skipped = 0;

  for (const url of urls) {
    try {
      const html = await fetchUrl(url);
      const mirList = extractJSArray(html, 'LocalQMIs') as KBMIRHome[] | null;
      if (!mirList || mirList.length === 0) continue; // community has no MIR homes

      for (const home of mirList) {
        const id = home.id;
        if (id == null || !Number.isFinite(id)) {
          skipped++;
          continue;
        }

        // Phase 2: fetch the MIR detail page for enrichment data
        let enrichment: MIRDetailEnrichment | null = null;
        const detailUrl = home.pageUrl
          ? resolveUrl(home.pageUrl)
          : null;
        if (detailUrl) {
          try {
            const detailHtml = await fetchUrl(detailUrl);
            enrichment = parseMIRDetailPage(detailHtml);
          } catch (err) {
            // Non-fatal — we still have the LocalQMIs data
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[kb-home-mir] detail page fetch failed for home ${id} (${detailUrl}): ${msg}`,
            );
          }
        }

        const row = normalize(home, url, enrichment);
        if (row) {
          rows.push(row);
        } else {
          skipped++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[kb-home-mir] fetch/parse failed for ${url}: ${msg}`);
    }
  }

  return { rows, rawCount, skipped };
}
