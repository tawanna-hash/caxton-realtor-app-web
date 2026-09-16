'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';

type FieldLocation = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function TrecPdfPagePreview({
  pdfUrl,
  pageNumber,
  selectedFieldName,
  formNumber,
}: {
  pdfUrl: string;
  pageNumber: number;
  selectedFieldName: string | null;
  formNumber: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [fieldLocations, setFieldLocations] = useState<Record<string, FieldLocation>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setContainerWidth(Math.floor(container.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<(typeof import('pdfjs-dist'))['getDocument']> | null = null;

    void (async () => {
      setStatus('loading');
      setViewport(null);
      try {
        const [pdfjs, pdfLib, response] = await Promise.all([
          import('pdfjs-dist'),
          import('pdf-lib'),
          fetch(pdfUrl, { credentials: 'same-origin' }),
        ]);
        if (!response.ok) throw new Error('Could not load the official form.');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const sourceBytes = await response.arrayBuffer();
        loadingTask = pdfjs.getDocument({ data: sourceBytes.slice(0) });
        const pdfDocument = await loadingTask.promise;
        const formDocument = await pdfLib.PDFDocument.load(sourceBytes.slice(0));
        if (cancelled) {
          await pdfDocument.destroy();
          return;
        }

        const pages = formDocument.getPages();
        const locations: Record<string, FieldLocation> = {};
        for (const field of formDocument.getForm().getFields()) {
          const widget = field.acroField.getWidgets()[0];
          if (!widget) continue;
          const page = pages.findIndex((candidate) => candidate.ref === widget.P()) + 1;
          if (page < 1) continue;
          locations[field.getName()] = { page, ...widget.getRectangle() };
        }

        documentRef.current = pdfDocument;
        setFieldLocations(locations);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
      if (documentRef.current) void documentRef.current.destroy();
      documentRef.current = null;
    };
  }, [pdfUrl]);

  useEffect(() => {
    const pdfDocument = documentRef.current;
    const canvas = canvasRef.current;
    if (!pdfDocument || !canvas || containerWidth <= 0 || status !== 'ready') return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    void (async () => {
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const nextViewport = page.getViewport({ scale: containerWidth / baseViewport.width });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');

      canvas.width = Math.ceil(nextViewport.width * pixelRatio);
      canvas.height = Math.ceil(nextViewport.height * pixelRatio);
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;

      renderTask = page.render({
        canvasContext: context,
        viewport: nextViewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      await renderTask.promise;
      if (!cancelled) setViewport(nextViewport);
    })().catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [containerWidth, pageNumber, status]);

  const highlight = useMemo(() => {
    if (!selectedFieldName || !viewport) return null;
    const location = fieldLocations[selectedFieldName];
    if (!location || location.page !== pageNumber) return null;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
      location.x,
      location.y,
      location.x + location.width,
      location.y + location.height,
    ]);
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.max(8, Math.abs(x2 - x1)),
      height: Math.max(8, Math.abs(y2 - y1)),
    };
  }, [fieldLocations, pageNumber, selectedFieldName, viewport]);

  return (
    <div ref={containerRef} className="relative min-h-[420px] w-full overflow-hidden bg-white">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm font-semibold text-slate-600">
          Loading official form…
        </div>
      )}
      {status === 'error' && (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">The form preview could not load.</p>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="rounded-md bg-[#301D5D] px-4 py-2 text-sm font-bold text-white">
            Open official form
          </a>
        </div>
      )}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Official TREC ${formNumber} page ${pageNumber}`}
        className={status === 'error' ? 'hidden' : 'block max-w-full'}
      />
      {highlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 rounded-sm border-2 border-[#8A5A00] bg-[#FFD966]/45 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
          style={highlight}
        />
      )}
    </div>
  );
}
