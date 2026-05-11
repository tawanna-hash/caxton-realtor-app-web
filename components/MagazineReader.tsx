'use client';

import { useEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import QRCode from 'qrcode';
import type { Magazine } from '@/lib/magazines';
import { trackEvent } from '../app/posthog-provider';

interface MagazineReaderProps {
  magazine: Magazine;
  brandColor: string;
  onClose: () => void;
}

type ActionMode = null | 'share' | 'qr' | 'download' | 'email' | 'embed';

export default function MagazineReader({ magazine, brandColor, onClose }: MagazineReaderProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 400, h: 560 });
  const flipBookRef = useRef<any>(null);

  // Size the book to the viewport: 90% of available width and height, capped
  // at a sensible max so it doesn't look silly on a 4K monitor.
  useEffect(() => {
    function calcSize() {
      const isPhone = window.innerWidth < 768;
      const reservedTop = 44;
      const reservedBottom = 48;
      const availH = window.innerHeight - reservedTop - reservedBottom;
      const availW = window.innerWidth;
      // Magazine page aspect: roughly 17:22 (matches our 922x1024 covers).
      const pageAspect = 17 / 22;
      if (isPhone) {
        const w = Math.min(availW * 0.95, 500);
        const h = Math.min(w / pageAspect, availH * 0.92);
        setDims({ w: Math.floor(h * pageAspect), h: Math.floor(h) });
      } else {
        // Desktop: render as spread (two pages side by side). The library wants
        // single-page width here; it doubles for the spread automatically.
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

  // Fire open event once per mount
  useEffect(() => {
    trackEvent('flipbook_opened', { magazine_id: magazine.id, issue_label: magazine.issue_label, publication: magazine.publication, page_count: magazine.page_count });
  }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Build the shareable URL for this magazine.
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/magazine/${magazine.id}`
      : `/magazine/${magazine.id}`;

  // Generate QR code when QR action is opened.
  useEffect(() => {
    if (actionMode === 'qr' && !qrDataUrl) {
      QRCode.toDataURL(shareUrl, { width: 320, margin: 2 })
        .then(setQrDataUrl)
        .catch((err) => console.error('[MagazineReader] QR generation failed:', err));
    }
  }, [actionMode, qrDataUrl, shareUrl]);

  // The download URL — direct PDF on WordPress.
  const pdfUrl = magazine.reader_url
    .replace(/\/pdfviewer\//, '/wp-content/uploads/')
    .replace(/\/?\?.*$/, '');
  // The above is fragile for slug-style reader URLs. Fall back to a public
  // share link if we can't derive the PDF URL directly.
  // For now, we expose the reader_url as the "download" target — works for
  // every issue because the WP pdfviewer plugin has a built-in download button.
  const downloadUrl = magazine.reader_url;

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
        // User cancelled — fall through to copy.
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        trackEvent('flipbook_shared', { magazine_id: magazine.id, channel: 'copy' });
        setActionMode('share');
        return;
      } catch {
        // Clipboard failed — show share popup with the URL.
      }
    }
    setActionMode('share');
  }

  function handleDownload() {
    trackEvent('flipbook_download_clicked', { magazine_id: magazine.id });
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
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

  function onFlip(e: any) {
    if (typeof e?.data === 'number') {
      const prev = currentPage;
      const next = e.data;
      setCurrentPage(next);
      trackEvent('flipbook_page_turned', { magazine_id: magazine.id, from_page: prev, to_page: next, direction: next > prev ? 'forward' : 'back' });
    }
  }

  // ---- Render ----

  // Guard: no pages = nothing to render.
  if (!magazine.page_urls || magazine.page_urls.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center">
        <p className="text-white/70 text-sm">This issue isn't available yet.</p>
        <button
          onClick={onClose}
          className="mt-6 px-6 py-3 bg-white/10 text-white text-sm uppercase tracking-wider rounded-full"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" style={{ touchAction: 'none' }}>
      {/* Top chrome */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10" style={{ backgroundColor: brandColor }}>
        <button onClick={onClose} aria-label="Close" className="text-white p-1.5 -ml-1.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="text-center flex-1 px-2 flex items-baseline justify-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/70 font-medium">{magazine.issue_label}</p>
          <span className="text-[10px] text-white/40">Page {currentPage + 1} / {magazine.page_count}</span>
        </div>
        <div className="w-8" />
      </div>

      {/* Flipbook canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
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
          clickEventForward={true}
          useMouseEvents={true}
          swipeDistance={30}
          showPageCorners={true}
          disableFlipByClick={false}
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
              />
            </div>
          ))}
        </HTMLFlipBook>
      </div>

      {/* Bottom action bar */}
      <div className="flex-shrink-0 flex items-center justify-around px-2 py-2 border-t border-white/10" style={{ backgroundColor: brandColor }}>
        <ActionButton label="Share" onClick={handleShare} icon={ICONS.share} />
        <ActionButton label="QR" onClick={() => setActionMode('qr')} icon={ICONS.qr} />
        <ActionButton label="Download" onClick={handleDownload} icon={ICONS.download} />
        <ActionButton label="Email" onClick={handleEmail} icon={ICONS.email} />
        <ActionButton label="Embed" onClick={() => setActionMode('embed')} icon={ICONS.embed} />
      </div>

      {/* Action sub-popups */}
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
          <button
            onClick={handleCopyEmbed}
            className="mt-3 w-full py-2.5 bg-white/10 text-white text-sm uppercase tracking-wider"
          >
            Copy Embed Code
          </button>
        </ActionPopup>
      )}
    </div>
  );
}

// ---- Small subcomponents ----

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
      <div className="bg-black border border-white/20 max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm uppercase tracking-[0.2em] text-white/80 font-medium">{title}</p>
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
