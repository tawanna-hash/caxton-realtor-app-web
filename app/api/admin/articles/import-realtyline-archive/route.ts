import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import archiveData from '@/data/imports/realtyline-articles-20260905.json';
import { getPool } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface ImportArticle {
  publication: 'austin';
  wpPostId: string;
  slug: string;
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
  modifiedAt: string | null;
  sourceUrl: string | null;
}

const articles = archiveData as ImportArticle[];

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.BACKFILL_TOKEN;
  if (!expected) return false;
  const supplied =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-backfill-token');
  return supplied === expected;
}

function mediaUrls(article: ImportArticle): string[] {
  const urls = new Set<string>();
  if (article.imageUrl) urls.add(article.imageUrl);
  if (article.imageThumb) urls.add(article.imageThumb);
  for (const match of article.contentHtml.matchAll(
    /https?:\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi,
  )) {
    urls.add(match[0].replace(/&amp;/g, '&'));
  }
  return [...urls];
}

async function migrateMedia(url: string): Promise<string> {
  if (url.includes('.public.blob.vercel-storage.com/')) return url;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Media fetch failed (${response.status}): ${url}`);
  const pathname = new URL(url).pathname;
  const uploadPart = pathname.split('/wp-content/uploads/')[1];
  const filename = uploadPart || pathname.split('/').filter(Boolean).at(-1) || 'media';
  const blob = await put(`articles/austin/wordpress/${filename}`, await response.arrayBuffer(), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: response.headers.get('content-type') || undefined,
  });
  return blob.url;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    offset?: number;
    limit?: number;
  };
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const limit = Math.min(15, Math.max(1, Math.floor(Number(body.limit) || 10)));
  const batch = articles.slice(offset, offset + limit);
  const pool = getPool();
  const client = await pool.connect();
  const failures: Array<{ id: string; error: string }> = [];
  let imported = 0;
  let uploaded = 0;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS wp_article_archive (
        publication TEXT NOT NULL CHECK (publication IN ('austin', 'san_antonio')),
        wp_post_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        head TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        content_html TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        image_thumb TEXT,
        author_name TEXT NOT NULL DEFAULT 'Staff',
        author_avatar TEXT,
        cat TEXT NOT NULL,
        tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        published_at TIMESTAMPTZ NOT NULL,
        modified_at TIMESTAMPTZ,
        source_url TEXT,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (publication, wp_post_id),
        UNIQUE (publication, slug)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_wp_article_archive_publication_date
        ON wp_article_archive (publication, published_at DESC)
    `);

    for (const source of batch) {
      try {
        const article = { ...source };
        const replacements = new Map<string, string>();
        await Promise.all(
          mediaUrls(article).map(async (url) => {
            const migrated = await migrateMedia(url);
            replacements.set(url, migrated);
            uploaded += 1;
          }),
        );
        if (article.imageUrl) article.imageUrl = replacements.get(article.imageUrl) || article.imageUrl;
        if (article.imageThumb) {
          article.imageThumb = replacements.get(article.imageThumb) || article.imageThumb;
        }
        for (const [oldUrl, newUrl] of replacements) {
          article.contentHtml = article.contentHtml.split(oldUrl).join(newUrl);
        }

        await client.query(
          `INSERT INTO wp_article_archive
            (publication, wp_post_id, slug, head, excerpt, content_html,
             image_url, image_thumb, author_name, author_avatar, cat, tags,
             published_at, modified_at, source_url, imported_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
           ON CONFLICT (publication, wp_post_id) DO UPDATE SET
             slug = EXCLUDED.slug,
             head = EXCLUDED.head,
             excerpt = EXCLUDED.excerpt,
             content_html = EXCLUDED.content_html,
             image_url = EXCLUDED.image_url,
             image_thumb = EXCLUDED.image_thumb,
             author_name = EXCLUDED.author_name,
             author_avatar = EXCLUDED.author_avatar,
             cat = EXCLUDED.cat,
             tags = EXCLUDED.tags,
             published_at = EXCLUDED.published_at,
             modified_at = EXCLUDED.modified_at,
             source_url = EXCLUDED.source_url,
             updated_at = NOW()`,
          [
            article.publication,
            article.wpPostId,
            article.slug,
            article.head,
            article.excerpt,
            article.contentHtml,
            article.imageUrl,
            article.imageThumb,
            article.authorName,
            article.authorAvatar,
            article.cat,
            article.tags,
            article.publishedAt,
            article.modifiedAt,
            article.sourceUrl,
          ],
        );
        imported += 1;
      } catch (error) {
        failures.push({
          id: source.wpPostId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result = await client.query(
      `SELECT COUNT(*)::int AS count,
              COUNT(image_url)::int AS with_image,
              MIN(published_at) AS oldest,
              MAX(published_at) AS newest
         FROM wp_article_archive
        WHERE publication = 'austin'`,
    );

    return NextResponse.json({
      ok: failures.length === 0,
      offset,
      requested: batch.length,
      imported,
      uploaded,
      failures,
      nextOffset: offset + batch.length,
      complete: offset + batch.length >= articles.length,
      database: result.rows[0],
    });
  } finally {
    client.release();
  }
}

