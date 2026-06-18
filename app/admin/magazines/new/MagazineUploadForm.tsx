'use client';

// app/admin/magazines/new/MagazineUploadForm.tsx
//
// New magazine upload — upload-first, then DB-create.
//
// Two page-source modes:
//   1. Render from PDF (default) — browser uses pdfjs-dist to render each
//      PDF page to a canvas, exports as JPEG, uploads to Vercel Blob.
//      Admin only needs cover + PDF; no manual JPEG export.
//   2. Manual JPEG selection — admin uploads pre-exported per-page JPEGs.
//      Fallback when the PDF has unrenderable content or admin wants
//      pixel-perfect control.
//
// Flow:
//   1. Admin fills metadata + selects cover + PDF (and/or page images)
//   2. Submit:
//      a. Upload cover to magazine-staging/{stagingId}/
//      b. Upload PDF (optional) to magazine-staging/{stagingId}/
//      c. Render or upload page images to magazine-staging/{stagingId}/
//      d. Extract per-page text from PDF (optional, non-fatal failure)
//      e. POST /api/admin/magazines with all URLs to create the row
//   3. Redirect to /admin/magazines on success

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import MagazineDropZone from '@/components/MagazineDropZone';

import PageTitle from '@/components/ui/PageTitle';
type Pub = 'austin' | 'san_antonio';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface StepState {
  label: string;
  status: StepStatus;
  detail?: string;
}

type PageSource = 'pdf-render' | 'manual';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// pdfjs-dist types we use
interface PdfJsViewport {
  width: number;
  height: number;
}
interface PdfJsTextItem {
  str: string;
  // pdfjs returns additional fields (transform, width, height, dir, fontName)
  // but we only need str to concatenate page text.
}
interface PdfJsTextContent {
  items: PdfJsTextItem[];
}
interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (ctx: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => { promise: Promise<void> };
  getTextContent: () => Promise<PdfJsTextContent>;
}
interface PdfJsDoc {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
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
  version: string;
}

// pdfjs CDN base for ancillary assets (worker, wasm, cMaps, fonts).
// unpkg mirrors npm exactly, so whatever pdfjs-dist version is installed,
// the file URLs match without hardcoding a version constant.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFJS_VERSION: string = require('pdfjs-dist/package.json').version;
const PDFJS_CDN = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

