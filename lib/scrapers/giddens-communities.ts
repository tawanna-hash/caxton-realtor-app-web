// lib/scrapers/giddens-communities.ts
//
// Giddens Homes Austin — Communities scraper (per-community rows).
//
// Source: https://giddenshomes.com/communities/ (Smarttouch / WordPress).
// The index page lists 9 community detail-page URLs of the form:
//   https://giddenshomes.com/communities/<slug>/
//
// Per-community data isn't aggregated on the index page itself (the
// `community-overview` blocks contain only title + photo gallery + sales
// rep info). The detail pages, however, include a structured
// `<div class="info has-address">` block plus a `<meta name="description">`
// blurb, which gives us city, state, street, and a short summary.
//
// Strategy:
//   1. Fetch the communities index, extract all `/communities/<slug>/` links
//   2. For each unique slug, fetch the detail page
//   3. Parse out: title (from <title>), city/state/street (from address
//      spans), description (from meta tag), thumbnail (first gallery image)
//   4. Skip stubs that have no city span — those pages are template
//      placeholders (e.g. "Northgate Ranch", "Santa Rita Ranch") with no
//      real content yet.
//
// Output: one `homeType: 'community'` row per community, with no
// beds/baths/sqft/price (this builder doesn't surface those on the
// community page — those live on the per-home `/homes/` page handled by
// lib/scrapers/giddens.ts).

const INDEX_URL = 'https://giddenshomes.com/communities/';
const GIDDENS_BASE_URL = 'https://giddenshomes.com';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Output shape — one row per community
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedGiddensCommunityRow = {
  externalId: string;
  builderName: 'Giddens Homes';
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
  address: string | null;
  readyDate: null;
  planName: null;
  communityName: string;
  homeType: 'community';
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function normalizeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return GIDDENS_BASE_URL + path;
  return null;
}

function getInnerText(html: string, klass: string): string | null {
  const re = new RegExp(
    `<[a-z]+[^>]*class="[^"]*\\b${klass}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z]+>`,
    'i',
  );
  const m = html.match(re);
  if (!m) return null;
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

// Pretty-name a slug: "burnet-hilltop-estates" -> "Burnet Hilltop Estates"
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

async function fetchHtml(
  url: string,
): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: COMMON_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const html = await res.text();
  if (!html || html.length < 1000) {
    throw new Error(`Body suspiciously small from ${url}`);
  }
  return { html, finalUrl: res.url || url };
}

// Extract a slug from a /communities/<slug>/ URL.
function slugFromUrl(url: string): string | null {
  const m = url.match(/\/communities\/([a-z0-9][a-z0-9-]*)\/?(?:[?#]|$)/);
  return m ? m[1] : null;
}

// Pull the unique set of community slugs from the index page.
function extractCommunitySlugs(html: string): string[] {
  const set = new Set<string>();
  const re = /\/communities\/([a-z0-9][a-z0-9-]*)\/(?:["'#?])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    // Filter obvious non-community paths (none expected, but guard anyway)
    if (slug.length > 1 && slug.length < 80) {
      set.add(slug);
    }
  }
  return Array.from(set).sort();
}

// Pick the first gallery image from a detail page.
function extractFirstGalleryImage(html: string): string | null {
  // Prefer images inside class="swiper-lazy" (lazy-loaded gallery slides).
  const lazyMatch = html.match(
    /<img[^>]*class="[^"]*\bswiper-lazy\b[^"]*"[^>]*\bdata-src="([^"]+)"/i,
  );
  if (lazyMatch) return normalizeUrl(lazyMatch[1]);
  // Fallback: first <img src="..."> on the page that looks like an
  // /wp-content/uploads/... path
  const srcMatch = html.match(
    /<img[^>]*\bsrc="(\/wp-content\/uploads\/[^"]+)"/i,
  );
  if (srcMatch) return normalizeUrl(srcMatch[1]);
  return null;
}

