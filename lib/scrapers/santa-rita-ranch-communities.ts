// lib/scrapers/santa-rita-ranch-communities.ts
//
// Santa Rita Ranch (developer) — communities / neighborhoods scraper.
//
// Source: santaritaranchaustin.com WordPress REST API.
//
//   GET https://santaritaranchaustin.com/wp-json/wp/v2/poi?per_page=100
//
// The `poi` custom post type includes neighborhoods (filtered by
// `/neighborhood` in the link). We exclude CASO (for-rent cottages).
//
// For each neighborhood we:
//   1. Fetch the featured media URL via /wp-json/wp/v2/media/{id}
//   2. Parse content.rendered HTML for gallery images (nitro-lazy-src, src)
//   3. Extract pricing text ("PRICED FROM THE $300s", etc.)
//   4. Extract amenities from Elementor icon-list items
//   5. Build CommunityData with imageUrls, amenities, priceFrom, description
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const BASE = 'https://santaritaranchaustin.com';

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
    .replace(/\u200b/g, '');
}

/** Extract image URLs from Elementor HTML content. */
function extractGalleryImages(html: string): string[] {
  const urls = new Set<string>();

  // nitro-lazy-src (NitroPack CDN-optimized images)
  const nitro = html.matchAll(/nitro-lazy-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/gi);
  for (const m of nitro) urls.add(m[1]);

  // Regular src on img tags
  const src = html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))/gi);
  for (const m of src) urls.add(m[1]);

  // data-bg (Elementor background images)
  const bg = html.matchAll(/data-bg="url\((https?:\/\/[^)]+\.(?:jpg|jpeg|png|webp))/gi);
  for (const m of bg) urls.add(m[1]);

  // Filter out tiny icons / logos / avatars
  return Array.from(urls).filter(
    (u) => !u.includes('avatar') && !u.includes('icon') && !u.includes('logo') && !u.includes('favicon'),
  );
}

/** Extract pricing text from HTML content. */
function extractPriceFrom(html: string): string | null {
  // "PRICED FROM THE $300s", "Priced from the high $400s", "from the $500s"
  const m = html.match(/(?:priced\s+from|starting\s+from|from\s+the)\s+(?:the\s+)?(low|mid|high\s+)?\$?([\d,]+[skSK+s]*)/i);
  if (m) {
    const prefix = m[1] ? m[1].trim() + ' ' : '';
    return `${prefix}$${m[2]}`.trim();
  }
  // "$399,990" standalone
  const m2 = html.match(/\$([\d,]{5,})/);
  if (m2) return `$${m2[1]}`;
  return null;
}

/** Extract amenities from Elementor icon-list items. */
function extractAmenities(html: string): string[] {
  const amenities = new Set<string>();
  const matches = html.matchAll(/<span[^>]*class="[^"]*elementor-icon-list-text[^"]*"[^>]*>([^<]+)<\/span>/gi);
  for (const m of matches) {
    const text = stripHtml(m[1]).trim();
    if (text && text.length > 2 && text.length < 100) {
      amenities.add(text);
    }
  }
  // Also check for heading elements that mention amenities
  const headings = html.matchAll(/<h\d[^>]*>([^<]*(?:pool|amenit|park|trail|center|barn|club|fitness|play|dog|lake|court|field)[^<]*)<\/h\d>/gi);
  for (const m of headings) {
    const text = stripHtml(m[1]).trim();
    if (text && text.length > 2 && text.length < 100) {
      amenities.add(text);
    }
  }
  return Array.from(amenities);
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

// ─────────────────────────────────────────────────────────────────────────
// Main scrape
// ─────────────────────────────────────────────────────────────────────────

export async function fetchSRRCommunities(): Promise<{
  rows: ScrapedSRRCommunityRow[];
  rawCount: number;
  detailFetched: number;
  detailErrors: { community: string; error: string }[];
}> {
  // Step 1: Fetch all POI items
  const res = await fetch(`${BASE}/wp-json/wp/v2/poi?per_page=100`, {
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`WP REST API returned ${res.status}`);
  }
  const allPOIs = (await res.json()) as WPPOI[];

  // Step 2: Filter for neighborhoods (exclude CASO for-rent)
  const neighborhoods = allPOIs.filter(
    (p) => p.link.includes('/neighborhood') && !p.slug.includes('caso'),
  );

  const rows: ScrapedSRRCommunityRow[] = [];
  let detailFetched = 0;
  const detailErrors: { community: string; error: string }[] = [];

  // Step 3: Process each neighborhood
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < neighborhoods.length) {
      const i = cursor++;
      const poi = neighborhoods[i];
      const title = decodeEntities(stripHtml(poi.title.rendered));
      try {
        // Fetch featured media
        const thumbnailUrl = await fetchMediaUrl(poi.featured_media);
        if (thumbnailUrl) detailFetched++;

        // Parse content for gallery images
        const contentHtml = poi.content.rendered;
        const galleryImages = extractGalleryImages(contentHtml);

        // Ensure thumbnail is in gallery
        if (thumbnailUrl && !galleryImages.includes(thumbnailUrl)) {
          galleryImages.unshift(thumbnailUrl);
        }

        // Extract pricing
        const priceFrom = extractPriceFrom(contentHtml);

        // Extract amenities
        const amenities = extractAmenities(contentHtml);

        // Clean description from excerpt
        const description = decodeEntities(stripHtml(poi.excerpt.rendered)) || null;

        // Build communityData
        const communityData: CommunityData = {
          communityName: title,
          priceFrom: priceFrom ?? undefined,
          imageUrls: galleryImages,
          amenities,
          city: 'Liberty Hill',
        };

        rows.push({
          externalId: `srr/community/${poi.id}`,
          builderName: 'Santa Rita Ranch',
          title,
          city: 'Liberty Hill',
          state: 'TX',
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
          sourceUrl: poi.link,
          galleryUrls: galleryImages,
          communityName: title,
          homeType: 'community',
          communityData,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        detailErrors.push({ community: title, error: msg });
        console.error(`[srr-communities] failed for "${title}" (${poi.id}):`, msg);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, neighborhoods.length) }, worker));

  return {
    rows,
    rawCount: neighborhoods.length,
    detailFetched,
    detailErrors,
  };
}
