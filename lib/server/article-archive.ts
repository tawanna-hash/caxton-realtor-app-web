import { getSql } from '@/lib/db';
import type { NewsArticle, Publication } from './wp-news';
import { authorPortrait, canonicalAuthorName } from '@/lib/article-author-profiles';

// HTTP queries work in serverless functions without a WebSocket-based Pool.
async function query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  return await getSql().query(text, values) as T[];
}

interface ArchivedArticleRow {
  publication: Publication;
  wp_post_id: string;
  head: string;
  excerpt: string;
  content_html: string;
  image_url: string | null;
  image_thumb: string | null;
  author_name: string;
  author_avatar: string | null;
  cat: string;
  tags: string[] | null;
  published_at: string | Date;
  source_url: string | null;
}

// Manually-created articles (no WordPress post backing them) get a
// `wp_post_id` of `${publication}-manual-<timestamp>-<rand>` — matching the
// FULL article id convention this table already uses (rowToArticle sets
// `id: row.wp_post_id` directly, exactly like article-overrides.ts's
// documented "we store the FULL article id as wp_post_id" convention). The
// `manual-` marker (inserted right after the publication prefix) lets
// downstream code (admin edit/delete) tell these apart from real WP-sourced
// ids without an extra DB column.
const MANUAL_MARKER = 'manual-';

// `id` here is the FULL article id, e.g. "austin-manual-171234-abcd" or
// "austin-12345" for a real WP post.
export function isManualArticleId(id: string): boolean {
  return id.includes(`-${MANUAL_MARKER}`);
}

function generateManualWpPostId(publication: Publication): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${publication}-${MANUAL_MARKER}${Date.now()}-${rand}`;
}

let schemaEnsured = false;

/**
 * `wp_article_archive` predates this file having a write path — it was
 * created ad hoc alongside the read-only `getArchivedArticles` query. This
 * ensures it exists (idempotent) before any insert/update/delete, mirroring
 * the `ensureXSchema()` pattern used by feature-articles.ts and
 * article-overrides.ts.
 */
async function ensureArticleArchiveSchema(): Promise<void> {
  if (schemaEnsured) return;
  // Table may already exist in production (created ad hoc before this file
  // had a write path). CREATE TABLE IF NOT EXISTS won't retroactively add a
  // PK or columns to an existing table, so new columns are added defensively
  // via ALTER ... ADD COLUMN IF NOT EXISTS instead of assumed present.
  await query(`
    CREATE TABLE IF NOT EXISTS wp_article_archive (
      publication   TEXT NOT NULL,
      wp_post_id    TEXT NOT NULL,
      slug          TEXT NOT NULL,
      head          TEXT NOT NULL,
      excerpt       TEXT NOT NULL DEFAULT '',
      content_html  TEXT NOT NULL DEFAULT '',
      image_url     TEXT,
      image_thumb   TEXT,
      author_name   TEXT NOT NULL DEFAULT 'Staff',
      author_avatar TEXT,
      cat           TEXT NOT NULL DEFAULT '',
      tags          TEXT[],
      published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_url    TEXT
    )
  `);
  await query(`ALTER TABLE wp_article_archive ADD COLUMN IF NOT EXISTS slug TEXT`);
  await query(`ALTER TABLE wp_article_archive ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`ALTER TABLE wp_article_archive ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_wp_article_archive_published ON wp_article_archive (published_at DESC)`,
  );
  // Unique index (not a hard PK) so an existing table without a PK doesn't
  // fail this migration, while still preventing duplicate (publication,
  // wp_post_id) rows going forward — required for our ON CONFLICT upsert.
  // Wrapped in try/catch: if production already has duplicate
  // (publication, wp_post_id) rows from before this constraint existed,
  // creating the index would throw and — since this same call gates every
  // read via getArchivedArticles — take down the whole articles feed. A
  // failure here just means ON CONFLICT upsert isn't available yet; reads
  // and plain inserts still work.
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_article_archive_pub_post ON wp_article_archive (publication, wp_post_id)`,
    );
  } catch (err) {
    console.warn(
      '[article-archive] could not create unique index on (publication, wp_post_id) — likely duplicate rows already exist. ON CONFLICT upserts will fail until this is cleaned up:',
      err,
    );
  }
  schemaEnsured = true;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const ms = Date.now() - then;
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
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

function rowToArticle(row: ArchivedArticleRow): NewsArticle {
  const publishedAt = new Date(row.published_at).toISOString();
  const authorName = canonicalAuthorName(row.author_name || 'Staff', row.publication);
  const authorAvatar = authorPortrait(authorName, row.author_avatar);
  return {
    id: row.wp_post_id,
    publication: row.publication,
    cat: row.cat,
    head: row.head,
    sum: row.excerpt.slice(0, 240),
    excerpt: row.excerpt,
    contentHtml: row.content_html,
    link: row.source_url || `https://realtynewsnow.app/?article=${encodeURIComponent(row.wp_post_id)}`,
    publishedAt,
    dateIso: publishedAt,
    imageUrl: row.image_url,
    imageThumb: row.image_thumb || row.image_url,
    time: formatRelativeTime(publishedAt),
    author: authorAvatar
      ? { name: authorName, avatar: authorAvatar }
      : { name: authorName },
    tags: row.tags ?? [],
  };
}

