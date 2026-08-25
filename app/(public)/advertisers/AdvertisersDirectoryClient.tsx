'use client';

import { isPubKey, type PubKey } from '@/lib/pub-meta';

// app/(public)/advertisers/AdvertisersDirectoryClient.tsx
//
// Client view for the public Advertisers directory. Filters the
// advertiser list to match the active publication (caxton_pub in
// localStorage) so RealtyLine and Newsline San Antonio directories stay separate.
// Mirrors the useSyncExternalStore pattern used by BuilderPageClient.
//
// Names link to the per-advertiser detail page at /advertisers/[slug].
// A small external-link icon next to the name opens the advertiser's
// company website in a new tab (when set).
//
// In addition to the publication filter, the directory exposes:
//   - a search input that filters by name / industry / tagline
//   - a row of category chips derived from the visible advertiser set
//   - a category / tagline subtitle on every row so the list scans
//     like a real directory instead of a bare list of names
// All filtering is client-side over the already-fetched list (under 30
// rows in production), so there is no extra network cost.

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';

type SitePub = PubKey;

type DirEntry = {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  publication: 'austin' | 'san_antonio';
  industry: string | null;
  tagline: string | null;
};

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type Props = {
  /** All advertisers (both publications) fetched server-side. */
  advertisers: DirEntry[];
  /** Resolved theme colors keyed by site-pub. */
  themes: Record<SitePub, { accent: string; label: string }>;
};

function readSavedPub(): SitePub {
  if (typeof window === 'undefined') return 'realtyline';
  try {
    const v = window.localStorage.getItem('caxton_pub');
    if (isPubKey(v)) return v;
  } catch {}
  return 'realtyline';
}

function subscribePub(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener('savedPubChange', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('savedPubChange', callback);
  };
}

const SERVER_PUB: SitePub = 'realtyline';
function getServerPubSnapshot(): SitePub {
  return SERVER_PUB;
}

// Maps the UI-level site pub to the DB-level publication value used on
// the advertisers table. Houston/Dallas do not have advertiser publication
// values yet, so they intentionally render an empty directory.
const SITE_TO_DB: Record<SitePub, 'austin' | 'san_antonio' | null> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
  'realtyline-houston': null,
  'realtyline-dallas': null,
};

export default function AdvertisersDirectoryClient({ advertisers, themes }: Props) {
  const pub = useSyncExternalStore<SitePub>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  const dbPub = SITE_TO_DB[pub];
  const inPub = useMemo(
    () => dbPub === null ? [] : advertisers.filter((a) => a.publication === dbPub),
    [advertisers, dbPub],
  );
  const theme = themes[pub];

  // Category chips are derived from the in-pub advertiser set so the
  // list of options stays in sync as the pub switches. Sorted alpha for
  // a stable order across renders.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of inPub) {
      if (a.industry && a.industry.trim()) set.add(a.industry.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [inPub]);

  // The search query matches name / industry / tagline so users can find
  // an advertiser by what they do as well as by name.
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPub.filter((a) => {
      if (activeCategory && a.industry !== activeCategory) return false;
      if (!q) return true;
      const hay = `${a.name} ${a.industry ?? ''} ${a.tagline ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [inPub, query, activeCategory]);

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">
          {theme.label}
        </p>
        <span
          className="text-xs uppercase tracking-wider font-medium"
          style={{ color: theme.accent }}
        >
          {filtered.length}{' '}
          {filtered.length === 1 ? 'partner' : 'partners'}
        </span>
      </div>

      {inPub.length > 0 && (
        <div className="mb-4 space-y-3">
          {/* Search */}
          <label className="block">
            <span className="sr-only">Search partners</span>
            <div className="relative">
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, category, or tagline"
                className="w-full min-h-[44px] pl-9 pr-3 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent"
              />
            </div>
          </label>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CategoryChip
                label="All"
                active={activeCategory === null}
                accent={theme.accent}
                onClick={() => setActiveCategory(null)}
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c}
                  label={c}
                  active={activeCategory === c}
                  accent={theme.accent}
                  onClick={() => setActiveCategory(c === activeCategory ? null : c)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 ? (
        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {filtered.map((a) => {
            const site = normalizeUrl(a.website);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 px-1 py-3"
              >
                <span
                  className="flex-shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: theme.accent }}
                  aria-hidden="true"
                />
                <Link
                  href={`/advertisers/${a.slug}`}
                  className="flex-1 min-w-0 block hover:underline underline-offset-2"
                >
                  <span className="block text-base text-gray-900 font-medium leading-tight truncate">
                    {a.name}
                  </span>
                  {(a.industry || a.tagline) && (
                    <span className="block text-xs text-gray-500 font-light leading-snug mt-0.5 truncate">
                      {a.industry}
                      {a.industry && a.tagline ? ' \u00b7 ' : ''}
                      {a.tagline}
                    </span>
                  )}
                </Link>
                {site && (
                  <a
                    href={site}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${a.name} website (opens in new tab)`}
                    title="Visit company website"
                    className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 3h6v6M11 3L5.5 8.5M3 5v6h6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : inPub.length > 0 ? (
        <p className="text-center text-gray-500 font-light py-12 border-t border-b border-gray-200">
          No advertisers match{query.trim() ? ` \u201c${query.trim()}\u201d` : ''}
          {activeCategory ? ` in ${activeCategory}` : ''}.
        </p>
      ) : (
        <p className="text-center text-gray-500 font-light py-12 border-t border-b border-gray-200">
          No advertisers to display for {theme.label} right now.
        </p>
      )}
    </section>
  );
}

function CategoryChip({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap"
      style={
        active
          ? { backgroundColor: accent, borderColor: accent, color: '#fff' }
          : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#374151' }
      }
    >
      {label}
    </button>
  );
}
