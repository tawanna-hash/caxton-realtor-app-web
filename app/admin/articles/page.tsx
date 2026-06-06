import { getNews, type NewsArticle } from '@/lib/server/wp-news';
import ArticlesClient from './ArticlesClient';

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  // Pull from both publications. unstable_cache means this is cheap on
  // repeat loads; the sync button invalidates the cache tags.
  const [austin, sanAntonio] = await Promise.allSettled([
    getNews('austin'),
    getNews('san_antonio'),
  ]);

  const articles: NewsArticle[] = [];
  if (austin.status === 'fulfilled') articles.push(...austin.value);
  if (sanAntonio.status === 'fulfilled') articles.push(...sanAntonio.value);

  // Sort newest first
  articles.sort((a, b) => {
    const da = a.dateIso ? Date.parse(a.dateIso) : 0;
    const db = b.dateIso ? Date.parse(b.dateIso) : 0;
    return db - da;
  });

  const errors: string[] = [];
  if (austin.status === 'rejected') errors.push(`Austin feed: ${String(austin.reason)}`);
  if (sanAntonio.status === 'rejected') errors.push(`San Antonio feed: ${String(sanAntonio.reason)}`);

  return <ArticlesClient initialArticles={articles} initialErrors={errors} />;
}
