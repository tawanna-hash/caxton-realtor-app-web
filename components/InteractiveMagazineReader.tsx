'use client';

// components/InteractiveMagazineReader.tsx
//
// V5 — desktop spread view + viewport-filling layout + mobile gestures + a11y.
//
// Renders the original PDF directly using pdfjs-dist. On desktop (>= 1024px)
// two pages are shown side-by-side as a spread; on mobile one page at a time.
// Top and bottom chrome float over the spread instead of stacking vertically,
// so the page content uses the full available viewport.
//
// V5 changes over V4:
// - Memoized spreads/currentSpread so the render effect only re-runs on
//   actual spread changes (not on every parent re-render). This fixes the
//   stale-page bug where the right canvas could get stuck on a neighbor.
// - Per-side latest-page guard refs as a second layer of defense.
// - DPR capped at 2 (was forced minimum 2) for ~2x mobile perf win.
// - Bitmap dims rounded-md and CSS dims derived from them, no sub-pixel blur.
// - Touch gestures: swipe to nav, pinch to zoom, double-tap to toggle zoom,
//   one-finger drag to pan when zoomed in. Single tap (no drag) toggles chrome.
// - Focus trap + focus restore + role=dialog + aria-modal + aria-live page
//   announcer for accessibility.
// - prefers-reduced-motion respected (no zoom animations).
// - currentPage clamped on spread-mode change so orientation flips never land
//   on an out-of-range spread.
// - reader_url validated before fetch.

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import type { Magazine } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';
import HotspotLayer from './HotspotLayer';
import type { PublicHotspot } from '@/lib/hotspots';

