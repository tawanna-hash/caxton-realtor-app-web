// lib/feature-articles.ts
//
// Editorial feature articles tied to an advertiser. Admins write them in
// /admin/feature-articles and they render on the advertiser's public detail
// page beneath the event photo gallery.
//
// Schema:
//   feature_articles (
//     id            SERIAL PK,
//     advertiser_id INTEGER NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
//     title         TEXT NOT NULL,
//     excerpt       TEXT,
//     content       TEXT,            -- optional full article body (markdown)
//     image_url     TEXT,            -- optional hero image
//     article_url   TEXT,            -- optional external link (e.g., to WordPress)
//     author        TEXT,            -- optional author byline
//     published_at  DATE NOT NULL,
//     sort_order    INTEGER NOT NULL DEFAULT 0,
//     status        TEXT NOT NULL DEFAULT 'published',  -- 'published' | 'draft'
//     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   )

import { getSql } from '@/lib/db';

export type FeatureArticle = {
  id: number;
  advertiserId: number;
  title: string;
  excerpt: string | null;
  content: string | null;
  imageUrl: string | null;
  articleUrl: string | null;
  author: string | null;
  publishedAt: string;       // ISO date
  sortOrder: number;
  status: string;
  createdAt: string;
};

let schemaReady = false;

async function ensureFeatureArticlesSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS feature_articles (
      id            SERIAL PRIMARY KEY,
      advertiser_id INTEGER NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      excerpt       TEXT,
      content       TEXT,
      image_url     TEXT,
      article_url   TEXT,
      author        TEXT,
      published_at  DATE NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'published',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_feature_articles_advertiser ON feature_articles (advertiser_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_feature_articles_published ON feature_articles (published_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_feature_articles_status ON feature_articles (status)`;
  schemaReady = true;
}

type FeatureArticleRow = {
  id: number;
  advertiser_id: number;
  title: string;
  excerpt: string | null;
  content: string | null;
  image_url: string | null;
  article_url: string | null;
  author: string | null;
  published_at: string | Date;
  sort_order: number;
  status: string;
  created_at: string | Date;
};

function rowToArticle(r: FeatureArticleRow): FeatureArticle {
  // Neon hands back DATE/TIMESTAMPTZ columns as JS Date objects. Formatting
  // them here keeps callers free of timezone-shift bugs.
  const publishedAtRaw = r.published_at;
  const publishedAt = publishedAtRaw instanceof Date
    ? publishedAtRaw.toISOString().slice(0, 10)
    : String(publishedAtRaw).slice(0, 10);
  const createdAtRaw = r.created_at;
  const createdAt = createdAtRaw instanceof Date
    ? createdAtRaw.toISOString()
    : String(createdAtRaw);
  return {
    id: r.id,
    advertiserId: r.advertiser_id,
    title: r.title,
    excerpt: r.excerpt ?? null,
    content: r.content ?? null,
    imageUrl: r.image_url ?? null,
    articleUrl: r.article_url ?? null,
    author: r.author ?? null,
    publishedAt,
    sortOrder: r.sort_order ?? 0,
    status: r.status,
    createdAt,
  };
}

export async function listFeatureArticlesByAdvertiser(
  advertiserId: number,
): Promise<FeatureArticle[]> {
  await ensureFeatureArticlesSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM feature_articles
    WHERE advertiser_id = ${advertiserId}
      AND status = 'published'
    ORDER BY sort_order ASC, published_at DESC
  `) as unknown as FeatureArticleRow[];
  return rows.map(rowToArticle);
}

export async function listFeatureArticles(opts: {
  advertiserId?: number | null;
  limit?: number;
} = {}): Promise<FeatureArticle[]> {
  await ensureFeatureArticlesSchema();
  const sql = getSql();
  const advertiserId = opts.advertiserId ?? null;
  const limit = Math.min(opts.limit ?? 500, 2000);

  // Null-tolerant predicate keeps this to one query — Neon's tagged template
  // can't interpolate a dynamically built WHERE clause.
  const rows = (await sql`
    SELECT * FROM feature_articles
    WHERE (${advertiserId}::int IS NULL OR advertiser_id = ${advertiserId}::int)
    ORDER BY sort_order ASC, published_at DESC
    LIMIT ${limit}
  `) as unknown as FeatureArticleRow[];
  return rows.map(rowToArticle);
}

export async function createFeatureArticle(input: {
  advertiserId: number;
  title: string;
  excerpt?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  articleUrl?: string | null;
  author?: string | null;
  publishedAt: string;
  sortOrder?: number;
  status?: string;
}): Promise<FeatureArticle> {
  await ensureFeatureArticlesSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO feature_articles
      (advertiser_id, title, excerpt, content, image_url, article_url, author, published_at, sort_order, status)
    VALUES (${input.advertiserId}, ${input.title}, ${input.excerpt ?? null},
            ${input.content ?? null}, ${input.imageUrl ?? null}, ${input.articleUrl ?? null},
            ${input.author ?? null}, ${input.publishedAt}, ${input.sortOrder ?? 0},
            ${input.status ?? 'published'})
    RETURNING *
  `) as unknown as FeatureArticleRow[];
  return rowToArticle(rows[0]);
}

export async function updateFeatureArticle(id: number, fields: {
  advertiserId?: number;
  title?: string;
  excerpt?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  articleUrl?: string | null;
  author?: string | null;
  publishedAt?: string;
  sortOrder?: number;
  status?: string;
}): Promise<FeatureArticle | null> {
  await ensureFeatureArticlesSchema();
  const sql = getSql();

  const setAdvertiser = fields.advertiserId !== undefined;
  const setTitle = fields.title !== undefined;
  const setExcerpt = fields.excerpt !== undefined;
  const setContent = fields.content !== undefined;
  const setImage = fields.imageUrl !== undefined;
  const setArticleUrl = fields.articleUrl !== undefined;
  const setAuthor = fields.author !== undefined;
  const setPublishedAt = fields.publishedAt !== undefined;
  const setSortOrder = fields.sortOrder !== undefined;
  const setStatus = fields.status !== undefined;
  if (
    !setAdvertiser && !setTitle && !setExcerpt && !setContent && !setImage &&
    !setArticleUrl && !setAuthor && !setPublishedAt && !setSortOrder && !setStatus
  ) return null;

  // Neon's tagged template can't interpolate a dynamically built SET clause, so
  // every column is assigned unconditionally and a per-field flag decides
  // whether the new value or the existing one wins. A flag is needed rather
  // than COALESCE because the nullable text columns can be cleared to NULL
  // deliberately, which COALESCE would read as "not provided".
  const rows = (await sql`
    UPDATE feature_articles SET
      advertiser_id = CASE WHEN ${setAdvertiser}::boolean THEN ${fields.advertiserId ?? null}::int ELSE advertiser_id END,
      title         = CASE WHEN ${setTitle}::boolean THEN ${fields.title ?? null}::text ELSE title END,
      excerpt       = CASE WHEN ${setExcerpt}::boolean THEN ${fields.excerpt ?? null}::text ELSE excerpt END,
      content       = CASE WHEN ${setContent}::boolean THEN ${fields.content ?? null}::text ELSE content END,
      image_url     = CASE WHEN ${setImage}::boolean THEN ${fields.imageUrl ?? null}::text ELSE image_url END,
      article_url   = CASE WHEN ${setArticleUrl}::boolean THEN ${fields.articleUrl ?? null}::text ELSE article_url END,
      author        = CASE WHEN ${setAuthor}::boolean THEN ${fields.author ?? null}::text ELSE author END,
      published_at  = CASE WHEN ${setPublishedAt}::boolean THEN ${fields.publishedAt ?? null}::date ELSE published_at END,
      sort_order    = CASE WHEN ${setSortOrder}::boolean THEN ${fields.sortOrder ?? null}::int ELSE sort_order END,
      status        = CASE WHEN ${setStatus}::boolean THEN ${fields.status ?? null}::text ELSE status END
    WHERE id = ${id}
    RETURNING *
  `) as unknown as FeatureArticleRow[];
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}

export async function deleteFeatureArticle(id: number): Promise<boolean> {
  await ensureFeatureArticlesSchema();
  const sql = getSql();
  const rows = await sql`DELETE FROM feature_articles WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
