// lib/scrapers/kb-home.ts
//
// Fetches KB Home Austin communities by enumerating their sitemap and then
// scraping each community page's HTML. Normalizes each into a shape our
// upsert function accepts.
//
// Source details (investigated Session 12):
//   Listing page (/new-homes-austin) is client-side rendered with Handlebars
//   — community cards are blank templates in the static HTML. We cannot
//   scrape the listing directly.
//
//   But: community detail pages (/new-homes-austin/{slug}) ARE server-rendered
//   with all the data we need embedded in <meta> tags, a dataLayer block, and
//   semantic CSS classes for prices. Sitemap.xml has the full list of community
//   slugs.
//
//   So the scraper does: sitemap → 12 community URLs → fetch each → cheerio
//   parse → normalize → return rows.
//
// Per-community fields:
//   dataLayer.page['community ID']   → externalId   (stable across URL changes)
//   dataLayer.page['community name'] → title
//   dataLayer.page['city']           → city
//   dataLayer.page['state']          → state ('TX')
//   <meta name="description">        → description (decoded, truncated)
//   <meta property="og:image">       → thumbnailUrl (absolute URL)
//   .price-item .price (all)         → priceMin / priceMax across plans
//
// Beds, baths, sqft are NOT exposed at the community-page level. They live on
// per-plan detail pages (/new-homes-austin/{slug}/plan-{id}). For now we set
// these null and let admins fill them in during review. Future enhancement:
// also fetch each plan page and derive min/max ranges per community.
//
// Why dataLayer over <h1>: KB's <h1> can include "A New Home Community by KB
// Home" suffix or "Sales Closed" prefix. dataLayer is the canonical value the
// page itself uses for analytics — cleaner.
//
// Error handling: per-community failures (404, parse miss, missing dataLayer)
// are logged and counted as skipped. A single bad community does NOT abort the
// run — KB has 12 communities and one transient failure shouldn't lose 11
// good rows. The sitemap fetch itself IS fatal — if we can't enumerate, we
// have nothing to do.

import * as cheerio from 'cheerio';

const SITEMAP_URL = 'https://www.kbhome.com/sitemap.xml';

// Matches <loc>https://www.kbhome.com/new-homes-austin/{slug}</loc> where
// {slug} is a single path component (no further slashes). Plan-detail URLs
// like /new-homes-austin/watermill-heritage-collection/plan-1361 are
// excluded because the </loc> would not come immediately after the slug.
const SITEMAP_COMMUNITY_RE =
  /<loc>\s*(https:\/\/www\.kbhome\.com\/new-homes-austin\/[a-z0-9-]+)\s*<\/loc>/g;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────
// Output shape — same as ScrapedMIHomesRow but builderName is 'KB Home'.
// ─────────────────────────────────────────────────────────────────────────

export type ScrapedKBHomeRow = {
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
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2014;/gi, '—')
    .replace(/&#x2013;/gi, '–')
    .replace(/&#x2019;/gi, "'")
    .replace(/&#x201C;/gi, '"')
    .replace(/&#x201D;/gi, '"')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/&reg;/gi, '®')
    .replace(/&copy;/gi, '©')
    .replace(/&trade;/gi, '™');
}

function truncateText(
  s: string | null | undefined,
  maxLen = 400,
): string | null {
  if (!s) return null;
  const decoded = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (decoded.length === 0) return null;
  if (decoded.length <= maxLen) return decoded;
  const cut = decoded.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

function parsePrice(s: string | null | undefined): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Matches: dataLayer.page['{key}'] = '...'; — with either quote style on
// both sides. Escapes regex metacharacters in {key} for safety.
function matchDataLayer(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    "dataLayer\\.page\\[['\"]" +
      escaped +
      "['\"]\\]\\s*=\\s*['\"]([^'\"]+)['\"]",
  );
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
  // Reset lastIndex defensively in case the module's regex was used previously.
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
): ScrapedKBHomeRow | null {
  const $ = cheerio.load(html);

  // External ID = KB's internal numeric community ID from dataLayer. More
  // stable than the URL slug; if KB renames a community URL, the ID stays.
  const externalId = matchDataLayer(html, 'community ID');
  if (!externalId) return null;

  const title = matchDataLayer(html, 'community name');
  if (!title) return null;

  const city = matchDataLayer(html, 'city') || 'Austin';
  const state = (matchDataLayer(html, 'state') || 'TX').toUpperCase();

  const description = truncateText(
    $('meta[name="description"]').attr('content'),
  );

  // og:image is absolute and uses ?preset=large. Some pages also have a
  // relative <meta itemprop="image"> later in <body>; we prefer the head
  // og:image since it's the hero used for sharing.
  const thumbnailUrl =
    $('meta[property="og:image"]').attr('content')?.trim() || null;

  // Each plan in a community renders as:
  //   <div class="price-item">
  //     <div>From <span class="price">$225,995</span></div>
  //   </div>
  // We collect every .price-item .price as a candidate "from" price across
  // plans, then take min/max. priceMax stays null when only one plan exists
  // (otherwise we'd be falsely advertising a range).
  const prices: number[] = [];
  $('.price-item .price').each((_, el) => {
    const n = parsePrice($(el).text());
    if (n !== null) prices.push(n);
  });
  const priceMin = prices.length > 0 ? Math.min(...prices) : null;
  const priceMax = prices.length > 1 ? Math.max(...prices) : null;

  return {
    externalId,
    builderName: 'KB Home',
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
    priceMin,
    priceMax,
    thumbnailUrl,
    flyerPdfUrl: url, // same hack as M/I: "View flyer" → community page URL
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public: fetch + normalize
// ─────────────────────────────────────────────────────────────────────────

export async function fetchKBHomesAustin(): Promise<{
  rows: ScrapedKBHomeRow[];
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
    // Sitemap returned successfully but had zero Austin community URLs. KB
    // may have restructured. Surface as an error so the cron run shows red.
    throw new Error(
      'KB Home sitemap returned zero Austin community URLs (URL pattern changed?)',
    );
  }

  const rows: ScrapedKBHomeRow[] = [];
  let skipped = 0;

  // Sequential fetches. 12 URLs at ~500ms each is ~6s — well under the cron
  // route's 60s maxDuration. Parallelizing would shave time but risks
  // tripping rate limits on KB's CDN. Not worth it for a once-daily job.
  for (const url of urls) {
    try {
      const html = await fetchUrl(url);
      const row = parseCommunityPage(html, url);
      if (row) {
        rows.push(row);
      } else {
        skipped++;
        console.warn(
          `[kb-home] skipped (missing dataLayer community ID or name): ${url}`,
        );
      }
    } catch (err) {
      skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[kb-home] fetch/parse failed for ${url}: ${msg}`);
    }
  }

  return { rows, rawCount, skipped };
}
