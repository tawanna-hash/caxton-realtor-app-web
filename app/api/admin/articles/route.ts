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
import { createArchivedArticle } from '@/lib/server/article-archive';
import type { Publication } from '@/lib/server/wp-news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PUBS = new Set<Publication>(['austin', 'san_antonio']);

type CreateBody = {
  publication?: unknown;
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
  publication: Publication;
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

  if (typeof body.publication !== 'string' || !VALID_PUBS.has(body.publication as Publication)) {
    throw new ApiError(400, 'publication must be "austin" or "san_antonio"');
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
    publication: body.publication as Publication,
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

  const article = await createArchivedArticle({
    publication: parsed.publication,
    head: parsed.head,
    excerpt: parsed.excerpt,
    contentHtml: parsed.contentHtml,
    imageUrl: parsed.imageUrl,
    imageThumb: parsed.imageThumb,
    authorName: parsed.authorName,
    authorAvatar: parsed.authorAvatar,
    cat: parsed.cat,
    tags: parsed.tags,
    publishedAt: parsed.publishedAt,
  });

  invalidate(parsed.publication);

  return NextResponse.json({ article }, { status: 201 });
});
