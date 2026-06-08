/**
 * Fetches articles from the public WordPress REST API on each publication
 * (RealtyLine -> realtyline.us, Newsline SA -> newslinesa.com), maps WP
 * categories onto the in-app category names, and caches via Next's
 * unstable_cache (30 min, revalidate-on-demand).
 *
 * No auth required; both sites expose /wp-json/wp/v2/posts publicly.
 */

import { unstable_cache } from 'next/cache';
import { logger } from './logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Publication = 'austin' | 'san_antonio';

export interface NewsArticle {
  id: string;
  publication: Publication;
  cat: string;
  head: string;
  sum: string;
  link: string;
  publishedAt: string;
  imageUrl: string | null;
  time: string;
  contentHtml?: string;
  excerpt?: string;
  imageThumb?: string | null;
  author?: { name: string; avatar?: string };
  dateIso?: string;
  tags?: string[];
}

interface WpPost {
  id: number;
  date: string;
  modified: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  categories: number[];
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url?: string;
      alt_text?: string;
      media_details?: { sizes?: Record<string, { source_url?: string }> };
      code?: string;
    }>;
    author?: Array<{
      name?: string;
      avatar_urls?: Record<string, string>;
      code?: string;
    }>;
    'wp:term'?: Array<Array<{ taxonomy?: string; name?: string }>>;
  };
}

interface WpCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

interface PublicationConfig {
  baseUrl: string;
  slugToAppCategory: Record<string, string>;
  fallbackCategory: string;
}

// -----------------------------------------------------------------------------
// Publication config (slugs from production WP /categories endpoints).
// -----------------------------------------------------------------------------

const PUBS: Record<Publication, PublicationConfig> = {
  austin: {
    baseUrl: 'https://realtyline.us',
    slugToAppCategory: {
      'austin-board-of-realtors': 'ABoR',
      'five-points-realtors': 'Five Points',
      'womens-council-of-realtors': 'WCR Austin',
      'featured-advertiser': 'Featured Advertisers',
      'featured-advertisers': 'Featured Advertisers',
      'editors-choice': "Editor's Choice",
      'faces-of-real-estate': 'Faces of Real Estate',
    },
    fallbackCategory: "Editor's Choice",
  },
  san_antonio: {
    baseUrl: 'https://newslinesa.com',
    slugToAppCategory: {
      'san-antonio-board-of-realtors': 'SABOR',
      'greater-san-antonio-builders-association': 'GSABA',
      'womens-council-of-realtors': 'WCR San Antonio',
      residential: 'Residential',
      'featured-advertiser': 'Featured Advertisers',
      'featured-advertisers': 'Featured Advertisers',
      'editors-choice': "Editor's Choice",
      'faces-of-real-estate': 'Faces of Real Estate',
    },
    fallbackCategory: "Editor's Choice",
  },
};

const FETCH_TIMEOUT_MS = 8000;
const POSTS_PER_PAGE = 20;
const CACHE_REVALIDATE_S = 30 * 60; // 30 min

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&hellip;': '...',
  '&#8217;': '\u2019',
  '&#8216;': '\u2018',
  '&#8220;': '\u201c',
  '&#8221;': '\u201d',
  '&#8211;': '\u2013',
  '&#8212;': '\u2014',
  '&#8230;': '...',
};

