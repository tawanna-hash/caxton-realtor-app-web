// lib/scrapers/santa-rita-ranch-communities.ts
//
// Santa Rita Ranch (developer) — communities / neighborhoods scraper.
//
// Personalized for a DEVELOPER community (not a single builder):
//   - developerName = 'Santa Rita Ranch' (set on every row)
//   - communityData.builders[] lists the individual builders active in
//     each neighborhood (Perry Homes, Toll Brothers, etc.)
//   - communityData extracts per-neighborhood pricing, amenities, schools
//     from the HTML page (WP REST API content is mostly shared footer)
//
// Two-phase scrape:
//   Phase 1: WP REST API `/wp-json/wp/v2/poi?per_page=100` — get the
//            neighborhood list (id, slug, link, title, excerpt, featured_media)
//   Phase 2: Fetch each neighborhood's HTML page — extract builders, pricing,
//            amenities, schools, description, status, images
//
// External ID pattern: srr/community/{wp_post_id}
// Publication: 'realtyline' (Greater Austin / Liberty Hill).
// Home type: 'community'.

import type { CommunityData } from './david-weekley';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedSRRCommunityRow = {
  externalId: string;
  developerName: 'Santa Rita Ranch';
  builderName: 'Santa Rita Ranch';
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
  extraDetails: Record<string, string> | null;
};

type WPPOI = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
};

type WPMedia = {
  source_url: string;
  media_details?: {
    sizes?: Record<string, { source_url: string }>;
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const BASE = 'https://santaritaranchaustin.com';
const DEVELOPER_NAME = 'Santa Rita Ranch' as const;
const CITY = 'Liberty Hill';
const STATE = 'TX';

// Known builder names that may appear in neighborhood pages.
const KNOWN_BUILDERS = [
  'CastleRock Communities',
  'Coventry Homes',
  'Highland Homes',
  'Perry Homes',
  'Pulte Homes',
  'Scott Felder Homes',
  'Toll Brothers',
  'Westin Homes',
  'Taylor Morrison',
  'Drees Homes',
  'KB Home',
  'David Weekley Homes',
  'M/I Homes',
  'Sitterle Homes',
  'Lennar',
  'Grand Haven Homes',
  'GFO Home',
  'Plantation Homes',
  'Brookfield Residential',
  'Bethany Group',
  'Milestone Community Builders',
  'Legacy Homes',
  'Stylecraft Builders',
  'Rancho Sienna',
];

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u200b/g, '')
    .replace(/\u200b/g, '');
}

/** Extract builder names from neighborhood page HTML.
 *  Looks for builder names in elementor-post__title elements (featured homes
 *  section) and in general text. Returns deduplicated, sorted list. */
function extractBuilders(html: string): string[] {
  const found = new Set<string>();

  // Strategy 1: Find builder names inside elementor-post__title elements
  // (these are the "featured homes" posts — each title is a builder name)
  const postTitles = html.matchAll(
    /class="[^"]*elementor-post__title[^"]*"[^>]*>\s*([^<]+?)\s*</g,
  );
  for (const m of postTitles) {
    const text = decodeEntities(m[1].trim());
    // Match against known builders (case-insensitive)
    for (const b of KNOWN_BUILDERS) {
      if (text.toLowerCase() === b.toLowerCase()) {
        found.add(b);
      }
    }
  }

  // Strategy 2: Scan for known builder names in the main content area.
  // We look for builder names that appear in heading or link contexts
  // (not in footer/navigation sections).
  const mainContent = extractMainContent(html);
  for (const b of KNOWN_BUILDERS) {
    const regex = new RegExp(
      `>\\s*${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`,
      'i',
    );
    if (regex.test(mainContent)) {
      found.add(b);
    }
  }

  return Array.from(found).sort();
}

/** Try to extract the main content area, excluding header/footer/nav. */
function extractMainContent(html: string): string {
  // Try to find the main elementor content area
  const mainMatch = html.match(
    /<main[\s\S]*?>([\s\S]*?)<\/main>/i,
  );
  if (mainMatch) return mainMatch[1];

  // Fallback: find content between the first elementor section and the footer
  const footerIdx = html.search(/<footer/i);
  if (footerIdx > 0) return html.substring(0, footerIdx);

  return html;
}

/** Extract pricing text from neighborhood page HTML. */
function extractPriceFrom(html: string): string | null {
  // "from the low $400s – $3 million+"
  // "priced from the $300s"
  // "starting from the high $500s"
  const patterns = [
    /(?:from\s+the|priced\s+from|starting\s+(?:at|from))\s+(?:the\s+)?(low|mid|high\s+)?\$([\d,]+[sS]?)\s*[–-]\s*\$?([\d,]+(?:\s*million)?[sS+]*)/i,
    /(?:from\s+the|priced\s+from|starting\s+(?:at|from))\s+(?:the\s+)?(low|mid|high\s+)?\$([\d,]+[sS]?)/i,
    /\$([\d,]{5,})\s*[–-]\s*\$?([\d,]+(?:\s*million)?[sS+]*)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const prefix = m[1] ? m[1].trim() + ' ' : '';
      const low = `$${m[2]}`;
      const high = m[3] ? ` – $${m[3]}` : '';
      return `${prefix}${low}${high}`.trim();
    }
  }
  return null;
}

