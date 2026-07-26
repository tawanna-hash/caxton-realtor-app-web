// lib/scrapers/kb-home-communities.ts
//
// KB Home Austin — Community scraper (enriched).
//
// Fetches the sitemap to enumerate Austin community URLs, then scrapes each
// community detail page. Each page embeds two JavaScript arrays:
//
//   FloorPlanList = [{ floorPlanID, title, pricedFrom, bedroomsMin/Max,
//     bathroomsMin/Max, garagesMin/Max, size, stories, thumbnailImage,
//     pageUrl, ... }]
//
//   LocalQMIs = [{ address, price, bedrooms, bathrooms, garages, size,
//     stories, communityHighlights, communityOfficePhone,
//     communityOfficeAddress, communityDirections, ... }]
//
// We extract both, use FloorPlanList for the homePlans communityData blob,
// and LocalQMIs (if present) for community highlights + sales office info.
//
// Also reads dataLayer.page for the canonical community ID, name, city,
// state, and status — more reliable than HTML scraping.
//
// One row per community. `homeType = 'community'`, `kind = 'listing'`.
// Public surface: realtynewsnow.app/communities/[id].
//
// Template: docs/community-scraper-template.md

import * as cheerio from 'cheerio';
import type { CommunityData, CommunityHomePlan } from './david-weekley';

const SITEMAP_URL = 'https://www.kbhome.com/sitemap.xml';

const SITEMAP_COMMUNITY_RE =
  /<loc>\s*(https:\/\/www\.kbhome\.com\/new-homes-austin\/[a-z0-9-]+)\s*<\/loc>/g;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const KB_BASE = 'https://www.kbhome.com';

// ─────────────────────────────────────────────────────────────────────────
// Row type
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedKBHomeCommunityRow = {
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
  flyerPdfUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  galleryUrls: string[];
  communityName: string | null;
  homeType: 'community';
  communityData: CommunityData;
};

// ─────────────────────────────────────────────────────────────────────────
// API types (FloorPlanList + LocalQMIs embedded JSON)
// ─────────────────────────────────────────────────────────────────────────

type KBThumbnail = {
  image?: string | null;
  caption?: string | null;
  alternateText?: string | null;
} | null;

type KBFloorPlan = {
  floorPlanID?: string | null;
  title?: string | null;
  name?: string | null;
  pricedFrom?: string | null;
  pricedFromDisplayText?: string | null;
  bedroomsMin?: number | null;
  bedroomsMax?: number | null;
  bathroomsMin?: number | null;
  bathroomsMax?: number | null;
  garagesMin?: number | null;
  garagesMax?: number | null;
  size?: string | null;
  sizeDisplayText?: string | null;
  stories?: string | null;
  style?: string | null;
  thumbnailImage?: KBThumbnail;
  pageUrl?: string | null;
  id?: number | null;
  isActive?: boolean | null;
  communityName?: string | null;
  cityName?: string | null;
  stateAbbreviation?: string | null;
  communityPriceStatus?: string | null;
};

type KBMIR = {
  communityHighlights?: string[] | null;
  communityOfficePhone?: string | null;
  communityOfficeAddress?: string | null;
  communityDirections?: string | null;
  communityPriceStatus?: string | null;
  communityName?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x2019;/gi, '\u2019')
    .replace(/&#x2018;/gi, '\u2018')
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
    .replace(/&copy;/gi, '\u00A9')
    .replace(/&trade;/gi, '\u2122');
}

function truncateText(s: string | null | undefined, maxLen = 400): string | null {
  if (!s) return null;
  const decoded = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (decoded.length === 0) return null;
  if (decoded.length <= maxLen) return decoded;
  const cut = decoded.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '\u2026';
}

function parsePrice(s: string | null | undefined): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Sanitize KB's broken og:image URLs — they prepend /new-homes-austin/{slug}/
// before /globalassets/, producing 404s. Strip the community path segment.
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

// Match dataLayer.page['{key}'] = 'value';
function matchDataLayer(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    "dataLayer\\.page\\[['\"]" + escaped + "['\"]\\]\\s*=\\s*['\"]([^'\"]*)['\"]",
  );
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

// Extract a JavaScript variable assignment like `varName = [...];` or
// `varName = [{...}];` — handles nested objects/arrays via brace matching.
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

function deriveStatus(
  communityStatus: string | null,
  title: string,
): 'coming-soon' | 'close-out' | null {
  const t = `${communityStatus ?? ''} ${title}`.toLowerCase();
  if (t.includes('coming soon')) return 'coming-soon';
  if (
    t.includes('final phase') ||
    t.includes('final opportunit') ||
    t.includes('close out') ||
    t.includes('close-out') ||
    t.includes('final homesites')
  ) {
    return 'close-out';
  }
  return null;
}

