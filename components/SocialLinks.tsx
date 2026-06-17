/**
 * <SocialLinks> — small row of Facebook / Instagram / LinkedIn icon links.
 *
 * Used in two surfaces:
 *   1. Bottom of the in-app feed (per-pub URLs — RealtyLine vs Newsline San Antonio)
 *   2. Global app footer (both pubs side-by-side)
 *
 * URLs are stored in lib/pub-meta.ts so swapping them later is a one-line
 * change in a single file. Empty / '#' URLs are rendered as disabled (no
 * <a> tag) so we don't ship broken links to users.
 */

import { PUB_META, type PubKey } from '@/lib/pub-meta';

type Variant =
  | 'feed' // big, full-bleed brand-color card mounted at the bottom of the feed
  | 'footer'; // compact monochrome row for the global app footer

interface Props {
  pub: PubKey;
  variant?: Variant;
  /** Optional override label; defaults to "Follow {PubName}" */
  heading?: string;
}

/**
 * Brand-aware platform metadata. Brand colors per each platform's official
 * guidelines so the icons feel native rather than recolored chiclets.
 */
const PLATFORMS = [
  { key: 'facebook' as const, label: 'Facebook', color: '#156B8A' },
  { key: 'instagram' as const, label: 'Instagram', color: '#E1306C' },
  { key: 'linkedin' as const, label: 'LinkedIn', color: '#0A66C2' },
];

type PlatformKey = (typeof PLATFORMS)[number]['key'];

function isLiveUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && trimmed !== '#';
}

/** Inline SVG so we don't ship an icon-library dep for three icons. */
function PlatformIcon({ k }: { k: PlatformKey }) {
  switch (k) {
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M22.675 0H1.325C.593 0 0 .593 0 1.326v21.348C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.464.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.407 24 22.674V1.326C24 .593 23.407 0 22.675 0z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
  }
}

export function SocialLinks({ pub, variant = 'feed', heading }: Props) {
  const meta = PUB_META[pub];
  const urls: Record<PlatformKey, string | undefined> = {
    facebook: meta.facebook,
    instagram: meta.instagram,
    linkedin: meta.linkedin,
  };

  const liveLinks = PLATFORMS.filter((p) => isLiveUrl(urls[p.key]));
  // If all three URLs are placeholders we still render the card with a hint
  // for the admin — better than silently disappearing.
  const hasAnyLive = liveLinks.length > 0;

  if (variant === 'footer') {
    // BUG-14: 22×22 icons were direct tap targets. Wrap each in a
    // >=44×44 container (WCAG 2.5.5). A11y: replace aria-label on bare <span>
    // (prohibited — element has no role) with a disabled <button> for the
    // "coming soon" placeholders so the accessible name is exposed by an
    // element that supports it.
    return (
      <div className="flex items-center gap-1">
        {PLATFORMS.map((p) => {
          const url = urls[p.key];
          if (!isLiveUrl(url)) {
            return (
              <button
                key={p.key}
                type="button"
                disabled
                aria-label={`${p.label} link coming soon`}
                title={`${p.label} link coming soon`}
                className="inline-flex items-center justify-center w-11 h-11 text-gray-300 cursor-not-allowed"
              >
                <PlatformIcon k={p.key} />
              </button>
            );
          }
          return (
            <a
              key={p.key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${meta.name} on ${p.label}`}
              className="inline-flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <PlatformIcon k={p.key} />
            </a>
          );
        })}
      </div>
    );
  }

  // ─── 'feed' variant ────────────────────────────────────────────────────
  return (
    <section
      className="px-6 py-8 border-b border-gray-200 text-center"
      style={{ backgroundColor: meta.color, color: 'white' }}
    >
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/60 font-medium mb-2">
        Follow
      </p>
      <h2 className="text-xl font-semibold mb-1 tracking-tight">
        {heading ?? meta.name}
      </h2>
      <p className="text-sm text-white/70 mb-5 font-light">
        Stay in the loop wherever you scroll.
      </p>

      <div className="flex items-center justify-center gap-4">
        {PLATFORMS.map((p) => {
          const url = urls[p.key];
          const live = isLiveUrl(url);
          const base =
            'inline-flex items-center justify-center w-12 h-12 rounded-full transition-all';
          if (!live) {
            // A11y: <span aria-label> is prohibited (no role). Use a
            // disabled <button> so the accessible name attaches to a real
            // interactive element.
            return (
              <button
                key={p.key}
                type="button"
                disabled
                aria-label={`${p.label} link coming soon`}
                title={`${p.label} link coming soon`}
                className={`${base} bg-white/10 text-white/40 cursor-not-allowed`}
              >
                <PlatformIcon k={p.key} />
              </button>
            );
          }
          return (
            <a
              key={p.key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${meta.name} on ${p.label}`}
              className={`${base} bg-white text-[--brand] hover:scale-105 shadow-sm`}
              style={{ color: p.color }}
            >
              <PlatformIcon k={p.key} />
            </a>
          );
        })}
      </div>

      {!hasAnyLive && (
        <p className="text-[11px] text-white/40 mt-4 italic font-light">
          Social URLs not yet configured — placeholders shown.
        </p>
      )}
    </section>
  );
}
