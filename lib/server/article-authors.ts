import { query } from './db/neon';
import { getNewsRaw } from './wp-news';
import { listFeatureArticles } from '@/lib/feature-articles';

export type ArticleAuthor = { name: string; avatar: string | null };

let schemaReady = false;
async function ensureAuthorSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`CREATE TABLE IF NOT EXISTS article_authors (
    name_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  schemaReady = true;
}

function keyFor(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export async function listArticleAuthors(): Promise<ArticleAuthor[]> {
  await ensureAuthorSchema();
  const [saved, austin, sanAntonio, featured] = await Promise.allSettled([
    query<ArticleAuthor>(`SELECT name, avatar FROM article_authors ORDER BY name`),
    getNewsRaw('austin'),
    getNewsRaw('san_antonio'),
    listFeatureArticles({ limit: 2000 }),
  ]);
  const authors = new Map<string, ArticleAuthor>();
  function add(name: string | null | undefined, avatar?: string | null) {
    if (!name?.trim()) return;
    const normalized = name.trim().replace(/\s+/g, ' ');
    const key = keyFor(normalized);
    const prior = authors.get(key);
    if (!prior || (!prior.avatar && avatar)) authors.set(key, { name: normalized, avatar: avatar || null });
  }
  // Save curated profiles last so their chosen image takes precedence.
  for (const result of [austin, sanAntonio] as const) {
    if (result.status === 'fulfilled') {
      for (const article of result.value) add(article.author?.name, article.author?.avatar);
    }
  }
  if (featured.status === 'fulfilled') {
    for (const article of featured.value) add(article.author, article.authorAvatar);
  }
  if (saved.status === 'fulfilled') {
    for (const author of saved.value) authors.set(keyFor(author.name), author);
  } else if (authors.size === 0) {
    throw saved.reason;
  }
  return [...authors.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createArticleAuthor(name: string, avatar: string | null): Promise<ArticleAuthor | null> {
  await ensureAuthorSchema();
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const rows = await query<ArticleAuthor>(
    `INSERT INTO article_authors (name_key, name, avatar)
     VALUES ($1, $2, $3) ON CONFLICT (name_key) DO NOTHING
     RETURNING name, avatar`,
    [keyFor(cleanName), cleanName, avatar],
  );
  return rows[0] ?? null;
}
