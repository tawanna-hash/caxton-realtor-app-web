'use client';

// components/inventory/InventoryGallery.tsx
//
// Photo gallery for the inventory detail page. Shows one large hero image
// with a horizontally scrollable thumbnail strip below. Clicking a
// thumbnail (or pressing arrow keys / clicking the left-right edges of
// the hero) advances the active image. Falls back gracefully to:
//
//   - a single image when galleryUrls is null/empty but thumbnailUrl exists
//   - an empty placeholder when neither is present
//
// Keeps state purely local; the parent passes immutable props.

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  galleryUrls: string[] | null;
  thumbnailUrl: string | null;
  alt: string;
};

export default function InventoryGallery({ galleryUrls, thumbnailUrl, alt }: Props) {
  const images = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (u: string | null | undefined) => {
      if (!u) return;
      const trimmed = u.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    };
    if (galleryUrls && galleryUrls.length) {
      for (const u of galleryUrls) push(u);
    }
    push(thumbnailUrl);
    return out;
  }, [galleryUrls, thumbnailUrl]);

  const [active, setActive] = useState(0);
  const thumbStripRef = useRef<HTMLDivElement | null>(null);

  // Keep the active thumbnail visible.
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const btn = strip.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  if (images.length === 0) {
    return (
      <div className="relative aspect-[3/2] w-full max-w-3xl bg-gray-50 flex flex-col items-center justify-center gap-3 text-gray-400 rounded-md border border-gray-200">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75 7.5 10.5l4.5 4.5 3-3 6.75 6.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25v-10.5A2.25 2.25 0 0 0 19.5 4.5h-15A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
          />
        </svg>
        <p className="text-xs uppercase tracking-[0.2em] font-medium text-gray-500">
          Photo coming soon
        </p>
      </div>
    );
  }

  const showControls = images.length > 1;

  const next = () => setActive((i) => (i + 1) % images.length);
  const prev = () => setActive((i) => (i - 1 + images.length) % images.length);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  return (
    <div>
      {/* Hero: narrower (max ~768px) and shorter (3:2 instead of 4:3) so it
          doesn't dominate the page above the description. */}
      <div
        className="relative w-full max-w-3xl aspect-[3/2] bg-gray-100 overflow-hidden rounded-md border border-gray-200"
        tabIndex={0}
        onKeyDown={onKey}
        role="region"
        aria-label={`${alt} — image ${active + 1} of ${images.length}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={images[active]}
          src={images[active]}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {showControls && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full w-9 h-9 flex items-center justify-center shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full w-9 h-9 flex items-center justify-center shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <div className="absolute bottom-3 right-3 bg-[#E06100]/60 text-white text-xs px-2 py-1 rounded-md">
              {active + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {showControls && (
        <div
          ref={thumbStripRef}
          className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin max-w-3xl"
        >
          {images.map((src, idx) => (
            <button
              key={src}
              type="button"
              data-idx={idx}
              onClick={() => setActive(idx)}
              aria-label={`View image ${idx + 1}`}
              aria-current={active === idx}
              className={`relative shrink-0 w-20 h-16 rounded-md overflow-hidden border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                active === idx ? 'border-gray-900' : 'border-transparent hover:border-gray-400'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
