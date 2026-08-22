'use client';

// Client gallery component with month filtering and lightbox.
// Receives grouped photos from the server, handles:
//   - Month tab filtering (All + per-month)
//   - Responsive masonry-ish grid
//   - Full-screen lightbox with prev/next navigation

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventPhotoMonth, EventPhoto } from '@/lib/event-photos';

type Props = {
  months: EventPhotoMonth[];
};

export default function EventGallery({ months }: Props) {
  const [activeMonth, setActiveMonth] = useState<string>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Flatten all photos for "All" view
  const allPhotos: EventPhoto[] = months.flatMap((m) => m.photos);
  const photos = activeMonth === 'all'
    ? allPhotos
    : months.find((m) => m.monthKey === activeMonth)?.photos ?? [];

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const nextPhoto = useCallback(() => {
    setLightboxIndex((i: number | null) => (i === null ? i : (i + 1) % photos.length));
  }, [photos.length]);
  const prevPhoto = useCallback(() => {
    setLightboxIndex((i: number | null) => (i === null ? i : (i - 1 + photos.length) % photos.length));
  }, [photos.length]);

  // Keyboard nav in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'ArrowLeft') prevPhoto();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, closeLightbox, nextPhoto, prevPhoto]);

  return (
    <>
      {/* Month filter tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveMonth('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
            activeMonth === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {months.map((m) => (
          <button
            key={m.monthKey}
            onClick={() => setActiveMonth(m.monthKey)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeMonth === m.monthKey
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {m.monthLabel}
          </button>
        ))}
      </div>

      {/* Photo count */}
      <p className="text-sm text-gray-500 mb-4">
        {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
      </p>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-gray-900 hover:ring-offset-1 transition-all"
          >
            <Image
              src={photo.thumbnailUrl || photo.imageUrl}
              alt={photo.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-200"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs text-white font-medium truncate">{photo.title}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2"
            aria-label="Close"
          >
            <X size={28} />
          </button>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2"
              aria-label="Previous"
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-[90vw] max-h-[85vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox uses raw <img> so the viewport-sized image can auto-size to its
                natural aspect ratio without a fixed width/height. next/image would either
                force a stretch (fill) or a fixed intrinsic size, neither of which fits a
                dynamic lightbox. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[lightboxIndex].imageUrl}
              alt={photos[lightboxIndex].title}
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <p className="text-white font-medium">{photos[lightboxIndex].title}</p>
              {photos[lightboxIndex].description && (
                <p className="text-white/70 text-sm mt-1">{photos[lightboxIndex].description}</p>
              )}
              <p className="text-white/50 text-xs mt-1">
                {(() => {
                  const m = photos[lightboxIndex].eventDate.slice(0, 7);
                  const [y, mo] = m.split('-').map(Number);
                  return new Date(y, mo - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                })()}
              </p>
            </div>
          </div>

          {/* Next */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2"
              aria-label="Next"
            >
              <ChevronRight size={36} />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}
