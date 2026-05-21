'use client';

// components/InteractiveMagazineReader.tsx
//
// V4 — desktop spread view + viewport-filling layout.
//
// Renders the original PDF directly using pdfjs-dist. On desktop (>= 1024px)
// two pages are shown side-by-side as a spread; on mobile one page at a time.
// Top and bottom chrome float over the spread instead of stacking vertically,
// so the page content uses the full available viewport.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Magazine } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';

interface InteractiveMagazineReaderProps {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
}

type ActionMode = null | 'share' | 'qr' | 'download' | 'email' | 'embed' | 'search';

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_IDX = 1; // 1.0x

const SPREAD_BREAKPOINT_PX = 1024;

// pdfjs types we use
interface PdfJsViewport {
  width: number;
  height: number;
}
interface PdfJsAnnotation {
  url?: string;
  unsafeUrl?: string;
  dest?: unknown;
  rect: [number, number, number, number];
  subtype: string;
}
interface PdfJsTextContent {
  items: Array<{ str?: string }>;
}
interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (ctx: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
  getAnnotations: () => Promise<PdfJsAnnotation[]>;
  getTextContent: () => Promise<PdfJsTextContent>;
}
interface PdfJsDoc {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
}
interface PdfJsLib {
  getDocument: (src: {
    url?: string;
    data?: ArrayBuffer;
    wasmUrl?: string;
    cMapUrl?: string;
    cMapPacked?: boolean;
    standardFontDataUrl?: string;
  }) => { promise: Promise<PdfJsDoc> };
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

interface LinkOverlay {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SearchMatch {
  pageIdx: number;
  snippet: string;
}

// ---- Spread pairing ----
// A spread is one or two pages shown together. zero-indexed page numbers.
// Layout pattern (typical magazine):
//   spread 0 -> [page 0]          (cover, solo)
//   spread 1 -> [page 1, page 2]
//   spread 2 -> [page 3, page 4]
//   spread N -> [last]            (solo if total is even after cover)
interface Spread {
  left: number | null;  // null if solo-right
  right: number | null; // null if solo-left
}

function pageToSpreadIdx(pageIdx: number, spreadMode: boolean): number {
  if (!spreadMode) return pageIdx;
  if (pageIdx === 0) return 0;
  // Pages 1,2 -> spread 1; 3,4 -> spread 2; etc.
  return Math.floor((pageIdx + 1) / 2);
}

function buildSpreads(pageCount: number, spreadMode: boolean): Spread[] {
  if (!spreadMode) {
    return Array.from({ length: pageCount }, (_, i) => ({ left: null, right: i }));
  }
  if (pageCount === 0) return [];
  const spreads: Spread[] = [];
  // Cover spread
  spreads.push({ left: null, right: 0 });
  // Interior spreads — pair up subsequent pages
  let p = 1;
  while (p < pageCount) {
    const left = p;
    const right = p + 1 < pageCount ? p + 1 : null;
    spreads.push({ left, right });
    p += 2;
  }
  return spreads;
}

export default function InteractiveMagazineReader({
  magazine,
  brandColor,
  onClose,
}: InteractiveMagazineReaderProps) {
  const [doc, setDoc] = useState<PdfJsDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(0); // zero-indexed
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [leftOverlays, setLeftOverlays] = useState<LinkOverlay[]>([]);
  const [rightOverlays, setRightOverlays] = useState<LinkOverlay[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<string>('Loading PDF…');
  const [spreadMode, setSpreadMode] = useState(false); // becomes true on desktop
  const [chromeVisible, setChromeVisible] = useState(true);

  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const zoom = ZOOM_LEVELS[zoomIdx];
  const pageCount = doc?.numPages ?? magazine.page_count ?? 0;

  const spreads = buildSpreads(pageCount, spreadMode);
  const currentSpreadIdx = pageToSpreadIdx(currentPage, spreadMode);
  const currentSpread: Spread | undefined = spreads[currentSpreadIdx];

  // ---- Detect spread mode based on viewport ----
  useEffect(() => {
    function update() {
      setSpreadMode(window.innerWidth >= SPREAD_BREAKPOINT_PX);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ---- Load PDF on mount ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoadProgress('Loading PDF reader…');
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        setLoadProgress('Fetching magazine…');
        const task = pdfjs.getDocument({
          url: magazine.reader_url ?? '',
          wasmUrl: `${PDFJS_CDN}/wasm/`,
          cMapUrl: `${PDFJS_CDN}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/`,
        });
        const loaded = await task.promise;
        if (cancelled) return;
        setDoc(loaded);
        trackEvent('flipbook_opened', {
          magazine_id: magazine.id,
          issue_label: magazine.issue_label,
          publication: magazine.publication,
          page_count: loaded.numPages,
          reader: 'interactive_v4',
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'unknown error';
        console.error('[InteractiveMagazineReader] PDF load failed:', msg);
        setLoadError(msg);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [magazine.id, magazine.reader_url, magazine.issue_label, magazine.publication]);

  // ---- Render current spread ----
  useEffect(() => {
    if (!doc || !currentSpread) return;
    let cancelled = false;
    let leftTask: { promise: Promise<void>; cancel?: () => void } | null = null;
    let rightTask: { promise: Promise<void>; cancel?: () => void } | null = null;

    async function renderInto(
      canvas: HTMLCanvasElement | null,
      pageNum: number | null,
      isLeft: boolean,
    ) {
      if (!canvas || pageNum === null) {
        if (isLeft) setLeftOverlays([]);
        else setRightOverlays([]);
        // Collapse the canvas to zero size so the cover-spread side
        // doesn't leave a leftover-sized rectangle visible on screen.
        if (canvas) {
          const c = canvas.getContext('2d');
          if (c) c.clearRect(0, 0, canvas.width, canvas.height);
          canvas.width = 0;
          canvas.height = 0;
          canvas.style.width = '0px';
          canvas.style.height = '0px';
        }
        return;
      }
      try {
        const page = await doc!.getPage(pageNum + 1);
        if (cancelled) return;
        const stage = stageRef.current;
        if (!stage) return;
        const stageH = stage.clientHeight - 16;
        const stageW = stage.clientWidth - 16;
        const natural = page.getViewport({ scale: 1 });
        const aspect = natural.width / natural.height;
        const perPageWidth = spreadMode ? Math.floor((stageW - 8) / 2) : stageW;
        const fitByHeight = stageH * aspect;
        const cssWidth = Math.min(perPageWidth, fitByHeight);
        const cssHeight = cssWidth / aspect;
        const displayWidth = cssWidth * zoom;
        const displayHeight = cssHeight * zoom;
        const displayScale = displayWidth / natural.width;
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const renderScale = displayScale * dpr;
        const renderViewport = page.getViewport({ scale: renderScale });

        // Render offscreen first so the visible canvas keeps showing the
        // previous page until the new one is fully painted. Atomic swap via
        // drawImage eliminates both the blank-canvas gap and the stale-task
        // overwrite race.
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.floor(renderViewport.width);
        offscreen.height = Math.floor(renderViewport.height);
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        const task = page.render({ canvasContext: offCtx, viewport: renderViewport });
        if (isLeft) leftTask = task;
        else rightTask = task;
        await task.promise;
        if (cancelled) return;

        // Atomic visual swap onto the visible canvas.
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(offscreen, 0, 0);

        const annots = await page.getAnnotations();
        if (cancelled) return;
        const overlays: LinkOverlay[] = [];
        for (const a of annots) {
          if (a.subtype !== 'Link') continue;
          const url = a.url || a.unsafeUrl;
          if (!url) continue;
          const [x1, y1, x2, y2] = a.rect;
          const left = Math.min(x1, x2) * displayScale;
          const right = Math.max(x1, x2) * displayScale;
          const top = displayHeight - Math.max(y1, y2) * displayScale;
          const bottom = displayHeight - Math.min(y1, y2) * displayScale;
          overlays.push({ url, x: left, y: top, w: right - left, h: bottom - top });
        }
        if (cancelled) return;
        if (isLeft) setLeftOverlays(overlays);
        else setRightOverlays(overlays);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Cancelled') || msg.includes('cancelled')) return;
        console.error('[InteractiveMagazineReader] render failed:', err);
      }
    }

    renderInto(leftCanvasRef.current, currentSpread.left, true);
    renderInto(rightCanvasRef.current, currentSpread.right, false);

    return () => {
      cancelled = true;
      try { leftTask?.cancel?.(); } catch { /* noop */ }
      try { rightTask?.cancel?.(); } catch { /* noop */ }
    };
  }, [doc, currentSpread, spreadMode, zoom]);

  // Prefetch adjacent spreads' pages so getPage() returns from cache when
  // the user navigates. Pure cache-warming via pdfjs's internal page cache;
  // we do not render or store anything ourselves, so this is safe to misfire.
  useEffect(() => {
    if (!doc || !spreads.length) return;
    let cancelled = false;
    const adj: number[] = [];
    const prev = spreads[currentSpreadIdx - 1];
    const next = spreads[currentSpreadIdx + 1];
    if (prev) {
      if (prev.left !== null) adj.push(prev.left);
      if (prev.right !== null) adj.push(prev.right);
    }
    if (next) {
      if (next.left !== null) adj.push(next.left);
      if (next.right !== null) adj.push(next.right);
    }
    // Stagger with a small delay so the active render gets the main thread
    // first. Yield so the current spread paint finishes before we start
    // warming neighbors.
    const t = setTimeout(() => {
      if (cancelled) return;
      for (const pageIdx of adj) {
        // Fire-and-forget. pdfjs caches the result internally.
        doc.getPage(pageIdx + 1).catch(() => { /* noop */ });
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, currentSpreadIdx, spreads]);

  // ---- Lock body scroll ----
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // ---- Track fullscreen ----
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ---- Keyboard navigation ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (actionMode) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMode, currentPage, pageCount, zoomIdx, spreadMode]);

  // ---- Share URL + QR ----
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/magazine/${magazine.id}`
      : `/magazine/${magazine.id}`;

  useEffect(() => {
    if (actionMode === 'qr' && !qrDataUrl) {
      QRCode.toDataURL(shareUrl, { width: 320, margin: 2 })
        .then(setQrDataUrl)
        .catch((err) => console.error('[InteractiveMagazineReader] QR failed:', err));
    }
  }, [actionMode, qrDataUrl, shareUrl]);

  // ---- Navigation by spread ----
  function goPrev() {
    if (!spreads.length) return;
    const newSpreadIdx = currentSpreadIdx - 1;
    if (newSpreadIdx < 0) return;
    const newSpread = spreads[newSpreadIdx];
    // Land on the "first" page of that spread (left if present, else right).
    const target = newSpread.left ?? newSpread.right ?? 0;
    setCurrentPage(target);
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'prev', reader: 'interactive_v4' });
  }
  function goNext() {
    if (!spreads.length) return;
    const newSpreadIdx = currentSpreadIdx + 1;
    if (newSpreadIdx >= spreads.length) return;
    const newSpread = spreads[newSpreadIdx];
    const target = newSpread.left ?? newSpread.right ?? 0;
    setCurrentPage(target);
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'next', reader: 'interactive_v4' });
  }
  function jumpTo(pageIdx: number) {
    if (pageIdx < 0 || pageIdx >= pageCount) return;
    setCurrentPage(pageIdx);
    trackEvent('flipbook_jump_to', { magazine_id: magazine.id, page: pageIdx, reader: 'interactive_v4' });
  }
  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpInput);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      jumpTo(n - 1);
    }
    setJumpInput('');
  }

  function zoomIn() {
    if (zoomIdx < ZOOM_LEVELS.length - 1) {
      setZoomIdx(zoomIdx + 1);
      trackEvent('flipbook_zoom', { magazine_id: magazine.id, level: ZOOM_LEVELS[zoomIdx + 1], reader: 'interactive_v4' });
    }
  }
  function zoomOut() {
    if (zoomIdx > 0) {
      setZoomIdx(zoomIdx - 1);
      trackEvent('flipbook_zoom', { magazine_id: magazine.id, level: ZOOM_LEVELS[zoomIdx - 1], reader: 'interactive_v4' });
    }
  }
  function zoomReset() {
    setZoomIdx(DEFAULT_ZOOM_IDX);
  }

  async function toggleFullscreen() {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        trackEvent('flipbook_fullscreen', { magazine_id: magazine.id, on: true, reader: 'interactive_v4' });
      } else {
        await document.exitFullscreen();
        trackEvent('flipbook_fullscreen', { magazine_id: magazine.id, on: false, reader: 'interactive_v4' });
      }
    } catch (err) {
      console.error('[InteractiveMagazineReader] fullscreen failed:', err);
    }
  }

  // ---- Search ----
  async function runSearch(query: string) {
    if (!doc) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const results: SearchMatch[] = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items.map((it) => it.str || '').join(' ');
        const lc = text.toLowerCase();
        const idx = lc.indexOf(q);
        if (idx >= 0) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(text.length, idx + q.length + 60);
          const prefix = start > 0 ? '… ' : '';
          const suffix = end < text.length ? ' …' : '';
          results.push({ pageIdx: i - 1, snippet: prefix + text.slice(start, end) + suffix });
        }
      }
      setSearchResults(results);
      trackEvent('flipbook_search', {
        magazine_id: magazine.id,
        query_len: q.length,
        matches: results.length,
        reader: 'interactive_v4',
      });
    } catch (err) {
      console.error('[InteractiveMagazineReader] search failed:', err);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (actionMode !== 'search') return;
    const t = setTimeout(() => {
      runSearch(searchQuery);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, actionMode]);

  // ---- Action handlers ----
  async function handleShare() {
    const shareData = {
      title: magazine.issue_label,
      text: `Read ${magazine.issue_label} from RealtyLine`,
      url: shareUrl,
    };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        trackEvent('flipbook_shared', { magazine_id: magazine.id, channel: 'native' });
        return;
      } catch {
        /* user cancelled */
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        trackEvent('flipbook_shared', { magazine_id: magazine.id, channel: 'copy' });
        setActionMode('share');
        return;
      } catch {
        /* clipboard failed */
      }
    }
    setActionMode('share');
  }
  function handleDownload() {
    trackEvent('flipbook_download_clicked', { magazine_id: magazine.id });
    if (magazine.reader_url) window.open(magazine.reader_url, '_blank', 'noopener,noreferrer');
  }
  function handleEmail() {
    trackEvent('flipbook_email_clicked', { magazine_id: magazine.id });
    const subject = encodeURIComponent(`${magazine.issue_label} from RealtyLine`);
    const body = encodeURIComponent(
      `Thought you'd enjoy this issue:\n\n${shareUrl}\n\n— Sent from RealtyLine`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
  async function handleCopyEmbed() {
    trackEvent('flipbook_embed_copied', { magazine_id: magazine.id });
    const embedCode = `<iframe src="${shareUrl}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(embedCode);
      } catch (err) {
        console.error('[InteractiveMagazineReader] Clipboard write failed:', err);
      }
    }
  }

  // ---- Pan/grab handlers ----
  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).tagName === 'A') return;
    if (!scrollRef.current) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: scrollRef.current.scrollLeft,
      scrollTop: scrollRef.current.scrollTop,
    };
    setIsDragging(true);
    e.preventDefault();
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragStateRef.current || !scrollRef.current) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    scrollRef.current.scrollLeft = dragStateRef.current.scrollLeft - dx;
    scrollRef.current.scrollTop = dragStateRef.current.scrollTop - dy;
  }
  function handleMouseUp() {
    dragStateRef.current = null;
    setIsDragging(false);
  }

  // ---- Render ----
  if (loadError) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center p-6">
        <p className="text-white/80 text-sm mb-3">Couldn&apos;t load this issue.</p>
        <p className="text-white/40 text-xs mb-6">{loadError}</p>
        <button
          onClick={onClose}
          className="px-6 py-3 bg-white/10 text-white text-sm uppercase tracking-wider rounded-md"
        >
          Close
        </button>
      </div>
    );
  }

  // Page label e.g. "2-3 / 11" in spread mode, "3 / 11" in single mode.
  const pageLabel = (() => {
    if (!currentSpread) return '';
    const l = currentSpread.left;
    const r = currentSpread.right;
    if (l !== null && r !== null) return `${l + 1}–${r + 1} / ${pageCount}`;
    const n = (l ?? r ?? 0) + 1;
    return `${n} / ${pageCount}`;
  })();

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-neutral-900 flex flex-col select-none"
    >
      {/* Stage — the page area */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto flex items-center justify-center"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => {
          // Tapping the empty area toggles chrome visibility (mobile friendly).
          // Only fire if click was directly on this element (not bubbled from canvas/link).
          if (e.target === e.currentTarget) {
            setChromeVisible((v) => !v);
          }
        }}
      >
        {!doc ? (
          <p className="text-white/40 text-sm">{loadProgress}</p>
        ) : (
          <div
            ref={stageRef}
            className="flex items-center justify-center gap-2"
            style={{
              minWidth: '100%',
              minHeight: '100%',
              padding: chromeVisible ? '64px 16px' : '16px',
            }}
          >
            {/* Left page (or placeholder for cover) */}
            {currentSpread?.left !== null && currentSpread?.left !== undefined ? (
              <PageCanvas
                canvasRef={leftCanvasRef}
                overlays={leftOverlays}
                pageNum={currentSpread.left}
                trackContext={{ magazine_id: magazine.id, side: 'left' }}
              />
            ) : spreadMode && currentSpread?.right !== null && currentSpread?.right !== 0 ? (
              <div style={{ visibility: 'hidden' }}>
                <canvas style={{ width: 0, height: 0 }} />
              </div>
            ) : null}
            {/* Right page */}
            {currentSpread?.right !== null && currentSpread?.right !== undefined ? (
              <PageCanvas
                canvasRef={rightCanvasRef}
                overlays={rightOverlays}
                pageNum={currentSpread.right}
                trackContext={{ magazine_id: magazine.id, side: 'right' }}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Top chrome — floating */}
      {chromeVisible && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 z-10"
          style={{ background: `linear-gradient(to bottom, ${brandColor}EE, ${brandColor}00)` }}
        >
          <button onClick={onClose} aria-label="Close" className="text-white p-1.5 -ml-1.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="text-center flex-1 px-2 flex items-baseline justify-center gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/90 font-medium">{magazine.issue_label}</p>
            <span className="text-[10px] text-white/60">
              {doc ? pageLabel : loadProgress}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setActionMode('search')} aria-label="Search" className="text-white/80 hover:text-white p-1.5" title="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <button onClick={zoomOut} disabled={zoomIdx === 0} aria-label="Zoom out" className="text-white/80 hover:text-white p-1.5 disabled:opacity-30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3M8 11h6" />
              </svg>
            </button>
            <button onClick={zoomReset} aria-label={`Zoom ${zoom}x — click to reset`} className="text-white/80 hover:text-white px-2 text-[10px] uppercase tracking-wider">
              {zoom}x
            </button>
            <button onClick={zoomIn} disabled={zoomIdx === ZOOM_LEVELS.length - 1} aria-label="Zoom in" className="text-white/80 hover:text-white p-1.5 disabled:opacity-30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
              </svg>
            </button>
            <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="text-white/80 hover:text-white p-1.5" title="Fullscreen (F)">
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v4H4M16 3v4h4M8 21v-4H4M16 21v-4h4" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Side arrows — floating, vertically centered */}
      {chromeVisible && doc && (
        <>
          <button
            onClick={goPrev}
            disabled={currentSpreadIdx === 0}
            aria-label="Previous spread"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white/90 hover:bg-black/70 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center backdrop-blur"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={goNext}
            disabled={currentSpreadIdx >= spreads.length - 1}
            aria-label="Next spread"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-black/50 text-white/90 hover:bg-black/70 disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center backdrop-blur"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom chrome — floating */}
      {chromeVisible && (
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col items-center z-10"
          style={{ background: `linear-gradient(to top, ${brandColor}EE, ${brandColor}00)` }}
        >
          {/* Page jump input */}
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-2 pt-3 pb-2">
            <input
              type="number"
              min={1}
              max={pageCount || 1}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder={`${currentPage + 1}`}
              className="w-16 bg-black/40 text-white text-center text-sm rounded px-2 py-1 placeholder-white/40 border border-white/20 backdrop-blur"
              aria-label="Jump to page"
            />
            <span className="text-xs text-white/70">of {pageCount || '…'}</span>
          </form>
          {/* Action row */}
          <div className="flex items-center justify-around w-full max-w-xl px-2 pb-2">
            <ActionButton label="Share" onClick={handleShare} icon={ICONS.share} />
            <ActionButton label="QR" onClick={() => setActionMode('qr')} icon={ICONS.qr} />
            <ActionButton label="Download" onClick={handleDownload} icon={ICONS.download} />
            <ActionButton label="Email" onClick={handleEmail} icon={ICONS.email} />
            <ActionButton label="Embed" onClick={() => setActionMode('embed')} icon={ICONS.embed} />
          </div>
        </div>
      )}

      {/* Popups */}
      {actionMode === 'qr' && (
        <ActionPopup title="Scan to share" onClose={() => setActionMode(null)}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code" className="w-64 h-64 mx-auto bg-white p-2 rounded-lg" />
          ) : (
            <div className="w-64 h-64 mx-auto bg-white/5 animate-pulse rounded-lg" />
          )}
          <p className="text-xs text-white/60 text-center mt-3 break-all">{shareUrl}</p>
        </ActionPopup>
      )}
      {actionMode === 'share' && (
        <ActionPopup title="Link copied" onClose={() => setActionMode(null)}>
          <p className="text-sm text-white/80 text-center break-all">{shareUrl}</p>
          <p className="text-xs text-white/40 text-center mt-2">Paste anywhere to share.</p>
        </ActionPopup>
      )}
      {actionMode === 'embed' && (
        <ActionPopup title="Embed code" onClose={() => setActionMode(null)}>
          <pre className="text-xs text-white/80 bg-white/5 p-3 overflow-x-auto whitespace-pre-wrap break-all">{`<iframe src="${shareUrl}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`}</pre>
          <button onClick={handleCopyEmbed} className="mt-3 w-full py-2.5 bg-white/10 text-white text-sm uppercase tracking-wider">
            Copy Embed Code
          </button>
        </ActionPopup>
      )}
      {actionMode === 'search' && (
        <ActionPopup title="Search this issue" onClose={() => setActionMode(null)}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full bg-white/10 text-white text-sm rounded px-3 py-2 placeholder-white/40 border border-white/20"
            autoFocus
          />
          <div className="mt-3 max-h-64 overflow-y-auto">
            {searching ? (
              <p className="text-xs text-white/40">Searching…</p>
            ) : searchQuery.trim().length < 2 ? (
              <p className="text-xs text-white/40">Type at least 2 characters.</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-white/40">No matches.</p>
            ) : (
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <li key={r.pageIdx}>
                    <button
                      onClick={() => {
                        setActionMode(null);
                        jumpTo(r.pageIdx);
                      }}
                      className="w-full text-left p-2 bg-white/5 hover:bg-white/10 rounded text-xs"
                    >
                      <p className="text-white/90 font-semibold">Page {r.pageIdx + 1}</p>
                      <p className="text-white/60 mt-0.5">{r.snippet}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ActionPopup>
      )}
    </div>
  );
}

// ---- Subcomponents ----

interface PageCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlays: LinkOverlay[];
  pageNum: number;
  trackContext: { magazine_id: number; side: string };
}

function PageCanvas({ canvasRef, overlays, pageNum, trackContext }: PageCanvasProps) {
  return (
    <div className="relative inline-block shadow-2xl">
      <canvas ref={canvasRef} className="block bg-white" />
      {overlays.map((o, i) => (
        <a
          key={i}
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute hover:bg-blue-400/20 focus:bg-blue-400/30 transition-colors"
          style={{
            left: `${o.x}px`,
            top: `${o.y}px`,
            width: `${o.w}px`,
            height: `${o.h}px`,
          }}
          onClick={() =>
            trackEvent('flipbook_link_clicked', {
              ...trackContext,
              page: pageNum + 1,
              url: o.url,
              reader: 'interactive_v4',
            })
          }
          aria-label={`Open link: ${o.url}`}
        />
      ))}
    </div>
  );
}

const ICONS = {
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h2v2h-2z M18 14h3v3h-3z M14 18h2v3h-2z M18 18h3v3h-3z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  email: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  embed: 'm16 18 6-6-6-6 M8 6l-6 6 6 6',
};

function ActionButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 px-2 py-1 text-white/90 hover:text-white" aria-label={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );
}

function ActionPopup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[61] bg-black/80 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-black border border-white/20 max-w-sm w-full p-6 rounded" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm uppercase tracking-[0.2em] text-white/80 font-medium">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
