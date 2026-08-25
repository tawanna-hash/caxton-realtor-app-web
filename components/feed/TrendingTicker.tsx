'use client';

/**
 * TrendingTicker — rotating trending-article strip that sits at the top
 * of the RealtyLine / Newsline feed.
 *
 * Behavior:
 *   - Fetches active items from /api/trending?market=...
 *   - Auto-rotates every 5s (pauses on hover / focus / touch)
 *   - Respects prefers-reduced-motion (static, no rotation)
 *   - Dismissible per-day via localStorage
 *   - Hides itself when no active items
 *   - Native iOS + Android inherit via Capacitor WebView
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '../../app/posthog-provider';
import type { PubKey } from '@/lib/pub-meta';

type Market = PubKey;

interface TrendingItem {
  id: number;
  headline: string;
  subheadline: string | null;
  thumbnail_url: string | null;
  article_url: string;
  icon_prefix: string | null;
  markets: Market[];
}

interface Props {
  market: Market;
  className?: string;
}

const ROTATE_MS = 5000;
const DISMISS_KEY_PREFIX = 'caxton_ticker_dismissed_';

function todayKey(market: Market): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${DISMISS_KEY_PREFIX}${market}_${y}${m}${day}`;
}

export default function TrendingTicker({ market, className = '' }: Props) {
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // check dismissed state on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const isDismissed = window.localStorage.getItem(todayKey(market)) === '1';
        queueMicrotask(() => { setDismissed(isDismissed); });
      }
    } catch { /* ignore */ }
  }, [market]);

  // detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // fetch active items for market
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/trending?market=${encodeURIComponent(market)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as { items?: TrendingItem[] };
        if (!cancelled) {
          const arr = j.items ?? [];
          setItems(arr);
          trackEvent('trending_loaded', { market, count: arr.length });
        }
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [market]);

  // auto-rotate
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (reducedMotion || paused || items.length <= 1 || dismissed) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length, paused, reducedMotion, dismissed]);

  // Clamp index inline when item count shrinks — no setState in effect.
  const safeIndex = items.length > 0 ? index % items.length : 0;

  const dismiss = useCallback(() => {
    try { window.localStorage.setItem(todayKey(market), '1'); } catch { /* ignore */ }
    setDismissed(true);
    const item = items[safeIndex];
    trackEvent('trending_dismissed', {
      market,
      trending_id: item?.id ?? null,
      headline: item?.headline ?? null,
      position: safeIndex,
      total: items.length,
    });
  }, [items, safeIndex, market]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + items.length) % items.length);
    trackEvent('trending_nav', { market, dir: 'prev', total: items.length });
  }, [items.length, market]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % items.length);
    trackEvent('trending_nav', { market, dir: 'next', total: items.length });
  }, [items.length, market]);

  const current = useMemo(() => items[safeIndex] ?? null, [items, safeIndex]);

  // Fire impression once per (item, market) pair while the ticker is visible.
  // Uses a ref-tracked set so re-renders don't re-fire, but rotating back to
  // an item after seeing others will fire again (intentional — real re-view).
  const lastImpressionRef = useRef<string>('');
  useEffect(() => {
    if (dismissed || !current) return;
    const key = `${market}:${current.id}`;
    if (lastImpressionRef.current === key) return;
    lastImpressionRef.current = key;
    trackEvent('trending_impression', {
      market,
      trending_id: current.id,
      headline: current.headline,
      position: safeIndex,
      total: items.length,
    });
  }, [current, dismissed, market, safeIndex, items.length]);

  if (dismissed || !current) return null;

  return (
    <section
      aria-label="Trending news"
      className={`relative rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <a
        href={current.article_url}
        onClick={() => {
          trackEvent('trending_click', {
            market,
            trending_id: current.id,
            headline: current.headline,
            article_url: current.article_url,
            position: safeIndex,
            total: items.length,
          });
        }}
        className="flex items-center gap-3 p-3 sm:p-4 no-underline text-neutral-900 hover:bg-neutral-50 transition-colors"
      >
        {current.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.thumbnail_url}
            alt=""
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover flex-shrink-0 bg-neutral-100"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0 text-2xl"
          >
            {current.icon_prefix || '🔥'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded-full">
              <span aria-hidden>{current.icon_prefix || '🔥'}</span>
              Trending
            </span>
            {items.length > 1 && (
              <span className="text-[10px] text-neutral-500 tabular-nums">
                {safeIndex + 1} / {items.length}
              </span>
            )}
          </div>
          <div className="text-sm sm:text-base font-semibold leading-snug line-clamp-2">
            {current.headline}
          </div>
          {current.subheadline && (
            <div className="text-xs sm:text-sm text-neutral-600 leading-snug line-clamp-1 mt-0.5">
              {current.subheadline}
            </div>
          )}
        </div>
        <span aria-hidden className="text-neutral-400 text-lg flex-shrink-0">→</span>
      </a>

      {/* controls */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); prev(); }}
              aria-label="Previous trending item"
              className="w-6 h-6 rounded-full bg-white/90 border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-white flex items-center justify-center text-xs shadow-sm"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); next(); }}
              aria-label="Next trending item"
              className="w-6 h-6 rounded-full bg-white/90 border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-white flex items-center justify-center text-xs shadow-sm"
            >
              ›
            </button>
          </>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); dismiss(); }}
          aria-label="Dismiss trending strip"
          className="w-6 h-6 rounded-full bg-white/90 border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:bg-white flex items-center justify-center text-xs shadow-sm"
        >
          ✕
        </button>
      </div>

      {/* progress dots */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1 pb-2" aria-hidden>
          {items.map((it, i) => (
            <span
              key={it.id}
              className={`h-1 rounded-full transition-all ${i === safeIndex ? 'w-4 bg-orange-500' : 'w-1 bg-neutral-300'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