// ---- Phase 6 (Option C): PDF-annotation link click tracking ----
// PDF link annotations render as overlay <a> tags in PageCanvas. Those are a
// separate click surface from HotspotLayer and were never tracked, so clicks on
// designer-embedded InDesign links never reached magazine_hotspot_clicks. We
// match each overlay link to its page's hotspot by normalized URL and fire the
// same beacon HotspotLayer uses.
const MZ_SESSION_COOKIE = 'mz_session';
const MZ_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function mzGetOrCreateSessionId(): string {
  if (typeof document === 'undefined') return '';
  const existing = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${MZ_SESSION_COOKIE}=`));
  if (existing) return existing.split('=')[1];
  const id = 'sx_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  document.cookie = `${MZ_SESSION_COOKIE}=${id}; path=/; max-age=${MZ_SESSION_MAX_AGE}; samesite=lax`;
  return id;
}

function trackHotspotClick(hotspotId: number): void {
  const sessionId = mzGetOrCreateSessionId();
  if (!sessionId) return;
  const payload = JSON.stringify({ session_id: sessionId });
  const url = `/api/hotspots/${hotspotId}/click`;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    } catch {
      /* fall through to fetch */
    }
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => { /* noop */ });
}

// Normalize for loose matching: lowercase, drop protocol, leading www., and
// trailing slash. Keeps path + query so UTM-tagged links stay distinct.
function mzNormalizeUrl(u: string): string {
  return (u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

// Match a PDF overlay URL to a hotspot (already filtered to this page).
// Tries config.url then config.tracking_url for link hotspots, and url for mls.
function matchHotspotByUrl(
  overlayUrl: string,
  pageHotspots: PublicHotspot[],
): PublicHotspot | null {
  const target = mzNormalizeUrl(overlayUrl);
  if (!target) return null;
  for (const h of pageHotspots) {
    if (h.config.type === 'link') {
      if (mzNormalizeUrl(h.config.url) === target) return h;
      if (h.config.tracking_url && mzNormalizeUrl(h.config.tracking_url) === target) return h;
    } else if (h.config.type === 'mls') {
      if (mzNormalizeUrl(h.config.url) === target) return h;
    }
  }
  return null;
}
// ---- end Phase 6 (Option C) helpers ----


interface InteractiveMagazineReaderProps {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
  /** Optional handler for the reader's "home" link in the top chrome. Defaults to window.location.assign('/'). */
  onHome?: () => void;
}

type ActionMode = null | 'share' | 'qr' | 'download' | 'email' | 'embed' | 'search';

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2, 3];
// Desktop opens at 75% so the full spread fits without scrolling; mobile keeps
// 100% so pages fill the narrow viewport.
const DEFAULT_ZOOM_IDX_DESKTOP = 0; // 0.75x
const DEFAULT_ZOOM_IDX_MOBILE = 1;  // 1.0x
const SPREAD_BREAKPOINT_PX = 1024;

/** Pick the initial/reset zoom level for the current viewport. SSR-safe. */
function getDefaultZoomIdx(): number {
  if (typeof window === 'undefined') return DEFAULT_ZOOM_IDX_MOBILE;
  return window.innerWidth >= SPREAD_BREAKPOINT_PX
    ? DEFAULT_ZOOM_IDX_DESKTOP
    : DEFAULT_ZOOM_IDX_MOBILE;
}
const SWIPE_THRESHOLD_PX = 50;       // min horizontal swipe to count as page nav
const TAP_MAX_MOVE_PX = 10;          // movement above this = not a tap
const TAP_MAX_DURATION_MS = 300;     // press above this = not a tap
const DOUBLE_TAP_WINDOW_MS = 300;    // taps within this = double-tap

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

// ---- prefers-reduced-motion hook ----
function usePrefersReducedMotion(): boolean {
  // Initialize from the media query directly so we don't need a setState
  // inside an effect (which would cascade renders and fail strict lint).
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export default function InteractiveMagazineReader({
  magazine,
  brandColor,
  onClose,
  onHome,
}: InteractiveMagazineReaderProps) {
  const handleHome = () => {
    if (onHome) {
      onHome();
      return;
    }
    onClose();
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };
  const [doc, setDoc] = useState<PdfJsDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(0); // zero-indexed
  const [zoomIdx, setZoomIdx] = useState<number>(() => getDefaultZoomIdx());
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
  const [isDragging, setIsDragging] = useState(false);
  // Grab tool toggle. When ON: cursor is always grab/grabbing, text-layer
  // selection is suppressed, and links are click-through-only (no drag-to-
  // select). When OFF: dragging still pans (existing behavior) but the user
  // can also select text and follow links normally. Defaults to ON so the
  // moment a user zooms in they can immediately drag to explore the page.
  const [grabActive, setGrabActive] = useState(true);

  // Hotspots fetched once on mount. Filtered per-page in the render below.
  const [hotspots, setHotspots] = useState<PublicHotspot[]>([]);
  // Track the actual rendered canvas sizes so HotspotLayer can position
  // overlays in pixel space. Updated by the render effect after each paint.
  const [leftCanvasSize, setLeftCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [rightCanvasSize, setRightCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generation guards — paints check these before committing, so a stale
  // render that completes after navigation can't overwrite a fresh page.
  const leftLatestPageRef = useRef<number | null>(null);
  const rightLatestPageRef = useRef<number | null>(null);

  // Mouse pan state (existing).
  const dragStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Touch gesture state.
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
    // Pinch
    pinching: boolean;
    pinchStartDistance: number;
    pinchStartZoomIdx: number;
  } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  // Focus restore — remember what was focused when the reader opened.
  const triggerFocusRef = useRef<HTMLElement | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  const zoom = ZOOM_LEVELS[zoomIdx];
  const pageCount = doc?.numPages ?? magazine.page_count ?? 0;

  // ---- Memoized derived values ----
  // CRITICAL: these used to be recomputed every render, creating new object
  // references that re-triggered the render effect on every state change
  // anywhere in the component. That cancelled in-flight renders constantly
  // and was the root cause of the stale-page bug.
  const spreads = useMemo(
    () => buildSpreads(pageCount, spreadMode),
    [pageCount, spreadMode],
  );
  const currentSpreadIdx = useMemo(
    () => Math.min(pageToSpreadIdx(currentPage, spreadMode), Math.max(spreads.length - 1, 0)),
    [currentPage, spreadMode, spreads.length],
  );
  const currentSpread: Spread | undefined = spreads[currentSpreadIdx];

  // ---- Detect spread mode based on viewport ----
  // Also clamp currentPage if a mode flip would land us past the last spread.
  useEffect(() => {
    function update() {
      const next = window.innerWidth >= SPREAD_BREAKPOINT_PX;
      setSpreadMode((prev) => (prev === next ? prev : next));
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
        if (!magazine.reader_url) {
          throw new Error('No PDF URL available for this issue.');
        }
        setLoadProgress('Loading PDF reader…');
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        setLoadProgress('Fetching magazine…');
        const task = pdfjs.getDocument({
          url: magazine.reader_url,
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

  // ---- Fetch hotspots once the PDF is loaded ----
  useEffect(() => {
    let cancelled = false;
    async function fetchHotspots() {
      try {
        const res = await fetch(`/api/magazines/${magazine.id}/hotspots`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.hotspots)) {
          setHotspots(data.hotspots as PublicHotspot[]);
        }
      } catch (err) {
        // Hotspots are non-essential — don't surface to user if they fail.
        console.warn('[InteractiveMagazineReader] hotspot fetch failed:', err);
      }
    }
    fetchHotspots();
    return () => { cancelled = true; };
  }, [magazine.id]);

  // ---- Render current spread ----
  useEffect(() => {
    if (!doc || !currentSpread) return;
    // Record what each side should currently be showing. In-flight renders
    // that complete after navigation will see a different value here and
    // skip their paint step.
    leftLatestPageRef.current = currentSpread.left;
    rightLatestPageRef.current = currentSpread.right;

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
      const latestRef = isLeft ? leftLatestPageRef : rightLatestPageRef;
      try {
        const page = await doc!.getPage(pageNum + 1);
        if (cancelled) return;
        if (latestRef.current !== pageNum) return;

        const stage = stageRef.current;
        if (!stage) return;
        // Base the page-fit math on the SCROLL container (the viewport box),
        // not the stage. At zoom>1 the stage uses width:max-content so its
        // clientWidth equals the canvas width — which would feed back and
        // recursively re-scale on every render. The scroll container is the
        // stable viewport box we want to fit-to.
        const viewport = scrollRef.current ?? stage;
        const stageH = Math.max(viewport.clientHeight - 16, 100);
        const stageW = Math.max(viewport.clientWidth - 16, 100);
        const natural = page.getViewport({ scale: 1 });
        const aspect = natural.width / natural.height;
        const perPageWidth = spreadMode ? Math.max(Math.floor((stageW - 8) / 2), 100) : stageW;
        const fitByHeight = stageH * aspect;
        const cssWidth = Math.min(perPageWidth, fitByHeight);
        const cssHeight = cssWidth / aspect;
        const displayWidth = cssWidth * zoom;
        const displayHeight = cssHeight * zoom;
        const displayScale = displayWidth / natural.width;
        // Cap DPR at 2 so 3x phone screens don't render at 4x cost.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = displayScale * dpr;
        const renderViewport = page.getViewport({ scale: renderScale });

        // Render offscreen first so the visible canvas keeps showing the
        // previous page until the new one is fully painted. Atomic swap via
        // drawImage eliminates both the blank-canvas gap and the stale-task
        // overwrite race.
        const offscreen = document.createElement('canvas');
        // Round (not floor) so bitmap dims are exact integers and the CSS
        // display size derived from them produces a clean 1/dpr ratio with
        // no sub-pixel scaling blur.
        offscreen.width = Math.round(renderViewport.width);
        offscreen.height = Math.round(renderViewport.height);
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        const task = page.render({ canvasContext: offCtx, viewport: renderViewport });
        if (isLeft) leftTask = task;
        else rightTask = task;
        await task.promise;
        if (cancelled) return;
        if (latestRef.current !== pageNum) return;

        // Compute overlays before the visual swap so the canvas resize and
        // overlay update apply in the same frame. Otherwise there's a brief
        // window where the canvas shows the new page but overlays are still
        // positioned for the old one.
        const annots = await page.getAnnotations();
        if (cancelled) return;
        if (latestRef.current !== pageNum) return;
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

        // Atomic visual swap + overlay update.
        const cssDisplayW = offscreen.width / dpr;
        const cssDisplayH = offscreen.height / dpr;
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.style.width = `${cssDisplayW}px`;
        canvas.style.height = `${cssDisplayH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(offscreen, 0, 0);
        if (isLeft) {
          setLeftOverlays(overlays);
          setLeftCanvasSize({ w: cssDisplayW, h: cssDisplayH });
        } else {
          setRightOverlays(overlays);
          setRightCanvasSize({ w: cssDisplayW, h: cssDisplayH });
        }
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

  // ---- Prefetch adjacent spreads ----
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
    const t = setTimeout(() => {
      if (cancelled) return;
      for (const pageIdx of adj) {
        doc.getPage(pageIdx + 1).catch(() => { /* noop */ });
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, currentSpreadIdx, spreads]);

  // ---- Lock body scroll while reader is open ----
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

  // ---- Focus management ----
  // Remember what had focus before we opened, restore it on close.
  useEffect(() => {
    triggerFocusRef.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog so screen readers and keyboard users land here.
    requestAnimationFrame(() => {
      containerRef.current?.focus();
    });
    return () => {
      // Restore focus on unmount.
      const t = triggerFocusRef.current;
      if (t && typeof t.focus === 'function') {
        try { t.focus(); } catch { /* element may be gone */ }
      }
    };
  }, []);

  // ---- Focus trap ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- Navigation callbacks (stable refs so the keyboard effect can include them in deps) ----
  const goPrev = useCallback(() => {
    if (!spreads.length) return;
    const newSpreadIdx = currentSpreadIdx - 1;
    if (newSpreadIdx < 0) return;
    const newSpread = spreads[newSpreadIdx];
    const target = newSpread.left ?? newSpread.right ?? 0;
    setCurrentPage(target);
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'prev', reader: 'interactive_v4' });
  }, [spreads, currentSpreadIdx, magazine.id]);

  const goNext = useCallback(() => {
    if (!spreads.length) return;
    const newSpreadIdx = currentSpreadIdx + 1;
    if (newSpreadIdx >= spreads.length) return;
    const newSpread = spreads[newSpreadIdx];
    const target = newSpread.left ?? newSpread.right ?? 0;
    setCurrentPage(target);
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'next', reader: 'interactive_v4' });
  }, [spreads, currentSpreadIdx, magazine.id]);

  const jumpTo = useCallback((pageIdx: number) => {
    if (pageIdx < 0 || pageIdx >= pageCount) return;
    setCurrentPage(pageIdx);
    trackEvent('flipbook_jump_to', { magazine_id: magazine.id, page: pageIdx, reader: 'interactive_v4' });
  }, [pageCount, magazine.id]);

  const zoomIn = useCallback(() => {
    setZoomIdx((idx) => {
      if (idx >= ZOOM_LEVELS.length - 1) return idx;
      const next = idx + 1;
      trackEvent('flipbook_zoom', { magazine_id: magazine.id, level: ZOOM_LEVELS[next], reader: 'interactive_v4' });
      return next;
    });
  }, [magazine.id]);

  const zoomOut = useCallback(() => {
    setZoomIdx((idx) => {
      if (idx <= 0) return idx;
      const next = idx - 1;
      trackEvent('flipbook_zoom', { magazine_id: magazine.id, level: ZOOM_LEVELS[next], reader: 'interactive_v4' });
      return next;
    });
  }, [magazine.id]);

  const zoomReset = useCallback(() => {
    setZoomIdx(getDefaultZoomIdx());
  }, []);

  // Double-tap: toggle between the device default and 2x.
  const zoomToggle = useCallback(() => {
    setZoomIdx((idx) => {
      const defaultIdx = getDefaultZoomIdx();
      const target = idx === defaultIdx ? ZOOM_LEVELS.indexOf(2) : defaultIdx;
      return target >= 0 ? target : idx;
    });
  }, []);

  const setZoomIdxClamped = useCallback((next: number) => {
    setZoomIdx(Math.max(0, Math.min(ZOOM_LEVELS.length - 1, next)));
  }, []);

  const toggleFullscreen = useCallback(async () => {
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
  }, [magazine.id]);

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
  }, [actionMode, goNext, goPrev, onClose, zoomIn, zoomOut, toggleFullscreen]);

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

  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpInput);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      jumpTo(n - 1);
    }
    setJumpInput('');
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
    const { share: nativeShare } = await import('@/lib/native/share');
    const { haptics } = await import('@/lib/native/haptics');
    haptics.light();
    const res = await nativeShare({
      title: magazine.issue_label,
      text: `Read ${magazine.issue_label} from RealtyLine`,
      url: shareUrl,
    });
    if (res.ok) {
      trackEvent('flipbook_shared', { magazine_id: magazine.id, channel: res.method });
      if (res.method === 'clipboard') setActionMode('share');
      return;
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

  // ---- Mouse pan handlers (desktop) ----
  function handleMouseDown(e: React.MouseEvent) {
    // When grab is OFF, don't intercept clicks on links — let the browser
    // handle the navigation. When grab is ON, drag-from-anywhere pans.
    if (!grabActive && (e.target as HTMLElement).tagName === 'A') return;
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

  // ---- Touch handlers (mobile gestures) ----
  function distance(t1: React.Touch | Touch, t2: React.Touch | Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (e.touches.length === 2) {
      // Pinch start
      const dist = distance(e.touches[0], e.touches[1]);
      touchStateRef.current = {
        startX: 0, startY: 0, startTime: Date.now(),
        startScrollLeft: scroll.scrollLeft, startScrollTop: scroll.scrollTop,
        moved: true, // pinch always "moves"
        pinching: true,
        pinchStartDistance: dist,
        pinchStartZoomIdx: zoomIdx,
      };
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = {
        startX: t.clientX, startY: t.clientY, startTime: Date.now(),
        startScrollLeft: scroll.scrollLeft, startScrollTop: scroll.scrollTop,
        moved: false,
        pinching: false,
        pinchStartDistance: 0,
        pinchStartZoomIdx: zoomIdx,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    const state = touchStateRef.current;
    const scroll = scrollRef.current;
    if (!state || !scroll) return;

    // Pinch zoom
    if (state.pinching && e.touches.length === 2) {
      const dist = distance(e.touches[0], e.touches[1]);
      const ratio = dist / state.pinchStartDistance;
      // Map ratio to discrete zoom index changes. Each 25% growth/shrink = 1 step.
      const stepsDelta = Math.round(Math.log(ratio) / Math.log(1.25));
      const targetIdx = state.pinchStartZoomIdx + stepsDelta;
      if (targetIdx !== zoomIdx) {
        setZoomIdxClamped(targetIdx);
      }
      e.preventDefault();
      return;
    }

    // One-finger drag
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (Math.hypot(dx, dy) > TAP_MAX_MOVE_PX) {
        state.moved = true;
      }
      // If zoomed in, pan. Otherwise let the swipe-on-end logic handle nav.
      if (zoom > 1) {
        scroll.scrollLeft = state.startScrollLeft - dx;
        scroll.scrollTop = state.startScrollTop - dy;
        e.preventDefault();
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const state = touchStateRef.current;
    if (!state) return;

    // Pinch end: just clear state.
    if (state.pinching) {
      // Only clear when all fingers are off; if 1 finger remains, convert
      // to a single-touch session starting from current position.
      if (e.touches.length === 0) {
        touchStateRef.current = null;
      } else if (e.touches.length === 1) {
        const scroll = scrollRef.current;
        const t = e.touches[0];
        touchStateRef.current = {
          startX: t.clientX, startY: t.clientY, startTime: Date.now(),
          startScrollLeft: scroll?.scrollLeft ?? 0,
          startScrollTop: scroll?.scrollTop ?? 0,
          moved: false,
          pinching: false, pinchStartDistance: 0, pinchStartZoomIdx: zoomIdx,
        };
      }
      return;
    }

    if (e.touches.length > 0) {
      // Still touching; wait.
      return;
    }

    const elapsed = Date.now() - state.startTime;
    const changed = e.changedTouches[0];
    const dx = changed ? changed.clientX - state.startX : 0;
    const dy = changed ? changed.clientY - state.startY : 0;
    touchStateRef.current = null;

    // Swipe (horizontal, larger than vertical, not zoomed in).
    if (
      !state.pinching &&
      Math.abs(dx) > SWIPE_THRESHOLD_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      zoom <= 1
    ) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    // Tap detection.
    if (!state.moved && elapsed < TAP_MAX_DURATION_MS) {
      const now = Date.now();
      const since = now - lastTapTimeRef.current;
      lastTapTimeRef.current = now;
      // Double-tap?
      if (since < DOUBLE_TAP_WINDOW_MS) {
        zoomToggle();
        return;
      }
      // Single-tap (delayed slightly so we can detect a follow-up double-tap).
      const target = e.target as HTMLElement;
      // Don't toggle chrome if tap was on a link or button.
      if (target.tagName === 'A' || target.closest('button') || target.closest('a')) {
        return;
      }
      setTimeout(() => {
        if (Date.now() - lastTapTimeRef.current >= DOUBLE_TAP_WINDOW_MS - 20) {
          setChromeVisible((v) => !v);
        }
      }, DOUBLE_TAP_WINDOW_MS);
    }
  }

  function handleTouchCancel() {
    touchStateRef.current = null;
  }

  // ---- Render ----
  if (loadError) {
    return (
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${magazine.issue_label} — error`}
        tabIndex={-1}
        className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center p-6 outline-none"
      >
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

  const transitionClass = reducedMotion ? '' : 'transition-colors';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${magazine.issue_label} — interactive issue`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] bg-gray-900 flex flex-col select-none outline-none"
    >
      {/* Screen-reader-only live announcement of current page */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {doc ? `Showing ${pageLabel}` : loadProgress}
      </div>

      {/* Stage — the page area */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto flex items-center justify-center"
        style={{
          cursor: grabActive ? (isDragging ? 'grabbing' : 'grab') : 'auto',
          touchAction: zoom > 1 ? 'none' : 'pan-y',
          WebkitOverflowScrolling: 'touch',
          // When grab is ON, suppress text-layer selection on the entire
          // stage so a drag is unambiguously a pan, not a text selection.
          userSelect: grabActive ? 'none' : 'auto',
          WebkitUserSelect: grabActive ? 'none' : 'auto',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={(e) => {
          // Tapping the empty area toggles chrome visibility (desktop).
          // Mobile uses the touch handler above so taps and drags aren't confused.
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
            className={`flex gap-2 ${zoom > 1 ? 'items-start justify-start' : 'items-center justify-center'}`}
            style={{
              // At zoom=1, the stage fills the viewport so the page is centered.
              // At zoom>1, the stage shrinks to the canvas's intrinsic width so
              // the scroll container has real horizontal overflow to pan into
              // (otherwise flex centering clamps the layout and left/right
              // edges of the page are unreachable when zoomed in on mobile).
              width: zoom > 1 ? 'max-content' : 'auto',
              minWidth: '100%',
              minHeight: '100%',
              // When zoomed, drop horizontal padding so the user can pan all
              // the way to the page edges. Keep vertical padding to clear the
              // floating top chrome.
              padding: zoom > 1
                ? (chromeVisible ? '64px 0' : '16px 0')
                : (chromeVisible ? '64px 16px' : '16px'),
            }}
          >
            {/* Left page (or placeholder for cover) */}
            {currentSpread?.left !== null && currentSpread?.left !== undefined ? (
              <PageCanvas
                canvasRef={leftCanvasRef}
                overlays={leftOverlays}
                pageNum={currentSpread.left}
                trackContext={{ magazine_id: magazine.id, side: 'left' }}
                transitionClass={transitionClass}
                hotspots={hotspots.filter((h) => h.page_idx === currentSpread.left)}
                displayWidth={leftCanvasSize.w}
                displayHeight={leftCanvasSize.h}
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
                transitionClass={transitionClass}
                hotspots={hotspots.filter((h) => h.page_idx === currentSpread.right)}
                displayWidth={rightCanvasSize.w}
                displayHeight={rightCanvasSize.h}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Top chrome — floating */}
      {chromeVisible && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 z-10"
          style={{
            background: `linear-gradient(to bottom, ${brandColor}EE, ${brandColor}00)`,
            paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          }}
        >
          <button onClick={onClose} aria-label="Close" className="text-white p-1.5 -ml-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="text-center flex-1 px-2 flex items-baseline justify-center gap-3">
            <button
              type="button"
              onClick={handleHome}
              className="text-[11px] uppercase tracking-[0.2em] text-white/90 hover:text-white font-medium border border-white/30 hover:border-white/50 rounded-md px-2 py-0.5 transition-colors"
              aria-label="Go to Realty News Now home"
            >
              Realty News Now
            </button>
            <p className="text-xs uppercase tracking-[0.2em] text-white/90 font-medium">{magazine.issue_label}</p>
            <span className="text-[10px] text-white/60">
              {doc ? pageLabel : loadProgress}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setActionMode('search')} aria-label="Search" className="text-white/80 hover:text-white p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
            <button onClick={zoomOut} disabled={zoomIdx === 0} aria-label="Zoom out" className="text-white/80 hover:text-white p-1.5 disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3M8 11h6" />
              </svg>
            </button>
            <button onClick={zoomReset} aria-label={`Zoom ${zoom}x — click to reset`} className="text-white/80 hover:text-white px-2 text-[10px] uppercase tracking-wider min-w-[44px] min-h-[44px] flex items-center justify-center">
              {zoom}x
            </button>
            {/* Grab tool toggle. Hand icon. When ON drag pans; when OFF drag
                selects text and links work normally. Defaults to ON. */}
            <button
              onClick={() => setGrabActive((g) => !g)}
              aria-label={grabActive ? 'Disable grab tool (allow text selection)' : 'Enable grab tool (drag to move the page)'}
              aria-pressed={grabActive}
              className={`p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors ${grabActive ? 'text-white bg-white/20 rounded' : 'text-white/80 hover:text-white'}`}
              title={grabActive ? 'Grab tool ON — drag to move the page' : 'Grab tool OFF — click to enable drag-to-pan'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 11V6a2 2 0 0 0-4 0v5" />
                <path d="M14 10V4a2 2 0 0 0-4 0v6" />
                <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
              </svg>
            </button>
            <button onClick={zoomIn} disabled={zoomIdx === ZOOM_LEVELS.length - 1} aria-label="Zoom in" className="text-white/80 hover:text-white p-1.5 disabled:opacity-30 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
              </svg>
            </button>
            <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="text-white/80 hover:text-white p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Fullscreen (F)">
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
          style={{
            background: `linear-gradient(to top, ${brandColor}EE, ${brandColor}00)`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
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
              className="w-16 bg-black/40 text-white text-center text-sm rounded-md px-2 py-1 placeholder-white/40 border border-white/20 backdrop-blur"
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
            <img src={qrDataUrl} alt="QR code" className="w-64 h-64 mx-auto bg-white p-2 rounded-md" />
          ) : (
            <div className="w-64 h-64 mx-auto bg-white/5 animate-pulse rounded-md" />
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
          <button onClick={handleCopyEmbed} className="mt-3 w-full py-2.5 bg-white/10 text-white text-sm uppercase tracking-wider rounded-md">
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
            className="w-full bg-white/10 text-white text-sm rounded-md px-3 py-2 placeholder-white/40 border border-white/20"
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
                {searchResults.map((r, i) => (
                  <li key={`${r.pageIdx}-${i}`}>
                    <button
                      onClick={() => {
                        setActionMode(null);
                        jumpTo(r.pageIdx);
                      }}
                      className="w-full text-left p-2 bg-white/5 hover:bg-white/10 rounded-md text-xs"
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
  transitionClass: string;
  hotspots: PublicHotspot[];
  displayWidth: number;
  displayHeight: number;
}

function PageCanvas({
  canvasRef, overlays, pageNum, trackContext, transitionClass,
  hotspots, displayWidth, displayHeight,
}: PageCanvasProps) {
  return (
    <div className="relative inline-block shadow-2xl">
      <canvas ref={canvasRef} className="block bg-white" />
      <HotspotLayer hotspots={hotspots} displayWidth={displayWidth} displayHeight={displayHeight} />
      {overlays.map((o, i) => (
        <a
          key={i}
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`absolute hover:bg-blue-400/20 focus:bg-blue-400/30 ${transitionClass}`}
          style={{
            left: `${o.x}px`,
            top: `${o.y}px`,
            width: `${o.w}px`,
            height: `${o.h}px`,
          }}
          onClick={() => {
            trackEvent('flipbook_link_clicked', {
              ...trackContext,
              page: pageNum + 1,
              url: o.url,
              reader: 'interactive_v4',
            });
            const matched = matchHotspotByUrl(o.url, hotspots);
            if (matched) trackHotspotClick(matched.id);
          }}
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
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 px-2 py-1 min-w-[44px] min-h-[44px] text-white/90 hover:text-white" aria-label={label}>
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
      <div className="bg-black border border-white/20 max-w-sm w-full p-6 rounded-md" onClick={(e) => e.stopPropagation()}>
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
