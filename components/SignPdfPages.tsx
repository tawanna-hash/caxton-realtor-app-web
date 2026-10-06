'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfJs = { getDocument: (o: { url?: string; data?: Uint8Array }) => { promise: Promise<PdfDoc> }; GlobalWorkerOptions: { workerSrc: string } };

let cache: PdfJs | null = null;
async function loadPdfJs(): Promise<PdfJs> {
  if (cache) return cache;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJs;
  mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  cache = mod;
  return mod;
}

function PageCanvas({ doc, index, width, children, onClick }: { doc: PdfDoc; index: number; width: number; children?: ReactNode; onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const canvas = ref.current;
      if (!canvas || !live) return;
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (live) setSize({ w: width, h: (base.height / base.width) * width });
    })();
    return () => { live = false; };
  }, [doc, index, width]);
  return (
    <div className="relative mx-auto mb-4 border border-slate-300 bg-white shadow-sm" style={{ width, height: size?.h }} onClick={onClick} data-page={index}>
      <canvas ref={ref} style={{ width, height: size?.h }} className="block" />
      {size && children}
    </div>
  );
}

/** Renders every page of a PDF. Overlay children are positioned in page-relative space (position:absolute, % units). */
export default function SignPdfPages({ url, data, width, overlay, onPageClick }: { url?: string; data?: Uint8Array; width: number; overlay?: (page: number) => ReactNode; onPageClick?: (page: number, fx: number, fy: number) => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const d = await pdfjs.getDocument(url ? { url } : { data: data ? data.slice() : undefined }).promise;
        if (live) setDoc(d);
      } catch { if (live) setError('The document could not be shown.'); }
    })();
    return () => { live = false; };
  }, [url, data]);
  if (error) return <p className="text-sm text-[#661102]" role="alert">{error}</p>;
  if (!doc) return <p className="text-sm text-slate-500">Loading document.</p>;
  return (
    <div>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PageCanvas key={i} doc={doc} index={i} width={width} onClick={onPageClick ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onPageClick(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); } : undefined}>
          {overlay?.(i)}
        </PageCanvas>
      ))}
    </div>
  );
}
