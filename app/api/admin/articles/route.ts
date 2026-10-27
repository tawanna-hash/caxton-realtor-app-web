/**
 * /api/admin/articles
 *
 *   POST — create a new article directly (no WordPress post backing it).
 *          Stored in `wp_article_archive` via createArchivedArticle, so it
 *          becomes a first-class article merged into the public feed
 *          alongside upstream WordPress and previously-imported content.
 *
 * There is no GET here — the admin Articles list is server-rendered by
 * app/admin/articles/page.tsx via getNewsRaw(), which already merges the
 * archive with (if reachable) upstream WordPress.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { createArchivedArticle, newArticleGroupId } from '@/lib/server/article-archive';
import type { Publication } from '@/lib/server/wp-news';
import { sanitizeArticleHtmlForStorage } from '@/lib/server/wp-news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PUBS = new Set<Publication>(['austin', 'san_antonio', 'houston', 'dallas']);

type CreateBody = {
  publication?: unknown;
  publications?: unknown;
  head?: unknown;
  excerpt?: unknown;
  contentHtml?: unknown;
  imageUrl?: unknown;
  imageThumb?: unknown;
  authorName?: unknown;
  authorAvatar?: unknown;
  cat?: unknown;
  tags?: unknown;
  publishedAt?: unknown;
};

function validateCreateBody(raw: unknown): {
  publications: Publication[];
  head: string;
  excerpt: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  imageThumb: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  cat: string | null;
  tags: string[] | null;
  publishedAt: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError(400, 'Body must be a JSON object');
  }
  const body = raw as CreateBody;

  const requested = Array.isArray(body.publications)
    ? body.publications
    : typeof body.publication === 'string' ? [body.publication] : [];
  const publications = [...new Set(requested)] as Publication[];
  if (publications.length === 0 || !publications.every((p) => typeof p === 'string' && VALID_PUBS.has(p))) {
    throw new ApiError(400, 'select at least one market: "austin", "san_antonio", "houston" or "dallas"');
  }
  if (typeof body.head !== 'string' || !body.head.trim()) {
    throw new ApiError(400, 'head (title) is required');
  }

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  let tags: string[] | null = null;
  if (Array.isArray(body.tags)) {
    const cleaned = body.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    tags = cleaned.length > 0 ? cleaned : null;
  }

  let publishedAt: string | null = null;
  if (typeof body.publishedAt === 'string' && body.publishedAt.trim()) {
    const parsed = new Date(body.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiError(400, 'publishedAt must be a valid date');
    }
    publishedAt = parsed.toISOString();
  }

  return {
    publications,
    head: body.head.trim(),
    excerpt: str(body.excerpt),
    contentHtml: str(body.contentHtml),
    imageUrl: str(body.imageUrl),
    imageThumb: str(body.imageThumb),
    authorName: str(body.authorName),
    authorAvatar: str(body.authorAvatar),
    cat: str(body.cat),
    tags,
    publishedAt,
  };
}

function invalidate(publication: Publication): void {
  revalidateTag('wp-news', 'max');
  revalidateTag(`wp-news:${publication}`, 'max');
}

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  const parsed = validateCreateBody(await req.json().catch(() => ({})));

  const groupId = parsed.publications.length > 1 ? newArticleGroupId() : null;
  const contentHtml = parsed.contentHtml ? await sanitizeArticleHtmlForStorage(parsed.contentHtml) : null;
  const articles = [];
  for (const publication of parsed.publications) {
    articles.push(await createArchivedArticle({
      publication,
      head: parsed.head,
      excerpt: parsed.excerpt,
      contentHtml,
      imageUrl: parsed.imageUrl,
      imageThumb: parsed.imageThumb,
      authorName: parsed.authorName,
      authorAvatar: parsed.authorAvatar,
      cat: parsed.cat,
      tags: parsed.tags,
      publishedAt: parsed.publishedAt,
      groupId,
    }));
    invalidate(publication);
  }

  return NextResponse.json({ article: articles[0], articles }, { status: 201 });
});
