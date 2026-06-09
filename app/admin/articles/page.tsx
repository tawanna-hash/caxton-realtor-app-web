import { getNewsRaw, type NewsArticle, type Publication } from '@/lib/server/wp-news';
import {
  getAllOverridesForPublication,
  applyOverride,
  type ArticleOverride,
} from '@/lib/server/article-overrides';
import ArticlesClient, { type AdminArticle } from './ArticlesClient';

export const dynamic = 'force-dynamic';

async function loadForPublication(publication: Publication): Promise<AdminArticle[]> {
  const [upstream, overrides] = await Promise.all([
    getNewsRaw(publication),
    getAllOverridesForPublication(publication).catch((): Map<string, ArticleOverride> => new Map()),
  ]);
  return upstream.map((a) => {
    const merged = applyOverride(a, overrides.get(a.id));
    return {
      ...(merged as NewsArticle),
      hidden: (merged as { hidden?: boolean }).hidden ?? false,
      editedFields: (merged as { editedFields?: string[] }).editedFields ?? [],
    };
  });
}

export default async function AdminArticlesPage() {
  const [austin, sanAntonio] = await Promise.allSettled([
    loadForPublication('austin'),
    loadForPublication('san_antonio'),
  ]);

  const articles: AdminArticle[] = [];
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
