// components/ReaderLinksPanel.tsx
//
// Public-facing "Links on this page" side panel for the magazine reader.
// Renders as a persistent pill in the reader chrome; tapping the pill opens
// a floating panel that lists every live hotspot on the visible spread.
//
// This is the reader-side counterpart to the admin editor's SpreadSidebar.
// Same idea: keep the ad art clean, give readers a professional index of
// everything they can tap. Each row fires the same tracking beacon and the
// same action as tapping the hotspot on the page.

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicHotspot } from '@/lib/hotspots';
import { TYPE_LABELS, TYPE_ICONS } from '@/lib/hotspot-editor-helpers';

// ------- Session id (matches HotspotLayer's cookie) -----------------------
const SESSION_COOKIE = 'mz_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getOrCreateSessionId(): string {
  if (typeof document === 'undefined') return '';
  const existing = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (existing) return existing.split('=')[1];
  const id = 'sx_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  document.cookie = `${SESSION_COOKIE}=${id}; path=/; max-age=${SESSION_MAX_AGE}; samesite=lax`;
  return id;
}

function trackClick(hotspotId: number): void {
  const sessionId = getOrCreateSessionId();
  if (!sessionId) return;
  const payload = JSON.stringify({ session_id: sessionId });
  const url = `/api/hotspots/${hotspotId}/click`;
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    } catch {
      /* fall through */
    }
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => { /* noop */ });
}

// Extract a short, human-readable secondary line for the row.
function secondaryLine(h: PublicHotspot): string | null {
  const c = h.config;
  switch (c.type) {
    case 'link':
      try { return new URL(c.url).hostname.replace(/^www\./, ''); } catch { return c.url; }
    case 'mls':
      return c.address || (() => { try { return new URL(c.url).hostname.replace(/^www\./, ''); } catch { return c.url; } })();
    case 'phone':
      return c.number;
    case 'email':
      return c.address;
    case 'video':
      return c.embed_url ? 'Play video' : 'Play';
    case 'audio':
      return c.title || 'Play audio';
    case 'image':
      return `${c.images.length} image${c.images.length === 1 ? '' : 's'}`;
    case 'form':
      return 'Open form';
    case 'reveal':
      return 'Reveal';
    default:
      return null;
  }
}

// Build the target href / handler for a row so a tap on the sidebar behaves
// exactly like a tap on the hotspot itself.
function actionFor(h: PublicHotspot): { href?: string; target?: string; onClick?: () => void } {
  const c = h.config;
  switch (c.type) {
    case 'link':
      return { href: c.url, target: c.open_in === 'same_tab' ? '_self' : '_blank' };
    case 'mls':
      return { href: c.url, target: '_blank' };
    case 'phone':
      return { href: `tel:${c.number}` };
    case 'email': {
      const addr = (c.address || '').trim();
      if (!addr) return {};
      const q: string[] = [];
      if (c.subject) q.push(`subject=${encodeURIComponent(c.subject)}`);
      if (c.body) q.push(`body=${encodeURIComponent(c.body)}`);
      const href = q.length
        ? `mailto:${encodeURIComponent(addr)}?${q.join('&')}`
        : `mailto:${encodeURIComponent(addr)}`;
      return { href };
    }
    default:
      // Video / image / audio / form / reveal: click just fires the beacon;
      // the on-page hotspot handles the actual lightbox in Phase 2.
      return {};
  }
}

interface ReaderLinksPanelProps {
  hotspots: PublicHotspot[];
  brandColor: string;
}

export default function ReaderLinksPanel({ hotspots, brandColor }: ReaderLinksPanelProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Group by advertiser (or "This page") so multi-hotspot ads collapse into one
  // header instead of nine unrelated rows.
  const groups = useMemo(() => {
    const acc = new Map<string, PublicHotspot[]>();
    for (const h of hotspots) {
      // PublicHotspot doesn't carry advertiser_name; the reader only sees
      // published hotspots, so we fall back to grouping by label prefix or
      // just lump everything together under "Live links".
      const key = 'Live links';
      const arr = acc.get(key) ?? [];
      arr.push(h);
      acc.set(key, arr);
    }
    return Array.from(acc.entries());
  }, [hotspots]);

  if (hotspots.length === 0) return null;

  return (
    <>
      {/* Pill in the reader chrome. Placed absolute so caller doesn't have to
          rearrange its own layout to make room. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${hotspots.length} interactive link${hotspots.length === 1 ? '' : 's'} on this page`}
        aria-expanded={open}
        className="absolute right-3 bottom-24 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/95 shadow-lg border border-black/10 text-xs font-medium text-gray-800 hover:bg-white transition-colors"
        style={{ backdropFilter: 'blur(6px)' }}
      >
        <span aria-hidden>📎</span>
        <span>
          {hotspots.length} link{hotspots.length === 1 ? '' : 's'} on this page
        </span>
      </button>

      {/* Panel. Slides in from the right on desktop; becomes a bottom sheet
          on narrow viewports via responsive Tailwind. */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Links on this page"
            className="fixed z-40 bg-white shadow-2xl flex flex-col
                       right-0 top-0 h-full w-[92vw] max-w-sm
                       md:top-16 md:bottom-16 md:h-auto md:right-4 md:rounded-xl md:border md:border-gray-200"
          >
            <div
              className="px-4 py-3 flex items-center justify-between border-b border-gray-200"
              style={{ background: `${brandColor}0d` }}
            >
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
                Links on this page
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-800 -mr-1 p-1.5"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {groups.map(([groupName, hs]) => (
                <div key={groupName}>
                  {groups.length > 1 && (
                    <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-500 font-medium bg-gray-50">
                      {groupName}
                    </div>
                  )}
                  {hs.map((h) => (
                    <LinkRow key={h.id} hotspot={h} onOpen={() => setOpen(false)} />
                  ))}
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-500">
              Tap a link above, or tap directly on the page — either way opens the same action.
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function LinkRow({ hotspot, onOpen }: { hotspot: PublicHotspot; onOpen: () => void }) {
  const icon = TYPE_ICONS[hotspot.type];
  const label = TYPE_LABELS[hotspot.type];
  const secondary = secondaryLine(hotspot);
  const action = actionFor(hotspot);

  const commonInner = (
    <>
      <span className="text-lg leading-none shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            {label}
          </span>
        </div>
        {hotspot.label && (
          <p className="text-sm font-medium text-gray-900 truncate">{hotspot.label}</p>
        )}
        {secondary && (
          <p className="text-xs text-gray-500 truncate">{secondary}</p>
        )}
      </div>
    </>
  );

  const rowClass = "px-4 py-3 flex items-start gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors";

  if (action.href) {
    return (
      <a
        href={action.href}
        target={action.target}
        rel={action.target === '_blank' ? 'noopener noreferrer' : undefined}
        className={rowClass}
        onClick={() => {
          trackClick(hotspot.id);
          // Close the panel on link taps so a returning reader isn't staring
          // at a stale overlay when they come back.
          onOpen();
        }}
      >
        {commonInner}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`${rowClass} w-full text-left`}
      onClick={() => {
        trackClick(hotspot.id);
        onOpen();
      }}
    >
      {commonInner}
    </button>
  );
}