/** Extract amenities from heading elements in the HTML. */
function extractAmenities(html: string): string[] {
  const amenities = new Set<string>();
  const amenityKeywords =
    /pool|pickleball|trail|pavilion|park|amenit|center|barn|fitness|play|dog|lake|court|field|splash|club|happyland|camp|ranch/i;

  // h2-h4 headings that match amenity keywords
  const headings = html.matchAll(/<h[234][^>]*>([^<]+)<\/h[234]>/gi);
  for (const m of headings) {
    const text = decodeEntities(stripHtml(m[1]).trim());
    if (text && text.length > 2 && text.length < 120 && amenityKeywords.test(text)) {
      amenities.add(text);
    }
  }

  // Elementor icon-list text items
  const iconList = html.matchAll(
    /class="[^"]*elementor-icon-list-text[^"]*"[^>]*>([^<]+)</g,
  );
  for (const m of iconList) {
    const text = decodeEntities(stripHtml(m[1]).trim());
    if (text && text.length > 2 && text.length < 100 && amenityKeywords.test(text)) {
      amenities.add(text);
    }
  }

  return Array.from(amenities);
}

/** Extract school information from the HTML text. */
function extractSchools(
  html: string,
): { district: string | null; list: { name: string; grades?: string | null }[] } {
  const list: { name: string; grades?: string | null }[] = [];
  let district: string | null = null;

  // Find school district
  const districtMatch = html.match(
    /(?:zoned\s+to|school\s+district|ISD)[^<]*?([A-Z][a-zA-Z\s]+ISD)/,
  );
  if (districtMatch) {
    district = districtMatch[1].trim();
  }
  // Fallback: Liberty Hill ISD is the known district for SRR
  if (!district && /Liberty Hill ISD/i.test(html)) {
    district = 'Liberty Hill ISD';
  }

  // Find school names (Elementary, Middle, High School)
  const schoolPattern =
    /([A-Z][a-zA-Z\s]+(?:Elementary|Middle School|High School))/g;
  const schoolMatches = html.matchAll(schoolPattern);
  const seen = new Set<string>();
  for (const m of schoolMatches) {
    const name = m[1].trim();
    if (!seen.has(name) && name.length > 3 && name.length < 60) {
      seen.add(name);
      list.push({ name });
    }
  }

  return { district, list };
}

/** Derive lifecycle status from page text. */
function deriveStatus(html: string): 'coming-soon' | 'close-out' | null {
  const lower = html.toLowerCase();
  if (
    lower.includes('coming soon') ||
    lower.includes('new neighborhood') ||
    lower.includes('newest village')
  ) {
    return 'coming-soon';
  }
  if (
    lower.includes('final opportunit') ||
    lower.includes('close out') ||
    lower.includes('close-out') ||
    lower.includes('closing soon')
  ) {
    return 'close-out';
  }
  return null;
}

/** Detect 55+ / active adult designation. */
function detectAdultOnly(title: string, html: string): boolean {
  return (
    title.includes('55+') ||
    /55\+/.test(title) ||
    /active adult/i.test(title) ||
    (/55\+/.test(html) && /active adult/i.test(html) && /regency/i.test(title))
  );
}

/** Extract image URLs from HTML, filtering out icons/logos/avatars. */
function extractImages(html: string): string[] {
  const urls = new Set<string>();

  // nitro-lazy-src (NitroPack CDN-optimized images)
  const nitro = html.matchAll(
    /nitro-lazy-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/gi,
  );
  for (const m of nitro) urls.add(m[1]);

  // Regular src on img tags
  const src = html.matchAll(
    /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/gi,
  );
  for (const m of src) urls.add(m[1]);

  // data-bg (Elementor background images)
  const bg = html.matchAll(
    /data-bg="url\((https?:\/\/[^)]+\.(?:jpg|jpeg|png|webp))/gi,
  );
  for (const m of bg) urls.add(m[1]);

  // Filter out icons, logos, avatars, and tiny graphics
  return Array.from(urls).filter(
    (u) =>
      !u.includes('avatar') &&
      !u.includes('icon-') &&
      !u.includes('/icon.') &&
      !u.includes('logo') &&
      !u.includes('favicon') &&
      !u.includes('-1024x') === false, // keep large images
  );
}