// Extract the meta description
function extractMetaDescription(html: string): string | null {
  const m = html.match(
    /<meta\s+name="description"\s+content="([^"]*)"/i,
  );
  if (!m) return null;
  // Decode a few common HTML entities that show up in WordPress descriptions
  const decoded = m[1]
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&quot;/g, '"')
    .trim();
  return decoded || null;
}

// Parse a community detail page into a normalized row. Returns null if
// the page is a stub (no city info available).
function parseDetailPage(
  slug: string,
  html: string,
): ScrapedGiddensCommunityRow | null {
  // Address — require at least a city span
  const city = getInnerText(html, 'city');
  const state = (getInnerText(html, 'state') || 'TX').toUpperCase();
  const streetNumber = getInnerText(html, 'streetnumber') || '';
  const route = getInnerText(html, 'route') || '';
  const zip = getInnerText(html, 'zip') || '';

  if (!city) {
    // Stub page (e.g. Northgate Ranch, Santa Rita Ranch). Skip.
    return null;
  }

  const streetLine = [streetNumber, route].filter(Boolean).join(' ').trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  const address = streetLine
    ? `${streetLine}, ${cityState}${zip ? ' ' + zip : ''}`
    : `${cityState}${zip ? ' ' + zip : ''}` || null;

  // Title — prefer the slug-derived community name (more reliable than
  // the SEO <title> tag which is inconsistent across detail pages).
  const communityName = slugToTitle(slug);
  const title = communityName;

  // Description — meta description is the cleanest summary on these pages.
  const description = extractMetaDescription(html);

  // Thumbnail — first gallery image
  const thumbnailUrl = extractFirstGalleryImage(html);

  // Flyer / details link — point realtors to the community detail page.
  const flyerPdfUrl = `${GIDDENS_BASE_URL}/communities/${slug}/`;

  return {
    externalId: `giddens-community/${slug}`,
    builderName: 'Giddens Homes',
    title,
    city,
    state,
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
    flyerPdfUrl,
    address,
    readyDate: null,
    planName: null,
    communityName,
    homeType: 'community',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────

export async function fetchGiddensAustinCommunities(): Promise<{
  rows: ScrapedGiddensCommunityRow[];
  rawCount: number;
  skipped: number;
}> {
  let indexHtml: string;
  try {
    indexHtml = (await fetchHtml(INDEX_URL)).html;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Giddens communities index fetch failed: ${msg}`);
  }

  const slugs = extractCommunitySlugs(indexHtml);
  const rawCount = slugs.length;

  if (rawCount === 0) {
    throw new Error(
      'Giddens communities: no community slugs found (DOM structure may have changed)',
    );
  }

  const rows: ScrapedGiddensCommunityRow[] = [];
  // Track canonical slugs we've already accepted so that redirects (e.g.
  // /scofield-farms/ → /scofield-farms-estates/) don't produce duplicates.
  const seenSlugs = new Set<string>();
  let skipped = 0;

  // Fetch detail pages in small parallel batches to keep total time well
  // under the 60s cron budget.
  const BATCH = 4;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const chunk = slugs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(async (slug) => {
        const url = `${GIDDENS_BASE_URL}/communities/${slug}/`;
        const { html, finalUrl } = await fetchHtml(url);
        const canonical = slugFromUrl(finalUrl) || slug;
        return {
          requestedSlug: slug,
          canonicalSlug: canonical,
          row: parseDetailPage(canonical, html),
        };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (!r.value.row) {
          skipped++;
          continue;
        }
        if (seenSlugs.has(r.value.canonicalSlug)) {
          // Duplicate after redirect resolution (e.g. scofield-farms
          // → scofield-farms-estates). Skip silently.
          skipped++;
          continue;
        }
        seenSlugs.add(r.value.canonicalSlug);
        rows.push(r.value.row);
      } else {
        // Treat fetch/parse failures as skips rather than aborting the
        // whole run — one bad page shouldn't take out the others.
        skipped++;
        console.warn(
          '[giddens-communities] detail fetch failed:',
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        );
      }
    }
  }

  return { rows, rawCount, skipped };
}
