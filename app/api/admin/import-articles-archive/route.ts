/**
 * app/api/admin/import-articles-archive/route.ts
 *
 * One-shot importer for previously-published articles not yet in
 * wp_article_archive:
 *
 *   - 34 real San Antonio articles found in the 2026-09-21 WordPress export
 *     (newslinesanantonio.WordPress.2026-09-21.xml). The matching Austin
 *     export in that same upload turned out to be a media-library dump only
 *     (2,316 image attachments, zero post content), so nothing came from
 *     that file for Austin.
 *   - 89 Austin articles from an earlier-prepared dataset already sitting in
 *     the repo at data/imports/realtyline-articles-20260905.json (title,
 *     body, excerpt, author, avatar, tags, and images already resolved —
 *     25 of 89 have a featured image).
 *
 * Modes:
 *   GET  ?preview=1  → dry run, returns the article list without writing
 *   POST             → imports/upserts into wp_article_archive via
 *                       upsertImportedArticle (idempotent — re-running is
 *                       safe, matches on (publication, wp_post_id))
 *
 * Each row keeps its REAL WordPress numeric post id as wp_post_id (e.g.
 * "55" for San Antonio, "258" for Austin — publication prefix is added by
 * rowToArticle/transformPost elsewhere, so this route strips it if the
 * source dataset already included one), matching wp-news.ts's
 * transformPost id format exactly, so these rows will de-dupe cleanly
 * against the live upstream feed if a WordPress post is ever re-synced.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { upsertImportedArticle } from '@/lib/server/article-archive';
import type { Publication } from '@/lib/server/wp-news';
import sanAntonioArticles from './data/san-antonio-2025-articles.json';
import austinArticles from '@/data/imports/realtyline-articles-20260905.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type SaImportRow = {
  wpPostId: string;
  head: string;
  excerpt: string;
  contentHtml: string;
  imageUrl: string | null;
  authorName: string;
  cat: string;
  tags: string[];
  publishedAt: string;
  sourceUrl: string;
};

type AustinImportRow = {
  publication: 'austin';
  wpPostId: string; // already prefixed, e.g. "austin-258"
  head: string;
  excerpt: string;
  contentHtml: string;
  imageUrl: string | null;
  imageThumb: string | null;
  authorName: string;
  authorAvatar: string | null;
  cat: string;
  tags: string[];
  publishedAt: string;
  sourceUrl: string;
};

type NormalizedRow = {
  publication: Publication;
  wpPostId: string; // bare, no publication prefix
  head: string;
  excerpt: string;
  contentHtml: string;
  imageUrl: string | null;
  imageThumb: string | null;
  authorName: string;
  authorAvatar: string | null;
  cat: string;
  tags: string[];
  publishedAt: string;
  sourceUrl: string;
};

function stripPublicationPrefix(publication: Publication, wpPostId: string): string {
  const prefix = `${publication}-`;
  return wpPostId.startsWith(prefix) ? wpPostId.slice(prefix.length) : wpPostId;
}

const SA_ROWS: NormalizedRow[] = (sanAntonioArticles as SaImportRow[]).map((r) => ({
  publication: 'san_antonio',
  wpPostId: stripPublicationPrefix('san_antonio', r.wpPostId),
  head: r.head,
  excerpt: r.excerpt,
  contentHtml: r.contentHtml,
  imageUrl: r.imageUrl,
  imageThumb: r.imageUrl,
  authorName: r.authorName,
  authorAvatar: null,
  cat: r.cat,
  tags: r.tags,
  publishedAt: r.publishedAt,
  sourceUrl: r.sourceUrl,
}));

const AUSTIN_ROWS: NormalizedRow[] = (austinArticles as AustinImportRow[]).map((r) => ({
  publication: 'austin',
  wpPostId: stripPublicationPrefix('austin', r.wpPostId),
  head: r.head,
  excerpt: r.excerpt,
  contentHtml: r.contentHtml,
  imageUrl: r.imageUrl,
  imageThumb: r.imageThumb,
  authorName: r.authorName,
  authorAvatar: r.authorAvatar,
  cat: r.cat,
  tags: r.tags,
  publishedAt: r.publishedAt,
  sourceUrl: r.sourceUrl,
}));

const ROWS: NormalizedRow[] = [...AUSTIN_ROWS, ...SA_ROWS];

export async function GET(req: NextRequest) {
  await requireAdmin();
  const preview = req.nextUrl.searchParams.get('preview');
  if (!preview) {
    return NextResponse.json(
      { error: 'Pass ?preview=1 to see what would be imported, or POST to apply it.' },
      { status: 400 },
    );
  }
  return NextResponse.json({
    total: ROWS.length,
    austin: AUSTIN_ROWS.length,
    sanAntonio: SA_ROWS.length,
    withImage: ROWS.filter((r) => r.imageUrl).length,
    articles: ROWS.map((r) => ({
      publication: r.publication,
      wpPostId: r.wpPostId,
      head: r.head,
      cat: r.cat,
      publishedAt: r.publishedAt,
      hasImage: Boolean(r.imageUrl),
    })),
  });
}

export const POST = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();

  const publication = req.nextUrl.searchParams.get('publication');
  if (publication && publication !== 'austin' && publication !== 'san_antonio') {
    return NextResponse.json({ error: 'publication must be austin or san_antonio' }, { status: 400 });
  }
  const selectedRows = publication ? ROWS.filter((row) => row.publication === publication) : ROWS;
  let imported = 0;
  const errors: { publication: Publication; wpPostId: string; error: string }[] = [];

  for (const row of selectedRows) {
    try {
      await upsertImportedArticle({
        publication: row.publication,
        wpPostId: row.wpPostId,
        head: row.head,
        excerpt: row.excerpt,
        contentHtml: row.contentHtml,
        imageUrl: row.imageUrl,
        imageThumb: row.imageThumb,
        authorName: row.authorName,
        authorAvatar: row.authorAvatar,
        cat: row.cat,
        tags: row.tags,
        publishedAt: row.publishedAt,
        sourceUrl: row.sourceUrl,
      });
      imported += 1;
    } catch (err) {
      errors.push({
        publication: row.publication,
        wpPostId: row.wpPostId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  revalidateTag('wp-news', 'max');
  revalidateTag('wp-news:austin', 'max');
  revalidateTag('wp-news:san_antonio', 'max');

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    total: selectedRows.length,
    errors,
  });
});