/** Fetch featured media URL via WP REST API. */
async function fetchMediaUrl(mediaId: number): Promise<string | null> {
  if (!mediaId) return null;
  try {
    const res = await fetch(`${BASE}/wp-json/wp/v2/media/${mediaId}`, {
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const media = (await res.json()) as WPMedia;
    return media.source_url ?? null;
  } catch {
    return null;
  }
}

/** Fetch a neighborhood HTML page. */
async function fetchNeighborhoodHtml(
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RNN-Scraper/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Absolutize a relative URL. */
function normalizeUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Main scrape
// ─────────────────────────────────────────────────────────────────────────

export async function fetchSRRCommunities(): Promise<{
  rows: ScrapedSRRCommunityRow[];
  rawCount: number;
  detailFetched: number;
  detailErrors: { community: string; error: string }[];
}> {
  // Phase 1: Fetch all POI items from WP REST API
  const res = await fetch(`${BASE}/wp-json/wp/v2/poi?per_page=100`, {
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`WP REST API returned ${res.status}`);
  }
  const allPOIs = (await res.json()) as WPPOI[];

  // Filter for neighborhoods (exclude CASO for-rent)
  const neighborhoods = allPOIs.filter(
    (p) => p.link.includes('/neighborhood') && !p.slug.includes('caso'),
  );

  const rows: ScrapedSRRCommunityRow[] = [];
  let detailFetched = 0;
  const detailErrors: { community: string; error: string }[] = [];

  // Phase 2: Process each neighborhood (fetch HTML page for rich data)
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < neighborhoods.length) {
      const i = cursor++;
      const poi = neighborhoods[i];
      const title = decodeEntities(stripHtml(poi.title.rendered));
      try {
        // Fetch featured media (thumbnail)
        const thumbnailUrl = await fetchMediaUrl(poi.featured_media);

        // Fetch the neighborhood HTML page for rich data
        const pageUrl = poi.link;
        const html = await fetchNeighborhoodHtml(pageUrl);

        let galleryImages: string[] = [];
        let priceFrom: string | null = null;
        let amenities: string[] = [];
        let builders: string[] = [];
        let schools: { district: string | null; list: { name: string; grades?: string | null }[] } = { district: null, list: [] };
        let status: 'coming-soon' | 'close-out' | null = null;
        let adultOnly = false;
        let description: string | null = null;

        if (html) {
          detailFetched++;

          // Extract gallery images from the page HTML
          galleryImages = extractImages(html);

          // Extract pricing
          priceFrom = extractPriceFrom(html);

          // Extract amenities from headings
          amenities = extractAmenities(html);

          // Extract builders (developer personalization)
          builders = extractBuilders(html);

          // Extract schools
          schools = extractSchools(html);

          // Derive lifecycle status
          status = deriveStatus(html);

          // Detect 55+ / active adult
          adultOnly = detectAdultOnly(title, html);

          // Use excerpt as description, or synthesize
          const excerpt = decodeEntities(stripHtml(poi.excerpt.rendered)).trim();
          description = excerpt || null;
        } else {
          // Fallback: use excerpt from WP API
          const excerpt = decodeEntities(stripHtml(poi.excerpt.rendered)).trim();
          description = excerpt || null;
        }

        // Ensure thumbnail is in gallery
        if (thumbnailUrl && !galleryImages.includes(thumbnailUrl)) {
          galleryImages.unshift(thumbnailUrl);
        }

        // Build communityData with developer personalization
        const communityData: CommunityData = {
          communityName: title,
          priceFrom: priceFrom ?? undefined,
          imageUrls: galleryImages,
          amenities,
          city: CITY,
          status,
          adultOnly: adultOnly || undefined,
          builders: builders.length > 0 ? builders : undefined,
          schools:
            schools.list.length > 0 || schools.district
              ? {
                  district: schools.district,
                  list: schools.list.map((s) => ({
                    name: s.name,
                    grades: s.grades ?? null,
                  })),
                }
              : undefined,
        };

        // Build extraDetails with builder info
        const extraDetails: Record<string, string> = {};
        if (builders.length > 0) {
          extraDetails['Builders'] = builders.join(', ');
        }
        if (priceFrom) {
          extraDetails['Price Range'] = priceFrom;
        }
        if (schools.district) {
          extraDetails['School District'] = schools.district;
        }

        rows.push({
          externalId: `srr/community/${poi.id}`,
          developerName: DEVELOPER_NAME,
          builderName: DEVELOPER_NAME,
          title,
          city: CITY,
          state: STATE,
          description,
          bedsMin: null,
          bedsMax: null,
          bathsMin: null,
          bathsMax: null,
          sqftMin: null,
          sqftMax: null,
          priceMin: null,
          priceMax: null,
          thumbnailUrl,
          flyerPdfUrl: null,
          sourceUrl: normalizeUrl(poi.link.replace(BASE, '')),
          galleryUrls: galleryImages,
          communityName: title,
          homeType: 'community',
          communityData,
          extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        detailErrors.push({ community: title, error: msg });
        console.error(`[srr-communities] failed for "${title}" (${poi.id}):`, msg);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, neighborhoods.length) }, worker),
  );

  return {
    rows,
    rawCount: neighborhoods.length,
    detailFetched,
    detailErrors,
  };
}
