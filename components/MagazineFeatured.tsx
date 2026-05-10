'use client';

import { useEffect, useState } from 'react';
import type { Magazine } from '@/lib/magazines';

interface MagazineFeaturedProps {
  magazine: Magazine;
  brandColor: string;
  onOpenMagazine: () => void;
  onOpenArticle: (a: any) => void;
}

export default function MagazineFeatured({ magazine, brandColor, onOpenMagazine, onOpenArticle }: MagazineFeaturedProps) {
  const [liveNews, setLiveNews] = useState<any[] | null>(null);

  // Fetch news directly. Feed isn't mounted on the magazines phase,
  // so we cannot rely on its caxton:newsList event firing.
  useEffect(() => {
    const market = magazine.publication; // 'austin' or 'san_antonio'
    if (!market) return;
    const API = process.env.NEXT_PUBLIC_API_URL || '';
    let cancelled = false;
    fetch(`${API}/news/${market}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const items = Array.isArray(data?.articles) ? data.articles : Array.isArray(data) ? data : [];
        setLiveNews(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [magazine.publication]);

  // Normalize apostrophes so straight (U+0027) and curly (U+2019) both match.
  const normalizeApostrophe = (str: string) => str.replace(/\u2019/g, "'");
  const items = liveNews || [];

  const editorsChoice = items.find((a: any) => {
    const cat = normalizeApostrophe(String(a?.cat || a?.category || ''));
    return cat === "Editor's Choice";
  });

  // Note: API uses plural "Featured Advertisers"; UI label is singular.
  const featuredAdvertiser = items.find((a: any) => {
    const cat = normalizeApostrophe(String(a?.cat || a?.category || ''));
    return cat === 'Featured Advertisers';
  });

  const renderArticleCard = (article: any, label: string, sizeClass: string, summaryClamp: string) => {
    const img = article.image || article.imageUrl || article.thumbnail;
    const title = article.head || article.title || 'Featured article';
    const summary = article.sum || article.excerpt || article.summary;
    return (
      <button
        onClick={() => onOpenArticle(article)}
        className="block w-full text-left group"
        aria-label={`Open ${title}`}
      >
        <p className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-3" style={{ color: brandColor }}>
          {label}
        </p>
        {img && (
          <div className="relative w-full aspect-[16/10] overflow-hidden mb-4 bg-gray-100 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt=""
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
            />
          </div>
        )}
        <h3 className={`${sizeClass} font-serif text-gray-900 leading-tight mb-3 group-hover:underline`} style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {title}
        </h3>
        {summary && (
          <p className={`text-sm text-gray-600 leading-relaxed ${summaryClamp}`}>
            {summary}
          </p>
        )}
        <p className="text-xs uppercase tracking-[0.2em] mt-4 font-medium" style={{ color: brandColor }}>
          Read Article →
        </p>
      </button>
    );
  };

  return (
    <section className="bg-white px-4 md:px-8 py-12 border-t border-gray-100">
      <p className="text-xs uppercase tracking-[0.25em] font-semibold mb-6" style={{ color: brandColor }}>
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
            <p className="text-2xl font-serif text-gray-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{magazine.issue_label}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mt-1">{magazine.page_count} pages</p>
            <span className="mt-4 inline-block px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-white rounded-full" style={{ backgroundColor: brandColor }}>
              Read This Issue →
            </span>
          </div>
        </button>

        <div className="space-y-10">
          {editorsChoice && renderArticleCard(editorsChoice, "Editor's Choice", "text-2xl md:text-3xl", "line-clamp-3")}
          {featuredAdvertiser && renderArticleCard(featuredAdvertiser, "Featured Advertiser", "text-xl md:text-2xl", "line-clamp-2")}
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
