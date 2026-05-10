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

  // Listen for the news list dispatched by Feed (caxton:newsList event).
  useEffect(() => {
    const handler = (e: any) => {
      if (Array.isArray(e?.detail)) {
        setLiveNews(e.detail);
      }
    };
    window.addEventListener('caxton:newsList', handler as EventListener);
    return () => {
      window.removeEventListener('caxton:newsList', handler as EventListener);
    };
  }, []);

  // Most recent article tagged "Editor's Choice" (curly apostrophe matches CATS array)
  const editorsChoice = (liveNews || []).find((a: any) => {
    const cat = a?.cat || a?.category || '';
    return cat === "Editor's Choice";
  });

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
            <span className="mt-4 inline-block px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-medium text-white" style={{ backgroundColor: brandColor }}>
              Read This Issue →
            </span>
          </div>
        </button>

        {editorsChoice ? (
          <button
            onClick={() => onOpenArticle(editorsChoice)}
            className="block w-full text-left group"
            aria-label={`Open ${editorsChoice.head || editorsChoice.title || 'featured article'}`}
          >
            <p className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-3" style={{ color: brandColor }}>
              Editor's Choice
            </p>
            {(editorsChoice.image || editorsChoice.imageUrl || editorsChoice.thumbnail) && (
              <div className="relative w-full aspect-[16/10] overflow-hidden mb-4 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editorsChoice.image || editorsChoice.imageUrl || editorsChoice.thumbnail}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                />
              </div>
            )}
            <h3 className="text-2xl md:text-3xl font-serif text-gray-900 leading-tight mb-3 group-hover:underline" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {editorsChoice.head || editorsChoice.title || 'Featured article'}
            </h3>
            {(editorsChoice.sum || editorsChoice.excerpt || editorsChoice.summary) && (
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                {editorsChoice.sum || editorsChoice.excerpt || editorsChoice.summary}
              </p>
            )}
            <p className="text-xs uppercase tracking-[0.2em] mt-4 font-medium" style={{ color: brandColor }}>
              Read Article →
            </p>
          </button>
        ) : (
          <div className="border-l-2 pl-6 py-4" style={{ borderColor: brandColor }}>
            <p className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-3 text-gray-400">
              Editor's Choice
            </p>
            <p className="text-base text-gray-500 italic">No Editor's Choice article tagged for this issue yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
