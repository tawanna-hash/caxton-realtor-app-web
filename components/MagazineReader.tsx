'use client';

// components/MagazineReader.tsx
//
// Enhanced flipbook reader: prev/next, jump-to, zoom, fullscreen, in-issue
// text search. Library: react-pageflip (existing dep).

import { useEffect, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import QRCode from 'qrcode';
import type { Magazine } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';
import { trackMagazinePageFlip } from '@/components/MagazineGA';

interface MagazineReaderProps {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
  /** Optional handler for the reader's "home" link in the top chrome. Defaults to window.location.assign('/'). */
  onHome?: () => void;
}

type ActionMode = null | 'share' | 'qr' | 'download' | 'email' | 'embed' | 'search';

const ZOOM_LEVELS = [1, 1.5, 2, 3, 5, 10];

// Minimal type for the HTMLFlipBook ref API we use.
interface FlipBookAPI {
  pageFlip: () => {
    flipNext: () => void;
    flipPrev: () => void;
    flip: (pageIdx: number) => void;
  } | null;
}
interface FlipEvent {
  data: number;
}

// Some magazines pre-S24 may not surface page_texts on the Magazine type.
// We read it defensively without using `any`.
interface MagazineMaybeWithTexts {
  page_texts?: unknown;
}

export default function MagazineReader({ magazine, brandColor, onClose, onHome }: MagazineReaderProps) {
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
  const [currentPage, setCurrentPage] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 400, h: 560 });
  const [zoomIdx, setZoomIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Grab/pan tool. When ON, mouse drag pans the zoomed page around the
  // viewport (HTMLFlipBook's mouse events are suppressed so dragging doesn't
  // trigger page flips). Auto-enables when the user first zooms in.
  const [grabActive, setGrabActive] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [grabHintShown, setGrabHintShown] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const scrollStageRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [jumpInput, setJumpInput] = useState('');
  const flipBookRef = useRef<FlipBookAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pageTexts: string[] = useMemo(() => {
    const t = (magazine as MagazineMaybeWithTexts).page_texts;
    if (Array.isArray(t) && t.every((s) => typeof s === 'string')) {
      return t as string[];
    }
    return [];
  }, [magazine]);
  const searchEnabled = pageTexts.length > 0;

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !searchEnabled) return [];
    return pageTexts
      .map((t, i) => ({ page: i, text: t || '' }))
      .filter((row) => row.text.toLowerCase().includes(q));
  }, [searchQuery, pageTexts, searchEnabled]);

  useEffect(() => {
    function calcSize() {
      const isPhone = window.innerWidth < 768;
      const reservedTop = 44;
      const reservedBottom = 48;
      const availH = window.innerHeight - reservedTop - reservedBottom;
      const availW = window.innerWidth;
      const pageAspect = 17 / 22;
      if (isPhone) {
        const w = Math.min(availW * 0.95, 500);
        const h = Math.min(w / pageAspect, availH * 0.92);
        setDims({ w: Math.floor(h * pageAspect), h: Math.floor(h) });
      } else {
        const maxW = Math.min(availW * 0.45, 600);
        const maxH = availH * 0.95;
        const w = Math.min(maxW, maxH * pageAspect);
        setDims({ w: Math.floor(w), h: Math.floor(w / pageAspect) });
      }
    }
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, []);

  useEffect(() => {
    trackEvent('flipbook_opened', {
      magazine_id: magazine.id,
      issue_label: magazine.issue_label,
      publication: magazine.publication,
      page_count: magazine.page_count,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (actionMode) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        flipBookRef.current?.pageFlip()?.flipNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flipBookRef.current?.pageFlip()?.flipPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        cycleZoom(1);
      } else if (e.key === '-') {
        e.preventDefault();
        cycleZoom(-1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMode]);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/magazine/${magazine.id}`
      : `/magazine/${magazine.id}`;

  useEffect(() => {
    if (actionMode === 'qr' && !qrDataUrl) {
      QRCode.toDataURL(shareUrl, { width: 320, margin: 2 })
        .then(setQrDataUrl)
        .catch((err) => console.error('[MagazineReader] QR generation failed:', err));
    }
  }, [actionMode, qrDataUrl, shareUrl]);

  const downloadUrl = magazine.reader_url;

  function flipPrev() {
    flipBookRef.current?.pageFlip()?.flipPrev();
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'prev' });
  }

  function flipNext() {
    flipBookRef.current?.pageFlip()?.flipNext();
    trackEvent('flipbook_button_nav', { magazine_id: magazine.id, dir: 'next' });
  }

  function jumpTo(pageIdx: number) {
    if (pageIdx < 0 || pageIdx >= magazine.page_count) return;
    flipBookRef.current?.pageFlip()?.flip(pageIdx);
    trackEvent('flipbook_jump_to', { magazine_id: magazine.id, page: pageIdx });
  }

  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpInput);
    if (Number.isInteger(n) && n >= 1 && n <= magazine.page_count) {
      jumpTo(n - 1);
    }
    setJumpInput('');
  }

  // Toggle handler for the grab tool button.
  function toggleGrab() {
    setGrabActive((g) => {
      const next = !g;
      if (next) setGrabHintShown(true);
      return next;
    });
  }

  // Mouse pan handlers — only fire when grab is active.
  function handlePanMouseDown(e: React.MouseEvent) {
    if (!grabActive || !scrollStageRef.current) return;
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: scrollStageRef.current.scrollLeft,
      scrollTop: scrollStageRef.current.scrollTop,
    };
    setIsPanning(true);
    e.preventDefault();
  }
  function handlePanMouseMove(e: React.MouseEvent) {
    if (!panRef.current || !scrollStageRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    scrollStageRef.current.scrollLeft = panRef.current.scrollLeft - dx;
    scrollStageRef.current.scrollTop = panRef.current.scrollTop - dy;
  }
  function handlePanMouseUp() {
    panRef.current = null;
    setIsPanning(false);
  }

  function cycleZoom(delta: 1 | -1) {
    setZoomIdx((prev) => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next >= ZOOM_LEVELS.length) return ZOOM_LEVELS.length - 1;
      // Auto-enable grab when zooming in, auto-disable when returning to 1x.
      if (ZOOM_LEVELS[next] > 1 && !grabActive) setGrabActive(true);
      if (ZOOM_LEVELS[next] === 1 && grabActive) setGrabActive(false);
      trackEvent('flipbook_zoom', { magazine_id: magazine.id, level: ZOOM_LEVELS[next] });
      return next;
    });
  }

  async function toggleFullscreen() {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        trackEvent('flipbook_fullscreen', { magazine_id: magazine.id, on: true });
      } else {
        await document.exitFullscreen();
        trackEvent('flipbook_fullscreen', { magazine_id: magazine.id, on: false });
      }
    } catch (err) {
      console.error('[MagazineReader] fullscreen toggle failed:', err);
    }
  }

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
    if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer');
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
        console.error('[MagazineReader] Clipboard write failed:', err);
      }
    }
  }

  function onFlip(e: FlipEvent) {
    if (typeof e?.data === 'number') {
      const prev = currentPage;
      const next = e.data;
      setCurrentPage(next);
      trackEvent('flipbook_page_turned', {
        magazine_id: magazine.id,
        from_page: prev,
        to_page: next,
        direction: next > prev ? 'forward' : 'back',
      });
      trackMagazinePageFlip({
        magazineId: magazine.id,
        pageNumber: next + 1,
        publication: magazine.publication,
      });
    }
  }

  if (!magazine.page_urls || magazine.page_urls.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center">
        <p className="text-white/70 text-sm">This issue isn&apos;t available yet.</p>
        <button
          onClick={onClose}
          className="mt-6 px-6 py-3 bg-white/10 text-white text-sm uppercase tracking-wider rounded-md"
        >
          Close
        </button>
      </div>
    );
  }

  const zoom = ZOOM_LEVELS[zoomIdx];

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
      style={{ touchAction: 'none' }}
    >
      {/* Top chrome */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10"
        style={{ backgroundColor: brandColor }}
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
            className="text-[11px] uppercase tracking-[0.2em] text-white/80 hover:text-white font-medium border border-white/20 hover:border-white/40 rounded-md px-2 py-0.5 transition-colors"
            aria-label="Go to Realty News Now home"
          >
            Realty News Now
          </button>
          <p className="text-xs uppercase tracking-[0.2em] text-white/70 font-medium">{magazine.issue_label}</p>
          <span className="text-[10px] text-white/40">
            Page {currentPage + 1} / {magazine.page_count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {searchEnabled && (
            <button
              onClick={() => setActionMode('search')}
              aria-label="Search in issue"
              className="text-white/80 hover:text-white p-1"
              title="Search (S)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
          <button
            onClick={() => cycleZoom(1)}
            aria-label="Zoom"
            className="text-white/80 hover:text-white p-1"
            title={`Zoom ${zoom}x (next: cycle)`}
          >
            <span className="text-[10px] uppercase tracking-wider">{zoom}x</span>
          </button>
          {/* Grab/pan tool toggle. Only meaningful when zoomed in. */}
          {zoom > 1 && (
            <button
              onClick={toggleGrab}
              aria-label={grabActive ? 'Disable grab tool' : 'Enable grab tool to drag the page'}
              aria-pressed={grabActive}
              className={`p-1 transition-colors ${grabActive ? 'text-white bg-white/20 rounded' : 'text-white/80 hover:text-white'}`}
              title={grabActive ? 'Grab tool ON — click to disable' : 'Grab tool — drag to move the page'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 11V6a2 2 0 0 0-4 0v5" />
                <path d="M14 10V4a2 2 0 0 0-4 0v6" />
                <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
              </svg>
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="text-white/80 hover:text-white p-1"
            title="Fullscreen (F)"
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v4H4M16 3v4h4M8 21v-4H4M16 21v-4h4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Flipbook canvas. When grab is active we attach mouse handlers to the
          scroll wrapper, switch the cursor to grab/grabbing, and tell
          HTMLFlipBook to ignore its own mouse events so dragging doesn't
          flip pages. */}
      <div
        ref={scrollStageRef}
        className="flex-1 flex items-center justify-center overflow-auto relative"
        style={{
          cursor: grabActive ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
        onMouseDown={handlePanMouseDown}
        onMouseMove={handlePanMouseMove}
        onMouseUp={handlePanMouseUp}
        onMouseLeave={handlePanMouseUp}
      >
        {grabActive && grabHintShown && (
          <div
            className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs whitespace-nowrap"
            aria-hidden="true"
          >
            Drag to move the page — click the hand again to flip pages
          </div>
        )}
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 200ms ease-out',
            // While grabbing: disable text/image selection and stop the
            // FlipBook from receiving raw pointer events. The pan handlers
            // are on the parent so the drag still works through this layer.
            userSelect: grabActive ? 'none' : 'auto',
            WebkitUserSelect: grabActive ? 'none' : 'auto',
            pointerEvents: grabActive ? 'none' : 'auto',
            // Force smooth resampling when the browser upscales the page
            // JPEG beyond 1x (legacy reader: source is a fixed-res JPEG, so
            // zoom is pure transform). Chrome/Safari default to 'auto', which
            // can switch to a fast nearest-neighbour pass at high zoom and
            // make small type look blocky.
            imageRendering: 'high-quality',
          }}
        >
          <HTMLFlipBook
            ref={flipBookRef}
            width={dims.w}
            height={dims.h}
            minWidth={200}
            maxWidth={1000}
            minHeight={200}
            maxHeight={1400}
            size="fixed"
            drawShadow={true}
            flippingTime={650}
            usePortrait={true}
            startPage={0}
            autoSize={false}
            maxShadowOpacity={0.5}
            showCover={true}
            mobileScrollSupport={false}
            clickEventForward={!grabActive}
            useMouseEvents={!grabActive}
            swipeDistance={30}
            showPageCorners={!grabActive}
            disableFlipByClick={grabActive}
            startZIndex={0}
            style={{}}
            className=""
            onFlip={onFlip}
          >
            {magazine.page_urls.map((url, idx) => (
              <div key={idx} className="bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Page ${idx + 1}`}
                  className="w-full h-full object-contain"
                  draggable={false}
                  loading={idx < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{ imageRendering: 'high-quality' }}
                />
              </div>
            ))}
          </HTMLFlipBook>
        </div>
      </div>

      {/* Navigation bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/10"
        style={{ backgroundColor: brandColor }}
      >
        <button
          onClick={flipPrev}
          disabled={currentPage === 0}
          aria-label="Previous page"
          className="text-white/80 hover:text-white p-1.5 disabled:opacity-30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={magazine.page_count}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            placeholder={`${currentPage + 1}`}
            className="w-14 bg-white/10 text-white text-center text-sm rounded-md px-2 py-1 placeholder-white/40 border border-white/10"
            aria-label="Jump to page"
          />
          <span className="text-xs text-white/40">/ {magazine.page_count}</span>
        </form>

        <button
          onClick={flipNext}
          disabled={currentPage >= magazine.page_count - 1}
          aria-label="Next page"
          className="text-white/80 hover:text-white p-1.5 disabled:opacity-30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Bottom action bar */}
      <div
        className="flex-shrink-0 flex items-center justify-around px-2 py-2 border-t border-white/10"
        style={{ backgroundColor: brandColor }}
      >
        <ActionButton label="Share" onClick={handleShare} icon={ICONS.share} />
        <ActionButton label="QR" onClick={() => setActionMode('qr')} icon={ICONS.qr} />
        <ActionButton label="Download" onClick={handleDownload} icon={ICONS.download} />
        <ActionButton label="Email" onClick={handleEmail} icon={ICONS.email} />
        <ActionButton label="Embed" onClick={() => setActionMode('embed')} icon={ICONS.embed} />
      </div>

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
          <button
            onClick={handleCopyEmbed}
            className="mt-3 w-full py-2.5 bg-white/10 text-white text-sm uppercase tracking-wider rounded-md"
          >
            Copy Embed Code
          </button>
        </ActionPopup>
      )}
      {actionMode === 'search' && (
        <ActionPopup title="Search in this issue" onClose={() => setActionMode(null)}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full bg-white/10 text-white text-sm rounded-md px-3 py-2 placeholder-white/40 border border-white/20"
            autoFocus
          />
          <div className="mt-3 max-h-64 overflow-y-auto">
            {searchQuery.trim() === '' ? (
              <p className="text-xs text-white/40">
                Search across all extracted page text from this issue.
              </p>
            ) : searchMatches.length === 0 ? (
              <p className="text-xs text-white/40">No matches.</p>
            ) : (
              <ul className="space-y-2">
                {searchMatches.map((m) => {
                  const q = searchQuery.trim().toLowerCase();
                  const lcText = m.text.toLowerCase();
                  const start = Math.max(0, lcText.indexOf(q) - 30);
                  const end = Math.min(m.text.length, start + 120);
                  const snippet = (start > 0 ? '… ' : '') + m.text.slice(start, end) + (end < m.text.length ? ' …' : '');
                  return (
                    <li key={m.page}>
                      <button
                        onClick={() => {
                          setActionMode(null);
                          jumpTo(m.page);
                        }}
                        className="w-full text-left p-2 bg-white/5 hover:bg-white/10 rounded-md text-xs"
                      >
                        <p className="text-white/90 font-semibold">Page {m.page + 1}</p>
                        <p className="text-white/60 mt-0.5">{snippet}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ActionPopup>
      )}
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
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-2 py-1 text-white/80 active:text-white"
      aria-label={label}
    >
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