export async function getArchivedArticles(publication: Publication): Promise<NewsArticle[]> {
  await ensureArticleArchiveSchema();
  const rows = await query<ArchivedArticleRow>(
    `SELECT publication, wp_post_id, head, excerpt, content_html,
            image_url, image_thumb, author_name, author_avatar, cat, tags,
            published_at, source_url
       FROM wp_article_archive
      WHERE publication = $1
      ORDER BY published_at DESC`,
    [publication],
  );
  return rows.map(rowToArticle);
}

export function mergeArchivedAndUpstream(
  archived: NewsArticle[],
  upstream: NewsArticle[],
): NewsArticle[] {
  const byId = new Map<string, NewsArticle>();

  // The imported archive is the durable source of truth for an existing ID.
  // Upstream contributes newly published IDs until WordPress is retired.
  for (const article of upstream) byId.set(article.id, article);
  for (const article of archived) byId.set(article.id, article);

  return Array.from(byId.values()).sort((a, b) => {
    const aDate = Date.parse(a.dateIso || a.publishedAt);
    const bDate = Date.parse(b.dateIso || b.publishedAt);
    return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
  });
}

// -----------------------------------------------------------------------------
// Write path — manual article creation, editing, and deletion. These are the
// app's own first-class articles, independent of WordPress. Real WP-sourced
// rows can also live here (via XML import) but are only ever written by the
// one-off import script, never by the admin UI.
// -----------------------------------------------------------------------------

export interface CreateArchivedArticleInput {
  publication: Publication;
  head: string;
  excerpt?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  imageThumb?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  cat?: string | null;
  tags?: string[] | null;
  publishedAt?: string | null; // ISO date/datetime; defaults to now
  sourceUrl?: string | null;
}

export async function createArchivedArticle(
  input: CreateArchivedArticleInput,
): Promise<NewsArticle> {
  await ensureArticleArchiveSchema();
  const wpPostId = generateManualWpPostId(input.publication);
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
  const rows = await query<ArchivedArticleRow>(
    `INSERT INTO wp_article_archive
       (publication, wp_post_id, slug, head, excerpt, content_html, image_url,
        image_thumb, author_name, author_avatar, cat, tags, published_at,
        source_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
     RETURNING publication, wp_post_id, head, excerpt, content_html, image_url,
               image_thumb, author_name, author_avatar, cat, tags, published_at,
               source_url`,
    [
      input.publication,
      wpPostId,
      `${input.head.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'article'}-${wpPostId.split('-').slice(-2).join('-')}`,
      input.head,
      input.excerpt ?? '',
      input.contentHtml ?? '',
      input.imageUrl ?? null,
      input.imageThumb ?? input.imageUrl ?? null,
      input.authorName ?? 'Staff',
      input.authorAvatar ?? null,
      input.cat ?? '',
      input.tags ?? [],
      publishedAt.toISOString(),
      input.sourceUrl ?? null,
    ],
  );
  return rowToArticle(rows[0]);
}

export interface UpdateArchivedArticleInput {
  head?: string | null;
  excerpt?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  imageThumb?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  cat?: string | null;
  tags?: string[] | null;
  publishedAt?: string | null;
}

export async function updateArchivedArticle(
  publication: Publication,
  wpPostId: string,
  fields: UpdateArchivedArticleInput,
): Promise<NewsArticle | null> {
  await ensureArticleArchiveSchema();

  const setHead = fields.head !== undefined;
  const setExcerpt = fields.excerpt !== undefined;
  const setContent = fields.contentHtml !== undefined;
  const setImage = fields.imageUrl !== undefined;
  const setThumb = fields.imageThumb !== undefined;
  const setAuthorName = fields.authorName !== undefined;
  const setAuthorAvatar = fields.authorAvatar !== undefined;
  const setCat = fields.cat !== undefined;
  const setTags = fields.tags !== undefined;
  const setPublishedAt = fields.publishedAt !== undefined;

  const rows = await query<ArchivedArticleRow>(
    `UPDATE wp_article_archive SET
       head          = CASE WHEN $3 THEN $4 ELSE head END,
       excerpt       = CASE WHEN $5 THEN $6 ELSE excerpt END,
       content_html  = CASE WHEN $7 THEN $8 ELSE content_html END,
       image_url     = CASE WHEN $9 THEN $10 ELSE image_url END,
       image_thumb   = CASE WHEN $11 THEN $12 ELSE image_thumb END,
       author_name   = CASE WHEN $13 THEN $14 ELSE author_name END,
       author_avatar = CASE WHEN $15 THEN $16 ELSE author_avatar END,
       cat           = CASE WHEN $17 THEN $18 ELSE cat END,
       tags          = CASE WHEN $19 THEN $20::text[] ELSE tags END,
       published_at  = CASE WHEN $21 THEN $22::timestamptz ELSE published_at END,
       updated_at    = NOW()
     WHERE publication = $1 AND wp_post_id = $2
     RETURNING publication, wp_post_id, head, excerpt, content_html, image_url,
               image_thumb, author_name, author_avatar, cat, tags, published_at,
               source_url`,
    [
      publication,
      wpPostId,
      setHead, fields.head ?? null,
      setExcerpt, fields.excerpt ?? null,
      setContent, fields.contentHtml ?? null,
      setImage, fields.imageUrl ?? null,
      setThumb, fields.imageThumb ?? null,
      setAuthorName, fields.authorName ?? null,
      setAuthorAvatar, fields.authorAvatar ?? null,
      setCat, fields.cat ?? null,
      setTags, fields.tags ?? [],
      setPublishedAt, fields.publishedAt ?? null,
    ],
  );
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}

