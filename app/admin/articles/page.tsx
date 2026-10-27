import { getNewsRaw, type NewsArticle, type Publication } from '@/lib/server/wp-news';
import {
  getAllOverridesForPublication,
  applyOverride,
  type ArticleOverride,
} from '@/lib/server/article-overrides';
import ArticlesClient, { type AdminArticle } from './ArticlesClient';
import { authorPortrait, canonicalAuthorName } from '@/lib/article-author-profiles';

export const dynamic = 'force-dynamic';

async function loadForPublication(publication: Publication): Promise<AdminArticle[]> {
  const [upstream, overrides] = await Promise.all([
    getNewsRaw(publication),
    getAllOverridesForPublication(publication).catch((): Map<string, ArticleOverride> => new Map()),
  ]);
  return upstream.map((a) => {
    const merged = applyOverride(a, overrides.get(a.id));
    const authorName = canonicalAuthorName(merged.author?.name || 'Staff', publication);
    return {
      ...(merged as NewsArticle),
      author: { name: authorName, avatar: authorPortrait(authorName, merged.author?.avatar) ?? undefined },
      hidden: (merged as { hidden?: boolean }).hidden ?? false,
      editedFields: (merged as { editedFields?: string[] }).editedFields ?? [],
    };
  });
}

const ADMIN_PUBLICATIONS: Array<{ id: Publication; label: string }> = [
  { id: 'austin', label: 'Austin' },
  { id: 'san_antonio', label: 'San Antonio' },
  { id: 'houston', label: 'Houston' },
  { id: 'dallas', label: 'Dallas / Ft. Worth' },
];

export default async function AdminArticlesPage() {
  const results = await Promise.allSettled(ADMIN_PUBLICATIONS.map((p) => loadForPublication(p.id)));

  const articles: AdminArticle[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') articles.push(...r.value);
    else errors.push(`${ADMIN_PUBLICATIONS[i].label} feed: ${String(r.reason)}`);
  });

  // Sort newest first
  articles.sort((a, b) => {
    const da = a.dateIso ? Date.parse(a.dateIso) : 0;
    const db = b.dateIso ? Date.parse(b.dateIso) : 0;
    return db - da;
  });

  return <ArticlesClient initialArticles={articles} initialErrors={errors} />;
}
