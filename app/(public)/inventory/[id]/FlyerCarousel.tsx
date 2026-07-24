'use client';

// app/(public)/inventory/[id]/FlyerCarousel.tsx
//
// Renders a promotion/listing flyer PDF as a compact CAROUSEL OF THUMBNAILS
// (a horizontally-scrollable filmstrip of its pages), NOT an inline PDF
// viewer or a large hero image. Clicking a thumbnail opens a full-size
// lightbox so the flyer is still readable. pdfjs-dist rasterizes each page
// to a JPEG on the client, so this works on mobile (incl. iOS Safari).
//
// Worker + module loading mirror InteractiveMagazineReader.tsx. The PDF is
// fetched as an ArrayBuffer and handed to pdfjs as `data` so the worker
// doesn't need to re-fetch the blob cross-origin.

import { useCallback, useEffect, useState } from 'react';

interface PdfJsViewport {
  width: number;
  height: number;
}
interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => {
    promise: Promise<void>;
  };
}
interface PdfJsDoc {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}
interface PdfJsLib {
  getDocument: (src: { data?: ArrayBuffer }) => { promise: Promise<PdfJsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFJS_VERSION: string = require('pdfjs-dist/package.json').version;
const PDFJS_CDN = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

let _pdfjsCache: PdfJsLib | null = null;
async function loadPdfJs(): Promise<PdfJsLib> {
  if (_pdfjsCache) return _pdfjsCache;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJsLib;
  mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
  _pdfjsCache = mod;
  return mod;
}

// Thumbnail render width (compact filmstrip).
const THUMB_WIDTH = 480;
const MAX_PAGES = 30;

type Props = {
  flyerPdfUrl: string;
  title: string;
};

export default function FlyerCarousel({ flyerPdfUrl, title }: Props) {
  const [pageImages, setPageImages] = useState<string[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        setStatus('loading');
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        // Fetch as ArrayBuffer so pdfjs doesn't re-fetch cross-origin in the
        // worker (Vercel Blob allows public GET, but `data` sidesteps any
        // worker-CORS quirk).
        const res = await fetch(flyerPdfUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;

        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        const pageCount = Math.min(doc.numPages, MAX_PAGES);
        const images: string[] = [];
        for (let i = 1; i <= pageCount; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const natural = page.getViewport({ scale: 1 });
          const scale = Math.min(Math.max(THUMB_WIDTH / natural.width, 0.5), 2);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context unavailable');
          // White background so transparent PDFs don't render black.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.8));
        }
        if (cancelled) return;
        setPageImages(images);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[FlyerCarousel] render failed:', err);
        setStatus('error');
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [flyerPdfUrl]);

  // Lightbox keyboard nav.
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(
    () =>
      setLightboxIndex((i) =>
        i === null ? i : (i - 1 + (pageImages?.length ?? 0)) % (pageImages?.length ?? 1),
      ),
    [pageImages],
  );
  const showNext = useCallback(
    () =>
      setLightboxIndex((i) =>
        i === null ? i : (i + 1) % (pageImages?.length ?? 1),
      ),
    [pageImages],
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the lightbox is open.
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, closeLightbox, showPrev, showNext]);

  if (status === 'loading') {
    return (
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
          Flyer
        </h2>
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] w-28 sm:w-32 rounded-md bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (status === 'error' || !pageImages || pageImages.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
          Flyer
        </h2>
        <a
          href={flyerPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
        >
          Download flyer
        </a>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
        Flyer{pageImages.length > 1 ? ` · ${pageImages.length} pages` : ''}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
        {pageImages.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="group flex-shrink-0 w-28 sm:w-32 snap-start focus:outline-none"
            aria-label={`View flyer page ${i + 1}`}
          >
            {/* Data URL — plain <img> avoids next/image loader config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${title} flyer page ${i + 1}`}
              className="aspect-[3/4] w-full rounded-md object-contain bg-white border border-gray-200 group-hover:border-gray-400 transition-colors"
            />
            <span className="block mt-1 text-center text-[10px] text-gray-400">
              {i + 1} / {pageImages.length}
            </span>
          </button>
        ))}
      </div>
      <a
        href={flyerPdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
      >
        Download flyer
      </a>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} flyer`}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-sm font-medium"
            aria-label="Close"
          >
            Close ✕
          </button>
          {pageImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-2xl px-2"
                aria-label="Previous page"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-2xl px-2"
                aria-label="Next page"
              >
                ›
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pageImages[lightboxIndex]}
            alt={`${title} flyer page ${lightboxIndex + 1}`}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
