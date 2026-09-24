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

function usableAvatar(name: string, avatar: string | null | undefined): string | null {
  if (keyFor(name) === 'ojas tasker' && (!avatar || /^https?:\/\/(?:www\.)?newslinesa\.com\/wp-content\/uploads\//i.test(avatar))) {
    return '/ojas-tasker-headshot.jpeg';
  }
  if (keyFor(name) === 'tanya chappell' && (!avatar || /(?:^|\/\/)(?:www\.)?(?:realtyline\.us\/wp-content\/uploads\/|secure\.gravatar\.com\/avatar\/)/i.test(avatar))) {
    return '/tanya-chappell-headshot.jpg';
  }
  // The retired WordPress hosts redirect uploads to the app's dashboard, so
  // their old author-photo URLs render as broken images. Do not advertise them.
  if (avatar && /^https?:\/\/(?:www\.)?(?:realtyline\.us|newslinesa\.com)\/wp-content\/uploads\//i.test(avatar)) {
    return keyFor(name) === 'tawanna verock' ? '/email/tawanna-verock-headshot-20260827.png' : null;
  }
  if (avatar && /(?:^|\/\/)secure\.gravatar\.com\/avatar\//i.test(avatar)) {
    return avatar.replace(/([?&])d=(?:mm|mp|mystery|blank)\b/i, '$1d=404');
  }
  if (!avatar && keyFor(name) === 'tawanna verock') return '/email/tawanna-verock-headshot-20260827.png';
  return avatar || null;
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
    const normalized = name.trim().replace(/\s+/g, ' ') === 'ojas' ? 'Ojas Tasker' : name.trim().replace(/\s+/g, ' ');
    const key = keyFor(normalized);
    const photo = usableAvatar(normalized, avatar);
    const prior = authors.get(key);
    if (!prior || (!prior.avatar && photo)) authors.set(key, { name: normalized, avatar: photo });
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
    for (const author of saved.value) authors.set(keyFor(author.name), { ...author, avatar: usableAvatar(author.name, author.avatar) });
  } else if (authors.size === 0) {
    throw saved.reason;
  }
  return [...authors.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateArticleAuthorPhoto(name: string, avatar: string | null): Promise<ArticleAuthor> {
  await ensureAuthorSchema();
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const rows = await query<ArticleAuthor>(
    `INSERT INTO article_authors (name_key, name, avatar) VALUES ($1, $2, $3)
     ON CONFLICT (name_key) DO UPDATE SET avatar = EXCLUDED.avatar
     RETURNING name, avatar`,
    [keyFor(cleanName), cleanName, avatar],
  );
  return rows[0];
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
