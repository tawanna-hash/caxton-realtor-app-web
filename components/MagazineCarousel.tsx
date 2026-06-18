'use client';

import { useEffect, useRef, useState } from 'react';
import type { Magazine } from '@/lib/magazines';
import { fetchMagazines } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';
import PageTitle from '@/components/ui/PageTitle';

interface MagazineCarouselProps {
  publication: string;
  brandColor: string;
  onOpen: (m: Magazine) => void;
  onMagazinesLoaded?: (mags: Magazine[]) => void;
}

type Tab = 'current' | 'all';

export default function MagazineCarousel({ publication, brandColor, onOpen, onMagazinesLoaded }: MagazineCarouselProps) {
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Stable ref to the callback so it doesn't retrigger the fetch effect each render.
  const loadedCbRef = useRef(onMagazinesLoaded);
  useEffect(() => {
    loadedCbRef.current = onMagazinesLoaded;
  }, [onMagazinesLoaded]);

  useEffect(() => {
    let cancelled = false;
    // setState calls are batched inside an async chain (not
    // synchronously in the effect body) which is the recommended
    // pattern; suppress the over-eager rule for this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetchMagazines(publication)
      .then((data) => {
        if (!cancelled) {
          setMagazines(data);
          setLoading(false);
          if (loadedCbRef.current) loadedCbRef.current(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load magazines');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publication]);

  function scrollByCards(direction: 1 | -1) {
    trackEvent('magazine_carousel_arrow_clicked', { direction: direction === 1 ? 'next' : 'prev', publication });
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 650, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="px-4 py-12 bg-gray-50">
        <div className="flex gap-4 justify-center">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-shrink-0 w-44 h-60 bg-gray-200 animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 bg-gray-50">
        <p className="text-sm text-red-600 text-center">Couldn&apos;t load magazines: {error}</p>
      </div>
    );
  }

  if (magazines.length === 0) {
    return (
      <div className="px-4 py-12 bg-gray-50 text-center">
        <p className="text-sm text-gray-500">No issues available yet.</p>
      </div>
    );
  }

  const current = magazines[0];
  // Reorder so current issue sits in the middle of the carousel,
  // with older issues fanning out to both sides (Texas Monthly style).
  function centerCurrent(mags: Magazine[]): Magazine[] {
    if (mags.length <= 1) return mags;
    const [first, ...rest] = mags;
    const mid = Math.floor(rest.length / 2);
    return [...rest.slice(0, mid), first, ...rest.slice(mid)];
  }
  const display = tab === 'current' ? [current] : centerCurrent(magazines);

  return (
    <div className="bg-gray-50 pt-10 pb-12">
      <div className="px-4 mb-6">
        <PageTitle align="center">Magazine Archive</PageTitle>
      </div>

      <div className="flex items-center justify-center gap-8 mb-8 text-xs uppercase tracking-[0.2em] font-medium">
        <button
          onClick={() => setTab('current')}
          className={tab === 'current' ? 'text-gray-900 border-b-2 border-gray-900 pb-1.5' : 'text-gray-400 pb-1.5'}
        >
          Current Issue
        </button>
        <button
          onClick={() => setTab('all')}
          className={tab === 'all' ? 'text-gray-900 border-b-2 border-gray-900 pb-1.5' : 'text-gray-400 pb-1.5'}
        >
          All Issues
        </button>
      </div>

      <div className="relative">
        {tab === 'all' && magazines.length > 4 && (
          <button
            onClick={() => scrollByCards(-1)}
            aria-label="Scroll left"
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        )}
        {tab === 'all' && magazines.length > 4 && (
          <button
            onClick={() => scrollByCards(1)}
            aria-label="Scroll right"
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-md items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}

        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto px-6 md:px-16 pb-2 items-end"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {display.map((m) => {
            const isCurrent = m.id === current.id;
            return (
              <div key={m.id} className="flex-shrink-0 flex flex-col items-center">
                <button
                  onClick={() => onOpen(m)}
                  className="group block"
                  aria-label={`Open ${m.issue_label}`}
                >
                  <div
                    className={
                      isCurrent
                        ? 'relative w-52 h-72 overflow-hidden shadow-xl transition-transform duration-300 ease-out origin-bottom hover:-translate-y-2 hover:shadow-2xl active:scale-95 bg-white'
                        : 'relative w-44 h-60 overflow-hidden shadow-md transition-transform duration-300 ease-out origin-bottom hover:-translate-y-2 hover:shadow-xl active:scale-95 bg-white'
                    }
                    style={{ transform: isCurrent ? 'scale(1.1)' : 'scale(1)' }}
                  >
                    {m.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.cover_url} alt={`${m.issue_label} cover`} className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-white/60 text-xs uppercase tracking-wider">No cover</div>
                    )}
                  </div>
                </button>
                <div className="mt-3 text-center" style={{ paddingTop: isCurrent ? 8 : 0 }}>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-700 font-medium">{m.issue_label}</p>
                  {isCurrent && (
                    <p className="text-[10px] uppercase tracking-[0.2em] font-semibold mt-1" style={{ color: brandColor }}>
                      Current Issue
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
