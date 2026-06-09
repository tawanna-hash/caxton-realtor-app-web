/**
 * Local admin overrides for WordPress-pulled articles.
 *
 * Articles originate from realtyline.us and newslinesa.com via the WP REST
 * API. We never write back to WP. Instead, admin edits are stored in our
 * Neon DB keyed by (publication, wp_post_id) and merged into the article
 * payload at render time.
 *
 * Mirrors the events `edited_fields` / `edited_by` audit pattern so we can
 * tell which fields are overridden vs. which still mirror upstream.
 */

import { getSql } from '@/lib/db';
import type { NewsArticle, Publication } from './wp-news';

export interface ArticleOverride {
  publication: Publication;
  wpPostId: string; // article.id from wp-news transformPost
  head: string | null;
  excerpt: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  cat: string | null;
  tags: string[] | null;
  hidden: boolean;
  editedFields: string[];
  editedBy: string | null;
  editedAt: string | null;
}

export type OverrideField =
  | 'head'
  | 'excerpt'
  | 'contentHtml'
  | 'imageUrl'
  | 'authorName'
  | 'authorAvatar'
  | 'cat'
  | 'tags'
  | 'hidden';

let schemaEnsured = false;

export async function ensureArticleOverridesSchema(): Promise<void> {
  if (schemaEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS wp_article_overrides (
      publication TEXT NOT NULL,
      wp_post_id  TEXT NOT NULL,
      head        TEXT,
      excerpt     TEXT,
      content_html TEXT,
      image_url   TEXT,
      author_name TEXT,
      author_avatar TEXT,
      cat         TEXT,
      tags        TEXT[],
      hidden      BOOLEAN NOT NULL DEFAULT FALSE,
      edited_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      edited_by   TEXT,
      edited_at   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (publication, wp_post_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_wp_article_overrides_pub ON wp_article_overrides(publication)`;
  schemaEnsured = true;
}

interface OverrideRow {
  publication: string;
  wp_post_id: string;
  head: string | null;
  excerpt: string | null;
  content_html: string | null;
  image_url: string | null;
  author_name: string | null;
  author_avatar: string | null;
  cat: string | null;
  tags: string[] | null;
  hidden: boolean;
  edited_fields: string[] | null;
  edited_by: string | null;
  edited_at: string | null;
}

function rowToOverride(r: OverrideRow): ArticleOverride {
  return {
    publication: r.publication as Publication,
    wpPostId: r.wp_post_id,
    head: r.head,
    excerpt: r.excerpt,
    contentHtml: r.content_html,
    imageUrl: r.image_url,
    authorName: r.author_name,
    authorAvatar: r.author_avatar,
    cat: r.cat,
    tags: r.tags,
    hidden: r.hidden,
    editedFields: r.edited_fields ?? [],
    editedBy: r.edited_by,
    editedAt: r.edited_at,
  };
}

/** Fetch one override by composite key, or null. */
export async function getArticleOverride(
  publication: Publication,
  wpPostId: string,
): Promise<ArticleOverride | null> {
  await ensureArticleOverridesSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM wp_article_overrides
    WHERE publication = ${publication} AND wp_post_id = ${wpPostId}
    LIMIT 1
  `) as unknown as OverrideRow[];
  return rows[0] ? rowToOverride(rows[0]) : null;
}

/**
 * Fetch all overrides for a publication. Returned as a Map keyed by
 * wpPostId for O(1) lookup during transformPost merge.
 */
export async function getAllOverridesForPublication(
  publication: Publication,
): Promise<Map<string, ArticleOverride>> {
  await ensureArticleOverridesSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM wp_article_overrides WHERE publication = ${publication}
  `) as unknown as OverrideRow[];
  const map = new Map<string, ArticleOverride>();
  for (const r of rows) {
    map.set(r.wp_post_id, rowToOverride(r));
  }
  return map;
}

export interface UpsertArticleOverrideInput {
  publication: Publication;
  wpPostId: string;
  // Each undefined = leave alone; each null = clear; string/array = set.
  head?: string | null;
  excerpt?: string | null;
  contentHtml?: string | null;
  imageUrl?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  cat?: string | null;
  tags?: string[] | null;
  hidden?: boolean;
  editedBy: string;
}

/**
 * Upsert override row. Only the fields explicitly provided (not undefined)
 * are written, and only those fields are added to edited_fields so the UI
 * can show which fields diverge from upstream.
 */
export async function upsertArticleOverride(
  input: UpsertArticleOverrideInput,
): Promise<ArticleOverride> {
  await ensureArticleOverridesSchema();

  const newlyEdited: OverrideField[] = [];
  const fieldDefs: Array<{ key: OverrideField; column: string; value: unknown }> = [
    { key: 'head',         column: 'head',          value: input.head },
    { key: 'excerpt',      column: 'excerpt',       value: input.excerpt },
    { key: 'contentHtml',  column: 'content_html',  value: input.contentHtml },
    { key: 'imageUrl',     column: 'image_url',     value: input.imageUrl },
    { key: 'authorName',   column: 'author_name',   value: input.authorName },
    { key: 'authorAvatar', column: 'author_avatar', value: input.authorAvatar },
    { key: 'cat',          column: 'cat',           value: input.cat },
    { key: 'tags',         column: 'tags',          value: input.tags },
    { key: 'hidden',       column: 'hidden',        value: input.hidden },
  ];
  for (const d of fieldDefs) {
    if (d.value !== undefined) newlyEdited.push(d.key);
  }

  // We can't use the tagged-template sql for a dynamic SET clause cleanly,
  // so use the pool-style query for the UPSERT.
  const { query } = await import('./db/neon');

  // Build INSERT column list (always include all columns; missing fields
  // get null / default).
  const fetchExisting = await query<OverrideRow>(
    `SELECT * FROM wp_article_overrides WHERE publication = $1 AND wp_post_id = $2`,
    [input.publication, input.wpPostId],
  );
  const existing = fetchExisting[0];

  const final = {
    head:          input.head !== undefined          ? input.head          : existing?.head ?? null,
    excerpt:       input.excerpt !== undefined       ? input.excerpt       : existing?.excerpt ?? null,
    content_html:  input.contentHtml !== undefined   ? input.contentHtml   : existing?.content_html ?? null,
    image_url:     input.imageUrl !== undefined      ? input.imageUrl      : existing?.image_url ?? null,
    author_name:   input.authorName !== undefined    ? input.authorName    : existing?.author_name ?? null,
    author_avatar: input.authorAvatar !== undefined  ? input.authorAvatar  : existing?.author_avatar ?? null,
    cat:           input.cat !== undefined           ? input.cat           : existing?.cat ?? null,
    tags:          input.tags !== undefined          ? input.tags          : existing?.tags ?? null,
    hidden:        input.hidden !== undefined        ? input.hidden        : existing?.hidden ?? false,
  };

  // Merge edited_fields uniquely.
  const prevEdited = new Set<string>(existing?.edited_fields ?? []);
  for (const f of newlyEdited) prevEdited.add(f);
  const mergedEditedFields = Array.from(prevEdited);

  const rows = await query<OverrideRow>(
    `INSERT INTO wp_article_overrides
       (publication, wp_post_id, head, excerpt, content_html, image_url,
        author_name, author_avatar, cat, tags, hidden,
        edited_fields, edited_by, edited_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     ON CONFLICT (publication, wp_post_id) DO UPDATE SET
       head = EXCLUDED.head,
       excerpt = EXCLUDED.excerpt,
       content_html = EXCLUDED.content_html,
       image_url = EXCLUDED.image_url,
       author_name = EXCLUDED.author_name,
       author_avatar = EXCLUDED.author_avatar,
       cat = EXCLUDED.cat,
       tags = EXCLUDED.tags,
       hidden = EXCLUDED.hidden,
       edited_fields = EXCLUDED.edited_fields,
       edited_by = EXCLUDED.edited_by,
       edited_at = NOW()
     RETURNING *`,
    [
      input.publication,
      input.wpPostId,
      final.head,
      final.excerpt,
      final.content_html,
      final.image_url,
      final.author_name,
      final.author_avatar,
      final.cat,
      final.tags,
      final.hidden,
      mergedEditedFields,
      input.editedBy,
    ],
  );

  return rowToOverride(rows[0]);
}

/** Delete an override row (revert all fields to upstream). */
export async function deleteArticleOverride(
  publication: Publication,
  wpPostId: string,
): Promise<boolean> {
  await ensureArticleOverridesSchema();
  const { exec } = await import('./db/neon');
  const result = await exec(
    `DELETE FROM wp_article_overrides WHERE publication = $1 AND wp_post_id = $2`,
    [publication, wpPostId],
  );
  return result.rowCount > 0;
}

/**
 * Merge an override into the upstream article. Field-level: only overridden
 * fields are replaced; everything else passes through. `hidden` is exposed
 * directly on the returned article so the public renderer can filter.
 */
export function applyOverride(
  article: NewsArticle,
  override: ArticleOverride | undefined,
): NewsArticle & { hidden?: boolean; editedFields?: string[] } {
  if (!override) return article;
  const out: NewsArticle & { hidden?: boolean; editedFields?: string[] } = { ...article };

  const has = (f: OverrideField) => override.editedFields.includes(f);

  if (has('head') && override.head !== null) out.head = override.head;
  if (has('excerpt') && override.excerpt !== null) {
    out.sum = override.excerpt;
    out.excerpt = override.excerpt;
  }
  if (has('contentHtml') && override.contentHtml !== null) out.contentHtml = override.contentHtml;
  if (has('imageUrl')) {
    out.imageUrl = override.imageUrl;
    out.imageThumb = override.imageUrl;
  }
  if (has('authorName') || has('authorAvatar')) {
    out.author = {
      name: (has('authorName') && override.authorName) || article.author?.name || 'Staff',
      ...(((has('authorAvatar') && override.authorAvatar) || article.author?.avatar)
        ? { avatar: (has('authorAvatar') ? override.authorAvatar : article.author?.avatar) || undefined }
        : {}),
    };
  }
  if (has('cat') && override.cat !== null) out.cat = override.cat;
  if (has('tags') && override.tags !== null) out.tags = override.tags;
  if (has('hidden')) out.hidden = override.hidden;

  out.editedFields = override.editedFields;
  return out;
}
