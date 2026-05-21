'use client';

// components/MagazineDropZone.tsx
//
// Drop zone for magazine PDF (and optional cover image). On drop:
//   1. Parses the filename for year/month/label (e.g. "RealtyLine May 2026.pdf"
//      → label="May 2026", year=2026, month=5)
//   2. Reads the first page of the PDF and renders it to JPEG for the cover
//   3. Hands all data to the parent via onFilesReady — parent still owns the
//      upload pipeline, this is just a fancier file picker
//
// Doesn't modify the parent form's upload logic. If user uses the existing
// "Choose File" inputs, that path still works exactly as before.

import { useCallback, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFJS_VERSION: string = require('pdfjs-dist/package.json').version;
const PDFJS_CDN = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

interface PdfJsViewport { width: number; height: number }
interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (ctx: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => { promise: Promise<void> };
}
interface PdfJsDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
}
interface PdfJsLib {
  getDocument: (src: {
    data: ArrayBuffer;
    wasmUrl?: string;
    cMapUrl?: string;
    cMapPacked?: boolean;
    standardFontDataUrl?: string;
  }) => { promise: Promise<PdfJsDoc> };
  GlobalWorkerOptions: { workerSrc: string };
}

let _pdfjsCache: PdfJsLib | null = null;
async function loadPdfJs(): Promise<PdfJsLib> {
  if (_pdfjsCache) return _pdfjsCache;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJsLib;
  mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
  _pdfjsCache = mod;
  return mod;
}

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseFilename(filename: string): { label: string; year?: number; month?: number } {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, '');
  // Look for "Month Year" or "Month-Year" or "Month_Year" pattern (case-insensitive)
  const m = base.match(/([A-Za-z]+)[\s_-]+(\d{4})/);
  if (!m) {
    // Couldn't parse — return filename as label so user can see it
    return { label: base };
  }
  const monthName = m[1].toLowerCase();
  const year = Number(m[2]);
  const month = MONTH_LOOKUP[monthName];
  if (!month || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { label: base };
  }
  // Build a clean "Month Year" label (proper case)
  const monthProper = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  const label = `${monthProper} ${year}`;
  return { label, year, month };
}

interface DropResult {
  pdfFile: File;
  coverFile: File;
  pageCount: number;
  parsed: { label: string; year?: number; month?: number };
}

interface Props {
  /** Called after a successful drop + first-page render. */
  onFilesReady: (result: DropResult) => void;
  /** Called when the user clicks "Reset" to start over. */
  onReset: () => void;
  /** Whether the parent already has files staged (controls visible state). */
  hasFiles: boolean;
  /** Filename of the currently-staged PDF (shown when hasFiles is true). */
  stagedFilename?: string;
}

export default function MagazineDropZone({
  onFilesReady,
  onReset,
  hasFiles,
  stagedFilename,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        setError('That file is not a PDF.');
        return;
      }
      setBusy(true);
      try {
        setProgress('Reading PDF…');
        const buf = await file.arrayBuffer();
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({
          data: buf,
          wasmUrl: `${PDFJS_CDN}/wasm/`,
          cMapUrl: `${PDFJS_CDN}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
        }).promise;
        setProgress(`Rendering cover from page 1 of ${doc.numPages}…`);
        const page = await doc.getPage(1);
        // Render at 150 DPI equivalent for the cover.
        const scale = 150 / 72;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
        );
        if (!blob) throw new Error('Cover JPEG render failed');
        const coverFilename = file.name.replace(/\.[^.]+$/, '') + '_cover.jpg';
        const coverFile = new File([blob], coverFilename, { type: 'image/jpeg' });
        const parsed = parseFilename(file.name);
        onFilesReady({
          pdfFile: file,
          coverFile,
          pageCount: doc.numPages,
          parsed,
        });
        setProgress('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error('[MagazineDropZone] failed:', msg);
        setError(`Couldn't read that PDF: ${msg}`);
      } finally {
        setBusy(false);
      }
    },
    [onFilesReady],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const pdf = files.find((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) {
      setError('Drop a PDF file.');
      return;
    }
    handleFile(pdf);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function handlePickClick() {
    inputRef.current?.click();
  }
  function handlePickChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    // Reset so the same file can be re-picked if needed
    e.target.value = '';
  }
  function handleReset() {
    setError(null);
    setProgress('');
    onReset();
  }

  // ---- Rendered state when files are already staged ----
  if (hasFiles && stagedFilename) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-900">PDF ready</p>
            <p className="text-xs text-emerald-700">{stagedFilename}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-emerald-700 hover:text-emerald-900 underline"
        >
          Use a different PDF
        </button>
      </div>
    );
  }

  // ---- Drop zone state ----
  return (
    <div>
      <button
        type="button"
        onClick={handlePickClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : busy
              ? 'border-blue-300 bg-blue-50/50 cursor-wait'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50 cursor-pointer'
        }`}
        disabled={busy}
      >
        {busy ? (
          <div>
            <div className="w-10 h-10 mx-auto mb-3 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-700">{progress || 'Processing…'}</p>
          </div>
        ) : (
          <div>
            <svg
              className="w-10 h-10 mx-auto mb-3 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-base font-medium text-gray-700 mb-1">
              Drop a PDF here
            </p>
            <p className="text-xs text-gray-500">
              or <span className="text-blue-600 underline">click to choose a file</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-3">
              We&apos;ll read the cover from page 1 and fill in the issue label automatically.
            </p>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handlePickChange}
        className="hidden"
      />
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
