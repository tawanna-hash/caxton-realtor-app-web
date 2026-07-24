'use client';

// app/(public)/inventory/[id]/FlyerCarousel.tsx
//
// Renders a promotion/listing flyer PDF as a swipeable carousel of page
// thumbnails (reusing InventoryGallery) instead of an inline PDF viewer.
// pdfjs-dist rasterizes each page to a JPEG on the client, so this works
// on mobile browsers (including iOS Safari, which can't embed PDFs).
//
// Worker + module loading mirror InteractiveMagazineReader.tsx. The PDF is
// fetched as an ArrayBuffer and handed to pdfjs as `data` so the worker
// doesn't need to re-fetch the blob cross-origin.

import { useEffect, useState } from 'react';
import InventoryGallery from '@/components/inventory/InventoryGallery';

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

// Render each page ~1240px wide — crisp on retina thumbnails, but bounded so
// a 30-page flyer can't blow up memory.
const TARGET_PAGE_WIDTH = 1240;
const MAX_PAGES = 30;

type Props = {
  flyerPdfUrl: string;
  title: string;
};

export default function FlyerCarousel({ flyerPdfUrl, title }: Props) {
  const [pageImages, setPageImages] = useState<string[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
          const scale = Math.min(
            Math.max(TARGET_PAGE_WIDTH / natural.width, 0.5),
            3,
          );
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
          images.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        if (cancelled) return;
        setPageImages(images);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'unknown error';
        console.error('[FlyerCarousel] render failed:', msg);
        setStatus('error');
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [flyerPdfUrl]);

  if (status === 'loading') {
    return (
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
          Flyer
        </h2>
        <div className="flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 h-64">
          <span className="text-sm text-gray-500">Loading flyer…</span>
        </div>
      </section>
    );
  }

  if (status === 'error' || !pageImages || pageImages.length === 0) {
    // Fall back to a plain download link if rasterization fails.
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
      <InventoryGallery
        galleryUrls={pageImages}
        thumbnailUrl={null}
        alt={`${title} flyer`}
      />
      <a
        href={flyerPdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
      >
        Download flyer
      </a>
    </section>
  );
}
