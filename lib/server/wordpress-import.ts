/**
 * One-time, permanent import of every WordPress-sourced article into our own
 * `wp_article_archive` table. After it completes, the app never contacts
 * WordPress again: the archive is the single source of truth and all edits,
 * hides (deletes) and market copies are made directly on archive rows.
 *
 * Admin overrides that existed on WordPress articles are baked into the
 * imported rows; articles an admin had hidden are left out. The import is
 * idempotent and only marks itself complete when every upstream feed was read.
 */
import { getSql } from '@/lib/db';
import type { Publication } from './wp-news';

const MIGRATION_KEY = 'wordpress-permanent-import-v1';
const WP_PUBLICATIONS: Publication[] = ['austin', 'san_antonio'];

async function query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await getSql().query(text, values)) as T[];
}

let done = false;
let inflight: Promise<void> | null = null;

function slugify(head: string): string {
  return head.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'article';
}

async function runImport(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS app_migrations (key TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const existing = await query(`SELECT 1 FROM app_migrations WHERE key = $1`, [MIGRATION_KEY]);
  if (existing.length > 0) { done = true; return; }

  const { fetchNewsArticles } = await import('./wp-news');
  const { ensureArticleArchiveSchema, getArchivedArticleByPostId, updateArchivedArticle, deleteArchivedArticle } =
    await import('./article-archive');
  const { getAllOverridesForPublication, applyOverride } = await import('./article-overrides');
  await ensureArticleArchiveSchema();

  for (const publication of WP_PUBLICATIONS) {
    const upstream = await fetchNewsArticles(publication); // throws => not marked complete, retried later
    for (const a of upstream) {
      const slug = `${publication}-${slugify(a.head)}-${a.id}`;
      await query(
        `INSERT INTO wp_article_archive
           (publication, wp_post_id, slug, head, excerpt, content_html, image_url, image_thumb,
            author_name, author_avatar, cat, tags, published_at, source_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
         ON CONFLICT DO NOTHING`,
        [
          publication, a.id, slug, a.head, a.excerpt ?? a.sum ?? '', a.contentHtml ?? '',
          a.imageUrl ?? null, a.imageThumb ?? a.imageUrl ?? null,
          a.author?.name ?? 'Staff', a.author?.avatar ?? null, a.cat ?? '', a.tags ?? [],
          new Date(a.dateIso || a.publishedAt).toISOString(), a.link || null,
        ],
      );
    }

    // Bake earlier admin edits into the rows, and drop articles that were hidden.
    const overrides = await getAllOverridesForPublication(publication).catch(() => new Map());
    for (const [id, override] of overrides) {
      const row = await getArchivedArticleByPostId(publication, id);
      if (!row) continue;
      const merged = applyOverride(row, override);
      if ((merged as { hidden?: boolean }).hidden) {
        await deleteArchivedArticle(publication, id);
        continue;
      }
      if (override.editedFields.length === 0) continue;
      await updateArchivedArticle(publication, id, {
        head: merged.head,
        excerpt: merged.excerpt ?? merged.sum,
        contentHtml: merged.contentHtml,
        imageUrl: merged.imageUrl,
        imageThumb: merged.imageThumb ?? merged.imageUrl,
        authorName: merged.author?.name,
        authorAvatar: merged.author?.avatar ?? null,
        cat: merged.cat,
        tags: merged.tags,
      });
    }
  }

  await query(`INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`, [MIGRATION_KEY]);
  done = true;
}

/** Runs the import once; later calls are free. Never throws. */
export async function ensureWordPressImported(): Promise<void> {
  if (done) return;
  if (!inflight) {
    inflight = runImport()
      .catch((err) => { console.error('[wordpress-import] failed, will retry:', err); })
      .finally(() => { inflight = null; });
  }
  await inflight;
}