export async function deleteArchivedArticle(
  publication: Publication,
  wpPostId: string,
): Promise<boolean> {
  await ensureArticleArchiveSchema();
  const rows = await query<{ wp_post_id: string }>(
    `DELETE FROM wp_article_archive WHERE publication = $1 AND wp_post_id = $2 RETURNING wp_post_id`,
    [publication, wpPostId],
  );
  return rows.length > 0;
}

export async function getArchivedArticleByPostId(
  publication: Publication,
  wpPostId: string,
): Promise<NewsArticle | null> {
  await ensureArticleArchiveSchema();
  const rows = await query<ArchivedArticleRow>(
    `SELECT publication, wp_post_id, head, excerpt, content_html,
            image_url, image_thumb, author_name, author_avatar, cat, tags,
            published_at, source_url
       FROM wp_article_archive
      WHERE publication = $1 AND wp_post_id = $2`,
    [publication, wpPostId],
  );
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}


// -----------------------------------------------------------------------------
// One-time WordPress XML import — used only by the import script, never by
// the admin UI. Unlike createArchivedArticle (which always mints a fresh
// `manual-` id), this keeps the REAL WordPress numeric post id so the row's
// `wp_post_id` matches transformPost's `${publication}-${post.id}` format
// exactly (e.g. "san_antonio-55") — meaning it will de-dupe cleanly against
// the live upstream feed if/when that WP post is ever re-synced. Idempotent:
// re-running the import script upserts on (publication, wp_post_id) instead
// of creating duplicate rows.
// -----------------------------------------------------------------------------

export interface ImportedArticleInput {
  publication: Publication;
  wpPostId: string; // real WordPress numeric post id, as a string
  head: string;
  excerpt?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  imageThumb?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  cat?: string | null;
  tags?: string[] | null;
  publishedAt: string; // ISO date/datetime — required, from the WP export
  sourceUrl?: string | null;
}

export async function upsertImportedArticle(
  input: ImportedArticleInput,
): Promise<NewsArticle> {
  await ensureArticleArchiveSchema();
  const slug = `${input.publication}-${input.head.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'article'}-${input.wpPostId}`;
  const rows = await query<ArchivedArticleRow>(
    `INSERT INTO wp_article_archive
       (publication, wp_post_id, slug, head, excerpt, content_html, image_url,
        image_thumb, author_name, author_avatar, cat, tags, published_at,
        source_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
     ON CONFLICT (publication, wp_post_id) DO UPDATE SET
        head          = EXCLUDED.head,
        excerpt       = EXCLUDED.excerpt,
        content_html  = EXCLUDED.content_html,
        image_url     = EXCLUDED.image_url,
        image_thumb   = EXCLUDED.image_thumb,
        author_name   = EXCLUDED.author_name,
        author_avatar = EXCLUDED.author_avatar,
        cat           = EXCLUDED.cat,
        tags          = EXCLUDED.tags,
        published_at  = EXCLUDED.published_at,
        source_url    = EXCLUDED.source_url,
        updated_at    = NOW()
     RETURNING publication, wp_post_id, head, excerpt, content_html, image_url,
               image_thumb, author_name, author_avatar, cat, tags, published_at,
               source_url`,
    [
      input.publication,
      input.wpPostId,
      slug,
      input.head,
      input.excerpt ?? '',
      input.contentHtml ?? '',
      input.imageUrl ?? null,
      input.imageThumb ?? input.imageUrl ?? null,
      input.authorName ?? 'Staff',
      input.authorAvatar ?? null,
      input.cat ?? '',
      input.tags ?? [],
      new Date(input.publishedAt).toISOString(),
      input.sourceUrl ?? null,
    ],
  );
  return rowToArticle(rows[0]);
}
