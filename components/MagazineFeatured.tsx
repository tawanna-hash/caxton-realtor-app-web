'use client';

import { useEffect, useState } from 'react';
import type { Magazine } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';
import { usePtrRefresh } from '@/hooks/use-ptr-refresh';
import { canonicalArticleCategory } from '@/lib/article-categories';
import ArticleFeedCardBody from '@/components/ArticleFeedCardBody';

// Loose shape — the news feed comes from WordPress via /api/news/[publication]
// and uses inconsistent field names (head/title, sum/excerpt/summary, etc.).
type NewsArticle = {
  id?: string | number;
  cat?: string;
  category?: string;
  head?: string;
  title?: string;
  sum?: string;
  excerpt?: string;
  summary?: string;
  image?: string;
  imageUrl?: string;
  thumbnail?: string;
  [key: string]: unknown;
};

interface MagazineFeaturedProps {
  magazine: Magazine;
  brandColor: string;
  onOpenMagazine: () => void;
  onOpenArticle: (a: NewsArticle) => void;
}

export default function MagazineFeatured({ magazine, brandColor, onOpenMagazine, onOpenArticle }: MagazineFeaturedProps) {
  const [liveNews, setLiveNews] = useState<NewsArticle[] | null>(null);
  // Pull-to-refresh nonce — increments on every PTR so the news fetch
  // below re-runs.
  const ptrNonce = usePtrRefresh();

  // Fetch news directly. Feed isn't mounted on the magazines phase,
  // so we cannot rely on its caxton:newsList event firing.
  useEffect(() => {
    const market = magazine.publication; // 'austin' or 'san_antonio'
    if (!market) return;
    let cancelled = false;
    fetch(`/api/news/${market}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const items: NewsArticle[] = Array.isArray(data?.articles)
          ? (data.articles as NewsArticle[])
          : Array.isArray(data)
            ? (data as NewsArticle[])
            : [];
        setLiveNews(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // ptrNonce intentionally retriggers the fetch on pull-to-refresh.
  }, [magazine.publication, ptrNonce]);

  const items = liveNews || [];

  const editorsChoice = items.find((a: NewsArticle) => {
    const cat = canonicalArticleCategory(String(a?.cat || a?.category || ''), magazine.publication);
    return cat === "Editor's Choice";
  });

  const featuredAdvertiser = items.find((a: NewsArticle) => {
    const cat = canonicalArticleCategory(String(a?.cat || a?.category || ''), magazine.publication);
    return cat === 'Featured Partner';
  });

  const renderArticleCard = (article: NewsArticle, label: string, _sizeClass: string, _summaryClamp: string) => {
    const img = article.image || article.imageUrl || article.thumbnail;
    const title = article.head || article.title || 'Featured article';
    const summary = article.sum || article.excerpt || article.summary;
    return (
      <button
        onClick={() => { trackEvent('magazine_featured_article_clicked', { magazine_id: magazine.id, article_id: article?.id, label }); onOpenArticle(article); }}
        className="block w-full text-left group px-4 py-5 hover:bg-gray-50 transition-colors rounded-md"
        aria-label={`Open ${title}`}
      >
        <ArticleFeedCardBody category={label} headline={title} summary={summary} imageUrl={img} />
      </button>
    );
  };

  return (
    <section className="bg-white px-4 md:px-8 py-12 border-t border-gray-100">
      <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-6" style={{ color: brandColor }}>
        Current Issue
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
        <button onClick={onOpenMagazine} className="block w-full group" aria-label={`Open ${magazine.issue_label}`}>
          <div className="relative w-full max-w-sm mx-auto md:mx-0 aspect-[17/22] overflow-hidden shadow-2xl group-hover:shadow-3xl transition-shadow bg-white">
            {magazine.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={magazine.cover_url} alt={`${magazine.issue_label} cover`} className="w-full h-full object-contain" />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-white/60 text-xs uppercase tracking-wider">No cover</div>
            )}
          </div>
          <div className="mt-4 text-center md:text-left">
            <p className="text-2xl font-serif text-gray-900">{magazine.issue_label}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mt-1">{magazine.page_count} pages</p>
            <span className="mt-4 inline-block px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-white rounded-md" style={{ backgroundColor: brandColor }}>
              Read This Issue →
            </span>
          </div>
        </button>

        <div className="space-y-10">
          {editorsChoice && renderArticleCard(editorsChoice, "Editor's Choice", "text-2xl md:text-3xl", "line-clamp-3")}
          {featuredAdvertiser && renderArticleCard(featuredAdvertiser, "Featured Partner", "text-xl md:text-2xl", "line-clamp-2")}
          {!editorsChoice && !featuredAdvertiser && (
            <div className="border-l-2 pl-6 py-4" style={{ borderColor: brandColor }}>
              <p className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-3 text-gray-400">
                Featured Articles
              </p>
              <p className="text-base text-gray-500 italic">No featured articles yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
