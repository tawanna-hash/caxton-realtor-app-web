import { query } from './db/neon';
import type { NewsArticle, Publication } from './wp-news';

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
    author: row.author_avatar
      ? { name: row.author_name || 'Staff', avatar: row.author_avatar }
      : { name: row.author_name || 'Staff' },
    tags: row.tags ?? [],
  };
}

export async function getArchivedArticles(publication: Publication): Promise<NewsArticle[]> {
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

