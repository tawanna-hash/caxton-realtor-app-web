// components/HotspotLayer.tsx
//
// Renders interactive hotspot overlays on top of a single magazine page.
// Mounts inside PageCanvas (or wherever a page is rendered) as a sibling
// to the canvas; positions are fractions of the canvas dimensions.
//
// Phase 1 scope: link, phone, email, mls are fully wired (open URLs / tel: /
// mailto:). Video, image, audio, form, reveal record clicks and show a
// minimal "coming soon" notice — the full lightboxes ship in Phase 2 with
// the admin editor.
//
// All click events fire a beacon to /api/hotspots/:id/click for analytics.

'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicHotspot, HotspotType } from '@/lib/hotspots';

// Persistent anonymous session id stored in a cookie. Used for click dedup.
const SESSION_COOKIE = 'mz_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getOrCreateSessionId(): string {
  if (typeof document === 'undefined') return '';
  const existing = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (existing) return existing.split('=')[1];
  // Generate a UUID-ish without depending on crypto.randomUUID (older Safari).
  const id = 'sx_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  document.cookie = `${SESSION_COOKIE}=${id}; path=/; max-age=${SESSION_MAX_AGE}; samesite=lax`;
  return id;
}

function trackClick(hotspotId: number): void {
  const sessionId = getOrCreateSessionId();
  console.log('[HotspotLayer] trackClick fired', { hotspotId, sessionId });
  if (!sessionId) { console.warn('[HotspotLayer] no session id, aborting'); return; }
  // Fire and forget. sendBeacon survives navigation away from the page —
  // important for link hotspots where the user is leaving.
  const payload = JSON.stringify({ session_id: sessionId });
  const url = `/api/hotspots/${hotspotId}/click`;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    } catch {
      /* fall through to fetch */
    }
  }
  // Fallback: fire-and-forget fetch with keepalive.
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => { /* noop */ });
}

// Fire a fire-and-forget GET to an advertiser-supplied tracking URL
// (typically a shortener like bit.ly). The browser issues a real GET,
// the shortener counts the click in its dashboard via the redirect,
// and the browser then tries to interpret the eventual response as
// an image and silently fails. We don't care about the response.
function fireTrackingPixel(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const img = new window.Image();
    img.src = url;
  } catch {
    /* noop */
  }
}

// Color hint per hotspot type. Used only for hover affordance in the reader;
// the editor (Phase 2) will use the same palette for the draw tool.
const TYPE_COLOR: Record<HotspotType, string> = {
  link: 'rgba(59, 130, 246, 0.25)',     // blue
  video: 'rgba(239, 68, 68, 0.25)',     // red
  image: 'rgba(168, 85, 247, 0.25)',    // purple
  phone: 'rgba(34, 197, 94, 0.25)',     // green
  email: 'rgba(245, 158, 11, 0.25)',    // amber
  form: 'rgba(20, 184, 166, 0.25)',     // teal
  mls: 'rgba(99, 102, 241, 0.25)',      // indigo
  audio: 'rgba(236, 72, 153, 0.25)',    // pink
  reveal: 'rgba(251, 146, 60, 0.25)',   // orange
};

interface HotspotLayerProps {
  /** Hotspots for THIS page only. Filter happens in the parent. */
  hotspots: PublicHotspot[];
  /** Rendered canvas dimensions in CSS pixels. */
  displayWidth: number;
  displayHeight: number;
  /**
   * When true, hotspots show a faint background so users can see them.
   * When false (default), they're invisible unless hovered. The editor in
   * Phase 2 will set this to true; the consumer reader defaults to false.
   */
  showHints?: boolean;
}