export default function MagazineUploadForm() {
  const router = useRouter();

  const now = new Date();
  const [publication, setPublication] = useState<Pub>('austin');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [issueLabel, setIssueLabel] = useState<string>('');
  const [sortDate, setSortDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
  );

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageFiles, setPageFiles] = useState<File[]>([]);
  const [pageSource, setPageSource] = useState<PageSource>('pdf-render');
  const [renderDpi, setRenderDpi] = useState<number>(150);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sortedPageFiles = useMemo(() => {
    return [...pageFiles].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }, [pageFiles]);

  function updateStep(idx: number, patch: Partial<StepState>) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function validate(): string | null {
    if (!issueLabel.trim()) return 'Issue label is required.';
    if (!coverFile) return 'Cover image is required.';
    if (year < 2000 || year > 2100) return 'Year must be 2000–2100.';
    if (month < 1 || month > 12) return 'Month must be 1–12.';
    if (pageSource === 'pdf-render' && !pdfFile) {
      return 'PDF is required when rendering pages from PDF.';
    }
    if (pageSource === 'manual' && pageFiles.length === 0) {
      return 'At least one page image is required (or switch to "Render from PDF").';
    }
    return null;
  }

  // Generate a staging id used for the magazine-staging/{id}/ pathname.
  function makeStagingId(): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${ts}-${rand}`;
  }

  // Load pdfjs-dist as a dynamic import. Worker is loaded from cdnjs (a
  // separate URL strategy that works reliably for individual files even when
  // the cdnjs full-module mjs imports were failing earlier in this session).
  async function loadPdfJs(): Promise<PdfJsLib> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs' as any)) as unknown as PdfJsLib;
    mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
    return mod;
  }

  // Extract per-page text from a PDF File using pdfjs in the browser.
  // We previously POSTed to /api/admin/magazines/extract-text but that route
  // never existed — Next.js returned 405 for it. Doing extraction client-side
  // keeps everything in-browser (no server CPU, no extra round-trip) and uses
  // the same pdfjs we already load for cover/page rendering.
  async function extractPdfText(
    file: File,
    onProgress: (pageNum: number, total: number) => void,
  ): Promise<string[]> {
    const pdfjs = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({
      data: buf,
      wasmUrl: `${PDFJS_CDN}/wasm/`,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
    }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
      pages.push(text);
      onProgress(i, doc.numPages);
    }
    return pages;
  }

  // Render a PDF File to N JPEG Blobs (one per page).
  async function renderPdfToImages(
    file: File,
    dpi: number,
    onProgress: (pageNum: number, total: number) => void,
  ): Promise<Blob[]> {
    const pdfjs = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({
      data: buf,
      // wasmUrl: required for PDFs that use JBig2 or CCITTFax compression.
      // cMapUrl / standardFontDataUrl: fallbacks for non-embedded fonts.
      wasmUrl: `${PDFJS_CDN}/wasm/`,
      cMapUrl: `${PDFJS_CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
    }).promise;
    const scale = dpi / 72; // PDF native is 72dpi
    const out: Blob[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
          'image/jpeg',
          0.85,
        );
      });
      out.push(blob);
      onProgress(i, doc.numPages);
      // Free canvas memory between pages (helps iOS Safari).
      canvas.width = 0;
      canvas.height = 0;
    }
    return out;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setRunning(true);
    const stagingId = makeStagingId();

    const stepList: StepState[] = [
      { label: 'Upload cover image', status: 'pending' },
      ...(pdfFile ? [{ label: 'Upload PDF', status: 'pending' as StepStatus }] : []),
      {
        label:
          pageSource === 'pdf-render'
            ? `Render pages from PDF (${renderDpi} DPI)`
            : `Upload ${sortedPageFiles.length} page image(s)`,
        status: 'pending',
      },
      { label: 'Upload page images', status: 'pending' },
      ...(pdfFile ? [{ label: 'Extract page text from PDF', status: 'pending' as StepStatus }] : []),
      { label: 'Create magazine record', status: 'pending' },
    ];
    setSteps(stepList);
    let stepIdx = 0;

    // Step: cover
    updateStep(stepIdx, { status: 'running' });
    let coverUrl: string;
    try {
      const blob = await upload(`magazine-staging/${stagingId}/${coverFile!.name}`, coverFile!, {
        access: 'public',
        handleUploadUrl: '/api/admin/magazines/upload-token',
      });
      coverUrl = blob.url;
      updateStep(stepIdx, { status: 'done' });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(stepIdx, { status: 'error', detail: msg });
      setError(`Cover upload failed: ${msg}`);
      setRunning(false);
      return;
    }
    stepIdx++;

    // Step: PDF (optional)
    let pdfUrl: string | null = null;
    if (pdfFile) {
      updateStep(stepIdx, { status: 'running' });
      try {
        const blob = await upload(`magazine-staging/${stagingId}/${pdfFile.name}`, pdfFile, {
          access: 'public',
          handleUploadUrl: '/api/admin/magazines/upload-token',
          multipart: true,
        });
        pdfUrl = blob.url;
        updateStep(stepIdx, { status: 'done' });
      } catch (err: unknown) {
        const msg = errMessage(err);
        updateStep(stepIdx, { status: 'error', detail: msg });
        setError(`PDF upload failed: ${msg}`);
        setRunning(false);
        return;
      }
      stepIdx++;
    }

    // Step: produce page-image Blobs (either rendered from PDF or from manual files)
    updateStep(stepIdx, { status: 'running' });
    let pageBlobs: { name: string; data: Blob }[] = [];
    try {
      if (pageSource === 'pdf-render') {
        const blobs = await renderPdfToImages(pdfFile!, renderDpi, (n, total) => {
          updateStep(stepIdx, { status: 'running', detail: `${n} / ${total}` });
        });
        pageBlobs = blobs.map((b, i) => ({
          name: `page-${String(i + 1).padStart(3, '0')}.jpg`,
          data: b,
        }));
      } else {
        pageBlobs = sortedPageFiles.map((f) => ({ name: f.name, data: f }));
      }
      updateStep(stepIdx, { status: 'done', detail: `${pageBlobs.length} page(s)` });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(stepIdx, { status: 'error', detail: msg });
      setError(`Page generation failed: ${msg}`);
      setRunning(false);
      return;
    }
    stepIdx++;

    // Step: upload page images
    updateStep(stepIdx, { status: 'running' });
    const pageUrls: string[] = [];
    for (let i = 0; i < pageBlobs.length; i++) {
      const { name, data } = pageBlobs[i];
      try {
        const blob = await upload(`magazine-staging/${stagingId}/${name}`, data, {
          access: 'public',
          handleUploadUrl: '/api/admin/magazines/upload-token',
        });
        pageUrls.push(blob.url);
        updateStep(stepIdx, {
          status: 'running',
          detail: `${i + 1} / ${pageBlobs.length}`,
        });
      } catch (err: unknown) {
        const msg = errMessage(err);
        updateStep(stepIdx, {
          status: 'error',
          detail: `failed on page ${i + 1}: ${msg}`,
        });
        setError(`Page upload failed on page ${i + 1}: ${msg}`);
        setRunning(false);
        return;
      }
    }
    updateStep(stepIdx, { status: 'done', detail: `${pageUrls.length} pages uploaded` });
    stepIdx++;

    // Step: extract text (only if PDF was uploaded). Done client-side via
    // pdfjs so it works even when the file lives only in browser memory and
    // doesn't require a server endpoint.
    let pageTexts: string[] | null = null;
    if (pdfFile) {
      updateStep(stepIdx, { status: 'running' });
      try {
        pageTexts = await extractPdfText(pdfFile, (n, total) => {
          updateStep(stepIdx, { status: 'running', detail: `${n} / ${total}` });
        });
        updateStep(stepIdx, {
          status: 'done',
          detail: `${pageTexts.length} pages extracted`,
        });
      } catch (err: unknown) {
        const msg = errMessage(err);
        updateStep(stepIdx, {
          status: 'error',
          detail: `${msg} (continuing without search)`,
        });
        pageTexts = null;
      }
      stepIdx++;
    }

    // Step: create magazine record
    updateStep(stepIdx, { status: 'running' });
    let createdId: number;
    try {
      const createBody: Record<string, unknown> = {
        publication,
        year,
        month,
        issue_label: issueLabel.trim(),
        sort_date: sortDate,
        cover_url: coverUrl,
        page_urls: pageUrls,
        page_count: pageUrls.length,
      };
      if (pdfUrl) createBody.reader_url = pdfUrl;
      if (pageTexts) createBody.page_texts = pageTexts;
      const r = await fetch('/api/admin/magazines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        // Prefer the actionable `error` message from the API, then fall back
        // to `detail` (raw pg error) so the user always sees *something*
        // specific instead of "create failed (500)".
        const apiMsg: string =
          (typeof body.error === 'string' && body.error) ||
          (typeof body.detail === 'string' && body.detail) ||
          `create failed (${r.status})`;
        throw new Error(apiMsg);
      }
      const data = await r.json();
      createdId = data.magazine.id;
      updateStep(stepIdx, { status: 'done', detail: `id=${createdId}` });
    } catch (err: unknown) {
      const msg = errMessage(err);
      updateStep(stepIdx, { status: 'error', detail: msg });
      setError(`${msg} (files uploaded to magazine-staging/${stagingId}/ but no DB row was created)`);
      setRunning(false);
      return;
    }

    setTimeout(() => router.push('/admin/magazines'), 800);
  }

  // __DROPZONE_HANDLER_V2__
  // Called by MagazineDropZone when a PDF is dropped and the cover has been
  // auto-rendered from page 1. Sets pdf, cover, and any metadata parsed from
  // the filename (e.g. "RealtyLine May 2026.pdf" -> year=2026, month=5).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleDropZoneFiles(result: any) {
    setPdfFile(result.pdfFile);
    setCoverFile(result.coverFile);
    if (result.parsed?.label) setIssueLabel(result.parsed.label);
    if (result.parsed?.year) setYear(result.parsed.year);
    if (result.parsed?.month) setMonth(result.parsed.month);
    if (result.parsed?.year && result.parsed?.month) {
      setSortDate(`${result.parsed.year}-${String(result.parsed.month).padStart(2, '0')}-01`);
    }
  }
  function handleDropZoneReset() {
    setPdfFile(null);
    setCoverFile(null);
    setIssueLabel('');
    setYear(0);
    setMonth(0);
    setSortDate('');
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/admin/magazines" className="text-sm text-blue-600 hover:underline">
            ← Back to magazines
          </Link>
          <PageTitle size="md">New Magazine Issue</PageTitle>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-6 space-y-5">
      {/* __DROPZONE_JSX_INSERTED__ */}
      <div className="mb-6">
        <MagazineDropZone
          onFilesReady={handleDropZoneFiles}
          onReset={handleDropZoneReset}
          hasFiles={!!coverFile && !!pdfFile}
          stagedFilename={pdfFile?.name}
        />
      </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Publication</label>
            <select
              value={publication}
              onChange={(e) => setPublication(e.target.value as Pub)}
              disabled={running}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            >
              <option value="austin">RealtyLine Austin</option>
              <option value="san_antonio">Newsline San Antonio</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={running}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={running}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2020, i, 1).toLocaleString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issue label</label>
            <input
              type="text"
              value={issueLabel}
              onChange={(e) => setIssueLabel(e.target.value)}
              disabled={running}
              placeholder="e.g. May 2026"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort date (controls feed order)</label>
            <input
              type="date"
              value={sortDate}
              onChange={(e) => setSortDate(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cover image</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              disabled={running}
              className="block w-full text-sm"
            />
            {coverFile && (
              <p className="text-xs text-gray-500 mt-1">{coverFile.name} ({Math.round(coverFile.size / 1024)} KB)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              disabled={running}
              className="block w-full text-sm"
            />
            {pdfFile && (
              <p className="text-xs text-gray-500 mt-1">{pdfFile.name} ({Math.round(pdfFile.size / 1024 / 1024)} MB)</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Used for both in-issue text search AND, when selected below, as the source for page images.
            </p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Page images</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pageSource"
                  value="pdf-render"
                  checked={pageSource === 'pdf-render'}
                  onChange={() => setPageSource('pdf-render')}
                  disabled={running}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-gray-900">Render from PDF (recommended)</p>
                  <p className="text-xs text-gray-500">
                    Each PDF page rendered to a JPEG in your browser. No separate image upload needed.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pageSource"
                  value="manual"
                  checked={pageSource === 'manual'}
                  onChange={() => setPageSource('manual')}
                  disabled={running}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-gray-900">Upload pre-exported page images</p>
                  <p className="text-xs text-gray-500">
                    For when you want pixel-perfect control or the PDF doesn&apos;t render cleanly.
                  </p>
                </div>
              </label>
            </div>

            {pageSource === 'pdf-render' && (
              <div className="mt-3 pl-6">
                <label className="block text-xs font-medium text-gray-700 mb-1">Render DPI</label>
                <select
                  value={renderDpi}
                  onChange={(e) => setRenderDpi(Number(e.target.value))}
                  disabled={running}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900"
                >
                  <option value={100}>100 DPI (small, fast)</option>
                  <option value={150}>150 DPI (recommended)</option>
                  <option value={200}>200 DPI (high)</option>
                  <option value={300}>300 DPI (print-quality, large)</option>
                </select>
              </div>
            )}

            {pageSource === 'manual' && (
              <div className="mt-3 pl-6">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setPageFiles(e.target.files ? Array.from(e.target.files) : [])}
                  disabled={running}
                  className="block w-full text-sm"
                />
                {pageFiles.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {pageFiles.length} file(s) selected · sorted by filename
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={running}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium text-sm disabled:opacity-50"
            >
              {running ? 'Uploading…' : 'Create Issue'}
            </button>
          </div>

          {steps.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4 space-y-1.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <StatusDot status={s.status} />
                  <span className={s.status === 'error' ? 'text-red-700' : 'text-gray-700'}>{s.label}</span>
                  {s.detail && (
                    <span className={`text-xs ${s.status === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
                      · {s.detail}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === 'done') return <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />;
  if (status === 'running') return <span className="w-3 h-3 rounded-full bg-blue-500 inline-block animate-pulse" />;
  if (status === 'error') return <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />;
  return <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />;
}