function decodeEntities(s: string): string {
  return s.replace(/&[#\w]+;/g, (m) => HTML_ENTITIES[m] ?? m);
}

function stripHtml(html: string): string {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// BUG-08: WP feeds occasionally publish titles with the contraction "it's"
// where the possessive "its" was intended (e.g. "Propels ABoR Toward It's
// 100 Year"). Patch the most common possessive-misuse patterns when we read
// the title from the upstream feed. Conservative — only matches "It's" /
// "it's" before a noun-like token where the possessive is unambiguous.
function fixPossessiveTypos(title: string): string {
  if (!title) return title;
  // "It's <number> Year" / "It's <Capitalized noun>" patterns. Possessive
  // before "Year/Anniversary/Centennial" or a capitalized word is almost
  // always meant to be "Its".
  return title.replace(
    /\bIt['\u2019]s\b(?=\s+(?:\d+[-\s]?(?:Year|Years|Anniversary|Centennial|Birthday|Mile(?:stone)?)|(?:[A-Z][a-z]+)))/g,
    'Its',
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const ms = Date.now() - then;
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 30) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (day > 0) return `${day} day${day === 1 ? '' : 's'} ago`;
  if (hr > 0) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  if (min > 0) return `${min} minute${min === 1 ? '' : 's'} ago`;
  return 'just now';
}

function pickFeaturedImage(post: WpPost): string | null {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return null;
  const sizes = media.media_details?.sizes;
  if (sizes) {
    const candidate =
      sizes['medium_large']?.source_url ??
      sizes['large']?.source_url ??
      sizes['medium']?.source_url ??
      sizes['full']?.source_url;
    if (candidate) return candidate;
  }
  return media.source_url ?? null;
}

async function fetchCategoryMap(baseUrl: string): Promise<Map<number, string>> {
  const url = `${baseUrl}/wp-json/wp/v2/categories?per_page=100`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`WP categories fetch failed: ${res.status} ${res.statusText}`);
  }
  const cats = (await res.json()) as WpCategory[];
  const map = new Map<number, string>();
  for (const c of cats) {
    if (c && typeof c.id === 'number' && typeof c.slug === 'string') {
      map.set(c.id, c.slug);
    }
  }
  return map;
}

async function fetchPosts(baseUrl: string, perPage = POSTS_PER_PAGE): Promise<WpPost[]> {
  // newslinesa.com and realtyline.us are fronted by a CDN that caches the WP
  // REST API response keyed on URL. The canonical URL
  // `posts?per_page=20&_embed=1&orderby=date&order=desc` was returning a stale
  // body that didn't include articles published in the last few hours. We add
  // a cache-buster minute-bucket so each WP fetch hits origin but we don't
  // hammer their server on every request (one fresh fetch per minute is fine).
  const bucket = Math.floor(Date.now() / 60_000);
  const url =
    `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&_embed=1` +
    `&orderby=date&order=desc&_=${bucket}`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`WP posts fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as WpPost[];
}

function enrichFromEmbed(post: WpPost): Partial<NewsArticle> {
  const out: Partial<NewsArticle> = {};
  if (typeof post.date === 'string' && post.date) {
    out.dateIso = post.date;
  }

  const rawContent = post.content?.rendered;
  if (typeof rawContent === 'string') out.contentHtml = rawContent;

  const rawExcerpt = post.excerpt?.rendered;
  if (typeof rawExcerpt === 'string' && rawExcerpt.trim()) {
    out.excerpt = rawExcerpt
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#038;/g, '&')
      .replace(/&#8217;/g, '\u2019')
      .replace(/&#8211;/g, '\u2013')
      .replace(/&#8212;/g, '\u2014')
      .replace(/&hellip;/g, '\u2026')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  const embedded = post._embedded || {};

  const mediaArr = embedded['wp:featuredmedia'];
  const media = Array.isArray(mediaArr) ? mediaArr[0] : null;
  if (media && !media.code) {
    const sizes = media.media_details?.sizes || {};
    out.imageUrl =
      sizes['large']?.source_url ??
      sizes['full']?.source_url ??
      media.source_url ??
      null;
    out.imageThumb =
      sizes['medium']?.source_url ??
      sizes['thumbnail']?.source_url ??
      out.imageUrl ??
      null;
  }

  const authArr = embedded.author;
  const auth = Array.isArray(authArr) ? authArr[0] : null;
  if (auth && !auth.code) {
    const avatars = auth.avatar_urls || {};
    const rawAvatar = avatars['96'] || avatars['48'] || avatars['24'];
    // Gravatar serves a gray "Mystery Person" silhouette when the author email
    // has no registered Gravatar (d=mm | d=mystery | d=mp | d=blank). Rewrite
    // those defaults to d=404 so missing avatars return HTTP 404 instead of a
    // placeholder image — the renderer can then onerror-hide the broken <img>.
    // Also bump Gravatar size param to 192 so larger avatars render crisply
    // on retina (we display at 64px CSS / 96px intrinsic, 2x for retina).
    const avatar = rawAvatar
      ? rawAvatar
          .replace(/([?&])d=(mm|mp|mystery|blank|identicon|monsterid|wavatar|retro|robohash)\b/gi, '$1d=404')
          .replace(/([?&])s=\d+/gi, '$1s=192')
      : null;
    out.author = avatar
      ? { name: auth.name || 'Staff', avatar }
      : { name: auth.name || 'Staff' };
  }

  const termsGroups = embedded['wp:term'];
  if (Array.isArray(termsGroups)) {
    const tagNames: string[] = [];
    for (const group of termsGroups) {
      if (!Array.isArray(group)) continue;
      for (const term of group) {
        if (term && term.taxonomy === 'post_tag' && typeof term.name === 'string') {
          tagNames.push(term.name);
        }
      }
    }
    if (tagNames.length > 0) out.tags = tagNames;
  }

  return out;
}

function transformPost(
  post: WpPost,
  publication: Publication,
  categoryIdToSlug: Map<number, string>,
  cfg: PublicationConfig,
): NewsArticle {
  let appCat = cfg.fallbackCategory;
  for (const catId of post.categories || []) {
    const slug = categoryIdToSlug.get(catId);
    if (!slug) continue;
    if (slug === 'uncategorized') continue;
    const mapped = cfg.slugToAppCategory[slug];
    if (mapped) {
      appCat = mapped;
      break;
    }
  }

  const headline = fixPossessiveTypos(stripHtml(post.title?.rendered || ''));
  const summary = stripHtml(post.excerpt?.rendered || '').slice(0, 240);

  return {
    id: `${publication}-${post.id}`,
    publication,
    cat: appCat,
    head: headline,
    sum: summary,
    link: post.link,
    publishedAt: post.date,
    imageUrl: pickFeaturedImage(post),
    time: formatRelativeTime(post.date),
    ...enrichFromEmbed(post),
  };
}

// -----------------------------------------------------------------------------
// Public API — wrapped in unstable_cache for 30-minute revalidate
// -----------------------------------------------------------------------------

async function fetchNewsArticles(publication: Publication): Promise<NewsArticle[]> {
  const cfg = PUBS[publication];
  const [categoryMap, posts] = await Promise.all([
    fetchCategoryMap(cfg.baseUrl),
    fetchPosts(cfg.baseUrl, POSTS_PER_PAGE),
  ]);

  const articles: NewsArticle[] = [];
  for (const p of posts) {
    try {
      articles.push(transformPost(p, publication, categoryMap, cfg));
    } catch (err) {
      logger.warn({ err, postId: p?.id, publication }, 'Failed to transform WP post');
    }
  }

  logger.info({ publication, count: articles.length }, 'WP news refreshed');
  return articles;
}

const cachedAustin = unstable_cache(() => fetchNewsArticles('austin'), ['wp-news', 'austin'], {
  revalidate: CACHE_REVALIDATE_S,
  tags: ['wp-news', 'wp-news:austin'],
});

const cachedSanAntonio = unstable_cache(
  () => fetchNewsArticles('san_antonio'),
  ['wp-news', 'san_antonio'],
  { revalidate: CACHE_REVALIDATE_S, tags: ['wp-news', 'wp-news:san_antonio'] },
);

/**
 * Internal: returns the upstream-only article list.
 *
 * Admin uses this directly and we deliberately BYPASS unstable_cache so the
 * admin Articles page always reflects the true current state of WordPress.
 * (Next 16 deprecated unstable_cache and revalidateTag(tag, 'max') now uses
 * stale-while-revalidate, so the prior "sync revalidates, page re-renders"
 * flow returned stale data on the immediate next read. Admin is low traffic
 * — paying the WP roundtrip on every load is fine and is the most reliable
 * way to guarantee correctness.)
 *
 * Public callers should keep using getNews() which still goes through the
 * 30-minute cache.
 */
export async function getNewsRaw(publication: Publication): Promise<NewsArticle[]> {
  return fetchNewsArticles(publication);
}

/** Public-cached variant used by the public feed (kept on unstable_cache). */
async function getNewsCached(publication: Publication): Promise<NewsArticle[]> {
  return publication === 'austin' ? cachedAustin() : cachedSanAntonio();
}

export async function getNews(publication: Publication): Promise<NewsArticle[]> {
  const upstream = await getNewsCached(publication);

  // Apply admin overrides on top of upstream. Overrides are NOT inside the
  // unstable_cache wrapper above, so edits take effect immediately without
  // needing a Sync. Failures must not break the public feed.
  try {
    const { getAllOverridesForPublication, applyOverride } = await import('./article-overrides');
    const overrides = await getAllOverridesForPublication(publication);
    if (overrides.size === 0) return upstream;
    const merged = upstream.map((a) => applyOverride(a, overrides.get(a.id)));
    // Filter out hidden articles for public consumers.
    return merged.filter((a) => !(a as { hidden?: boolean }).hidden);
  } catch (err) {
    logger.warn({ err, publication }, 'Article overrides merge failed; serving upstream');
    return upstream;
  }
}
