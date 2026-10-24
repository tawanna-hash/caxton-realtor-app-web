/**
 * /api/news/[publication]  GET
 *
 * Public read-only feed of WordPress articles for the requested publication.
 * Backed by unstable_cache (30 min) so we can take a WP outage gracefully.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getNews, type Publication, type NewsArticle } from '@/lib/server/wp-news';
import { listPinnedFeatureArticles } from '@/lib/feature-articles';

export const runtime = 'nodejs';

const VALID: Publication[] = ['austin', 'san_antonio'];

type Ctx = { params: Promise<{ publication: string }> };

export const GET = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const { publication } = await ctx.params;
  if (!VALID.includes(publication as Publication)) {
    throw new ApiError(400, 'Invalid publication. Must be "austin" or "san_antonio".');
  }

  let articles;
  try {
    articles = await getNews(publication as Publication);
  } catch {
    // unstable_cache will only throw if the underlying fetch fails and there
    // is no cached value yet — treat that as an upstream outage.
    return NextResponse.json(
      { publication, cacheStatus: 'empty', count: 0, articles: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ?fields=list drops the full article bodies (~80% of the payload). Feed
  // cards only need headline/summary/image; the article view fetches the
  // full payload when an article is opened.
  const listOnly = new URL(req.url).searchParams.get('fields') === 'list';
  const baseArticles = listOnly
    ? articles.map((a) => ({ ...a, contentHtml: '' }))
    : articles;

  // Featured partner articles are pinned to the top of each market's feed.
  let pinned: Array<NewsArticle & { pinned: true; featured: true }> = [];
  try {
    const feats = await listPinnedFeatureArticles(publication as Publication, 1);
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    pinned = feats.map((f) => {
      const summary = (f.excerpt || f.content || '').replace(/\s+/g, ' ').trim();
      const sum = summary.length > 240 ? `${summary.slice(0, 240).replace(/\s+\S*$/, '')}…` : summary;
      const link = f.articleUrl || `/partners/${f.advertiserSlug}#feature-articles`;
      const date = new Date(f.publishedAt);
      return {
        id: `feature-${f.id}`,
        publication: publication as Publication,
        cat: 'Featured',
        head: f.title,
        sum,
        link,
        publishedAt: f.publishedAt,
        imageUrl: f.imageUrl,
        time: Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
        contentHtml: listOnly || !f.content ? '' : f.content.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join(''),
        excerpt: sum,
        author: f.author ? { name: f.author, avatar: f.authorAvatar ?? undefined } : undefined,
        dateIso: f.publishedAt,
        tags: [f.advertiserName],
        pinned: true as const,
        featured: true as const,
      };
    });
  } catch {
    pinned = [];
  }
  const pinnedLinks = new Set(pinned.map((p) => p.link.toLowerCase()));
  const outArticles = [...pinned, ...baseArticles.filter((a) => !pinnedLinks.has((a.link || '').toLowerCase()))];

  return NextResponse.json(
    {
      publication,
      cacheStatus: 'fresh',
      count: outArticles.length,
      articles: outArticles,
    },
    {
      headers: {
        // The WordPress portion is already protected by unstable_cache in
        // getNews(). Admin overrides (featured images, headlines, body
        // edits, visibility) appearing within ~1 minute at the CDN edge is
        // an acceptable tradeoff for a short public cache.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
});