export default function HotspotLayer({
  hotspots,
  displayWidth,
  displayHeight,
  showHints = false,
}: HotspotLayerProps) {
  // For Phase 1 fallback lightbox (video/image/audio/form/reveal).
  const [comingSoon, setComingSoon] = useState<{ id: number; type: HotspotType; label: string | null } | null>(null);

  if (!hotspots.length) return null;
  if (displayWidth <= 0 || displayHeight <= 0) return null;

  return (
    <>
      {hotspots.map((h) => {
        const left = h.x * displayWidth;
        const top = h.y * displayHeight;
        const width = h.w * displayWidth;
        const height = h.h * displayHeight;
        const tint = TYPE_COLOR[h.type] || 'rgba(255,255,255,0.25)';
        const baseClass = `absolute transition-colors cursor-pointer`;
        const style: React.CSSProperties = {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          background: showHints ? tint : 'transparent',
        };
        const ariaLabel = h.label || `${h.type} hotspot`;

        // For link/mls/phone/email, render an <a> so right-click "open in new
        // tab" works and the URL is visible in the status bar. Click tracking
        // happens in onClick — sendBeacon survives the navigation.
        if (h.type === 'link' && h.config.type === 'link') {
          const cfg = h.config;
          return (
            <a
              key={h.id}
              href={cfg.url}
              target={cfg.open_in === 'same_tab' ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className={`${baseClass} hover:bg-blue-400/30 focus:bg-blue-400/40`}
              style={style}
              aria-label={ariaLabel}
              onPointerDown={() => {
                trackClick(h.id);
                if (cfg.tracking_url) fireTrackingPixel(cfg.tracking_url);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  trackClick(h.id);
                  if (cfg.tracking_url) fireTrackingPixel(cfg.tracking_url);
                }
              }}
            />
          );
        }
        if (h.type === 'mls' && h.config.type === 'mls') {
          return (
            <a
              key={h.id}
              href={h.config.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${baseClass} hover:bg-indigo-400/30 focus:bg-indigo-400/40`}
              style={style}
              aria-label={ariaLabel}
              onPointerDown={() => trackClick(h.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') trackClick(h.id); }}
            />
          );
        }
        if (h.type === 'phone' && h.config.type === 'phone') {
          return (
            <a
              key={h.id}
              href={`tel:${h.config.number}`}
              className={`${baseClass} hover:bg-green-400/30 focus:bg-green-400/40`}
              style={style}
              aria-label={ariaLabel}
              onPointerDown={() => trackClick(h.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') trackClick(h.id); }}
            />
          );
        }
        if (h.type === 'email' && h.config.type === 'email') {
          const cfg = h.config;
          const parts = [`mailto:${cfg.address}`];
          const q: string[] = [];
          if (cfg.subject) q.push(`subject=${encodeURIComponent(cfg.subject)}`);
          if (cfg.body) q.push(`body=${encodeURIComponent(cfg.body)}`);
          const href = q.length ? `${parts[0]}?${q.join('&')}` : parts[0];
          return (
            <a
              key={h.id}
              href={href}
              className={`${baseClass} hover:bg-amber-400/30 focus:bg-amber-400/40`}
              style={style}
              aria-label={ariaLabel}
              onPointerDown={() => trackClick(h.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') trackClick(h.id); }}
            />
          );
        }

        // Video / image / audio / form / reveal — Phase 1 placeholder.
        // Records click + shows a small "coming soon" modal so the data model
        // and analytics are fully functional, but the rich UI ships in Phase 2.
        return (
          <button
            key={h.id}
            type="button"
            className={`${baseClass} hover:bg-white/30 focus:bg-white/40`}
            style={style}
            aria-label={ariaLabel}
            onClick={() => {
              trackClick(h.id);
              setComingSoon({ id: h.id, type: h.type, label: h.label });
            }}
          />
        );
      })}

      {comingSoon && (
        <ComingSoonModal
          type={comingSoon.type}
          label={comingSoon.label}
          onClose={() => setComingSoon(null)}
        />
      )}
    </>
  );
}

function ComingSoonModal({
  type,
  label,
  onClose,
}: {
  type: HotspotType;
  label: string | null;
  onClose: () => void;
}) {
  // Lock focus on the dialog, restore on close.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label || `${type} hotspot`}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="bg-gray-900 border border-white/20 max-w-sm w-full p-6 rounded-md outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm uppercase tracking-[0.2em] text-white/80 font-medium mb-3">
          {label || type}
        </p>
        <p className="text-sm text-white/70 mb-4">
          This {type} hotspot is configured. Rich playback will be available in the next release.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-white/10 text-white text-sm uppercase tracking-wider rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  );
}
