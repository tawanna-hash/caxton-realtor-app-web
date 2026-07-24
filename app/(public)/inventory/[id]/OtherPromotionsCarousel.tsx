'use client';

// app/(public)/inventory/[id]/OtherPromotionsCarousel.tsx
//
// Shown on a promotion detail page when the builder has more than one
// active promotion. Renders a horizontally-scrollable carousel of the
// SIBLING promotions (excluding the one currently in view): each card
// shows that promotion's flyer first page (rasterized client-side via
// pdfjs) under its title, and links to that promotion's individual
// /inventory/[id] page.

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export interface SiblingPromo {
  id: number;
  title: string;
  flyerPdfUrl: string;
}

function FlyerThumb({
  flyerPdfUrl,
  title,
}: {
  flyerPdfUrl: string;
  title: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjs = await loadPdfJs();
        const res = await fetch(flyerPdfUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(Math.max(600 / natural.width, 0.5), 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setSrc(canvas.toDataURL('image/jpeg', 0.8));
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[OtherPromotionsCarousel] thumb render failed:', err);
        setStatus('error');
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [flyerPdfUrl]);

  if (status === 'loading') {
    return <div className="aspect-[3/4] w-full rounded-md bg-gray-100 animate-pulse" />;
  }
  if (status === 'error' || !src) {
    return (
      <div className="aspect-[3/4] w-full rounded-md bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
        Flyer unavailable
      </div>
    );
  }
  return (
    // Data URL — plain <img> avoids next/image loader config for data: URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} flyer`}
      className="aspect-[3/4] w-full rounded-md object-contain bg-white border border-gray-200"
    />
  );
}

export default function OtherPromotionsCarousel({
  promotions,
}: {
  promotions: SiblingPromo[];
}) {
  if (promotions.length === 0) return null;
  return (
    <section className="mt-10 border-t border-gray-200 pt-6">
      <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-4">
        Other promotions
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-2 px-2 snap-x">
        {promotions.map((p) => (
          <Link
            key={p.id}
            href={`/inventory/${p.id}`}
            className="group flex-shrink-0 w-40 sm:w-48 snap-start"
          >
            <FlyerThumb flyerPdfUrl={p.flyerPdfUrl} title={p.title} />
            <p className="mt-2 text-xs font-medium text-gray-800 leading-snug line-clamp-2 group-hover:text-[#5a0e5f] transition-colors">
              {p.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
