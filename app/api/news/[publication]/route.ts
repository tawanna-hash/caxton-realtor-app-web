/**
 * /api/news/[publication]  GET
 *
 * Public read-only feed of WordPress articles for the requested publication.
 * Backed by unstable_cache (30 min) so we can take a WP outage gracefully.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getNews, type Publication } from '@/lib/server/wp-news';

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
  const outArticles = listOnly
    ? articles.map((a) => ({ ...a, contentHtml: '' }))
    : articles;

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
