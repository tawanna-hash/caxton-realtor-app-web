import { getNewsRaw, type NewsArticle, type Publication } from '@/lib/server/wp-news';
import { getSql } from '@/lib/db';
import { listFeatureArticles } from '@/lib/feature-articles';
import ArticlesClient, { type AdminArticle } from './ArticlesClient';
import { authorPortrait, canonicalAuthorName } from '@/lib/article-author-profiles';

export const dynamic = 'force-dynamic';

async function loadForPublication(publication: Publication): Promise<AdminArticle[]> {
  const upstream = await getNewsRaw(publication);
  return upstream.map((a) => {
    const merged = a;
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
  // Featured partner articles share the same list (shown in every market their
  // partner is published in).
  try {
    const [features, advs] = await Promise.all([
      listFeatureArticles({ limit: 2000 }),
      getSql()`SELECT id, name, slug, COALESCE(publication, 'austin') AS publication FROM advertisers` as unknown as Promise<
        Array<{ id: number; name: string; slug: string; publication: string }>
      >,
    ]);
    const advById = new Map(advs.map((a) => [a.id, a]));
    const ALL: Publication[] = ADMIN_PUBLICATIONS.map((p) => p.id);
    for (const f of features) {
      const adv = advById.get(f.advertiserId);
      const scope = adv?.publication ?? 'austin';
      const markets = (ALL as string[]).includes(scope) ? [scope as Publication] : ALL;
      articles.push({
        id: `feature-${f.id}`,
        publication: markets[0],
        markets,
        cat: 'Featured Partner',
        head: f.title,
        sum: f.excerpt ?? '',
        link: f.articleUrl || (adv ? `/advertisers/${adv.slug}` : ''),
        imageUrl: f.imageUrl ?? undefined,
        time: '',
        date: f.publishedAt,
        publishedAt: f.publishedAt.length <= 10 ? `${f.publishedAt}T00:00:00.000Z` : f.publishedAt,
        dateIso: f.publishedAt.length <= 10 ? `${f.publishedAt}T00:00:00.000Z` : f.publishedAt,
        author: { name: f.author ?? adv?.name ?? '', ...(f.authorAvatar ? { avatar: f.authorAvatar } : {}) },
        tags: [],
        hidden: false,
        editedFields: [],
        featured: { ...f, advertiserName: adv?.name ?? '' },
      } as AdminArticle);
    }
  } catch (err) {
    errors.push(`Featured articles: ${String(err)}`);
  }

  articles.sort((a, b) => {
    const da = a.dateIso ? Date.parse(a.dateIso) : 0;
    const db = b.dateIso ? Date.parse(b.dateIso) : 0;
    return db - da;
  });

  return <ArticlesClient initialArticles={articles} initialErrors={errors} />;
}