function synthesizeDescription(
  name: string,
  city: string,
  priceMin: number | null,
  priceMax: number | null,
  sqftMin: number | null,
  sqftMax: number | null,
  highlights: string[],
  status: 'coming-soon' | 'close-out' | null,
): string {
  const parts: string[] = [`${name} is a KB Home community in ${city}, TX.`];
  const specs: string[] = [];
  if (priceMin != null && priceMax != null && priceMin !== priceMax) {
    specs.push(`homes from $${priceMin.toLocaleString()} to $${priceMax.toLocaleString()}`);
  } else if (priceMin != null) {
    specs.push(`homes from $${priceMin.toLocaleString()}`);
  }
  if (sqftMin != null && sqftMax != null && sqftMin !== sqftMax) {
    specs.push(`${sqftMin.toLocaleString()}\u2013${sqftMax.toLocaleString()} sq. ft.`);
  } else if (sqftMin != null) {
    specs.push(`${sqftMin.toLocaleString()} sq. ft.`);
  }
  if (specs.length) parts.push(specs.join(', ') + '.');
  if (highlights.length > 0) {
    const list = highlights.slice(0, 4).join('; ');
    parts.push(`${list}.`);
  }
  if (status === 'coming-soon') parts.push('Coming soon.');
  else if (status === 'close-out') parts.push('Final opportunities.');
  return parts.join(' ');
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
// Per-community parsing
// ─────────────────────────────────────────────────────────────────────────

function parseCommunityPage(
  html: string,
  url: string,
): ScrapedKBHomeCommunityRow | null {
  const $ = cheerio.load(html);

  // dataLayer.page provides canonical community ID + name.
  const externalId = matchDataLayer(html, 'community ID');
  if (!externalId) return null;

  const communityName = matchDataLayer(html, 'community name');
  if (!communityName) return null;

  const city = matchDataLayer(html, 'city') || 'Austin';
  const state = (matchDataLayer(html, 'state') || 'TX').toUpperCase();
  const communityStatus = matchDataLayer(html, 'community status') || null;

  // Meta description for the community.
  const description = truncateText(
    $('meta[name="description"]').attr('content'),
  );

  // Thumbnail: og:image (sanitized to fix KB's URL bug).
  // Fall back to first gallery image if og:image is missing.
  let thumbnailUrl = sanitizeKBUrl(
    $('meta[property="og:image"]').attr('content'),
  );

  // Gallery: hero section images (same bug class as og:image).
  const galleryUrlsRaw: string[] = [];
  $('section.container.hero img').each((_, el) => {
    const rawSrc = $(el).attr('src')?.trim();
    if (!rawSrc) return;
    const abs = resolveUrl(rawSrc);
    if (abs && abs.includes('/globalassets/') && !galleryUrlsRaw.includes(abs)) {
      galleryUrlsRaw.push(abs);
    }
  });
  if (thumbnailUrl && !galleryUrlsRaw.includes(thumbnailUrl)) {
    galleryUrlsRaw.unshift(thumbnailUrl);
  }
  if (!thumbnailUrl && galleryUrlsRaw.length > 0) {
    thumbnailUrl = galleryUrlsRaw[0];
  }
  const galleryUrls = galleryUrlsRaw.length > 0 ? galleryUrlsRaw : [];

  // FloorPlanList: embedded JSON with all plans for this community.
  const fpList = extractJSArray(html, 'FloorPlanList') as KBFloorPlan[] | null;

  const prices: number[] = [];
  const beds: number[] = [];
  const baths: number[] = [];
  const sqfts: number[] = [];

  const homePlans: CommunityHomePlan[] = [];
  if (fpList) {
    for (const fp of fpList) {
      const planName = fp.title?.trim() || fp.name?.trim() || '';
      if (!planName) continue;

      const planPrice = parsePrice(fp.pricedFrom);
      if (planPrice !== null) prices.push(planPrice);

      const planBedsMin = toNum(fp.bedroomsMin);
      const planBedsMax = toNum(fp.bedroomsMax);
      if (planBedsMin !== null) beds.push(planBedsMin);
      if (planBedsMax !== null) beds.push(planBedsMax);

      const planBathsMin = toNum(fp.bathroomsMin);
      const planBathsMax = toNum(fp.bathroomsMax);
      if (planBathsMin !== null) baths.push(planBathsMin);
      if (planBathsMax !== null) baths.push(planBathsMax);

      const planSqft = toNum(fp.size);
      if (planSqft !== null) sqfts.push(planSqft);

      const planImg = resolveUrl(fp.thumbnailImage?.image);

      homePlans.push({
        name: planName,
        url: fp.pageUrl ? resolveUrl(fp.pageUrl) : null,
        priceDisplay: fp.pricedFromDisplayText ?? null,
        basePrice: planPrice,
        sqftDisplay: fp.sizeDisplayText ?? null,
        beds: planBedsMin !== null && planBathsMax !== null && planBedsMin !== planBedsMax
          ? `${planBedsMin}-${planBedsMax}`
          : planBedsMin !== null ? String(planBedsMin) : null,
        baths: planBathsMin !== null && planBathsMax !== null && planBathsMin !== planBathsMax
          ? `${planBathsMin}-${planBathsMax}`
          : planBathsMin !== null ? String(planBathsMin) : null,
        garages: fp.garagesMin != null && fp.garagesMax != null && fp.garagesMin !== fp.garagesMax
          ? `${fp.garagesMin}-${fp.garagesMax}`
          : fp.garagesMin != null ? String(fp.garagesMin) : null,
        stories: fp.stories ?? null,
        imageUrl: planImg,
        status: null,
        isModel: fp.title?.toLowerCase().includes('modeled') ?? false,
      });
    }
  }

  // LocalQMIs: if present, carries community highlights + sales office info.
  const mirList = extractJSArray(html, 'LocalQMIs') as KBMIR[] | null;
  const firstMir = mirList && mirList.length > 0 ? mirList[0] : null;
  const highlights = firstMir?.communityHighlights ?? [];

  const priceMin = prices.length > 0 ? Math.min(...prices) : null;
  const priceMax = prices.length > 1 ? Math.max(...prices) : null;
  const bedsMin = beds.length > 0 ? Math.min(...beds) : null;
  const bedsMax = beds.length > 0 ? Math.max(...beds) : null;
  const bathsMin = baths.length > 0 ? Math.min(...baths) : null;
  const bathsMax = baths.length > 0 ? Math.max(...baths) : null;
  const sqftMin = sqfts.length > 0 ? Math.min(...sqfts) : null;
  const sqftMax = sqfts.length > 0 ? Math.max(...sqfts) : null;

  const status = deriveStatus(communityStatus, communityName);

  // Build communityData blob.
  const cd: CommunityData = {
    communityName,
    city,
    imageUrls: galleryUrls.length > 0 ? galleryUrls : [],
    amenities: [],
    homePlans,
    status,
  };

  // Price/sqft display.
  if (priceMin != null) {
    cd.basePrice = priceMin;
    cd.priceFrom = priceMax != null && priceMin !== priceMax
      ? `$${priceMin.toLocaleString()}\u2013$${priceMax.toLocaleString()}`
      : `From $${priceMin.toLocaleString()}`;
  }
  if (sqftMin != null && sqftMax != null) {
    cd.sqftRange = sqftMin !== sqftMax
      ? `${sqftMin.toLocaleString()}\u2013${sqftMax.toLocaleString()}`
      : `${sqftMin.toLocaleString()}`;
  } else if (sqftMin != null) {
    cd.sqftRange = `${sqftMin.toLocaleString()}`;
  }

  // Availability from dataLayer.
  cd.availability = communityStatus || null;

  // Sales office from MIR data (same on all MIR entries for a community).
  if (firstMir) {
    cd.salesOffice = {
      address: firstMir.communityOfficeAddress ?? null,
      hours: null,
      phone: firstMir.communityOfficePhone ?? null,
      directions: firstMir.communityDirections
        ? [firstMir.communityDirections]
        : [],
      lat: null,
      lng: null,
    };
  }

  // Amenities from highlights.
  if (highlights.length > 0) {
    cd.amenities = highlights;
  }

  // Description: prefer meta description, else synthesize.
  const finalDescription = description
    || synthesizeDescription(
      communityName, city, priceMin, priceMax, sqftMin, sqftMax, highlights, status,
    );

  return {
    externalId,
    builderName: 'KB Home',
    title: communityName,
    city,
    state,
    description: finalDescription,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax,
    flyerPdfUrl: null,
    thumbnailUrl,
    sourceUrl: url,
    galleryUrls,
    communityName,
    homeType: 'community',
    communityData: cd,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchKBHomeAustinCommunities(): Promise<{
  rows: ScrapedKBHomeCommunityRow[];
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

  const rows: ScrapedKBHomeCommunityRow[] = [];
  let skipped = 0;

  for (const url of urls) {
    try {
      const html = await fetchUrl(url);
      const row = parseCommunityPage(html, url);
      if (row) {
        rows.push(row);
      } else {
        skipped++;
        console.warn(
          `[kb-home-communities] skipped (missing dataLayer community ID or name): ${url}`,
        );
      }
    } catch (err) {
      skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[kb-home-communities] fetch/parse failed for ${url}: ${msg}`);
    }
  }

  return { rows, rawCount, skipped };
}
