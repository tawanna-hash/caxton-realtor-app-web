'use client';

import { type PubKey } from '@/lib/pub-meta';

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

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ArrowRight } from 'lucide-react';

type SitePub = PubKey;

type DirEntry = {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  publication: 'austin' | 'san_antonio';
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
    if (v === 'realtyline' || v === 'newsline') return v;
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
// the advertisers table. Houston/Dallas inherit the RealtyLine ('austin')
// publication slug because they're pre-launch with no advertisers of their
// own yet - filtering on 'austin' returns the empty set safely.
const SITE_TO_DB: Record<SitePub, 'austin' | 'san_antonio'> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
  'realtyline-houston': 'austin',
  'realtyline-dallas': 'austin',
};

export default function AdvertisersDirectoryClient({ advertisers, themes }: Props) {
  const pub = useSyncExternalStore<SitePub>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  const dbPub = SITE_TO_DB[pub];
  const filtered = advertisers.filter((a) => a.publication === dbPub);
  const theme = themes[pub];

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
          {filtered.length === 1 ? 'advertiser' : 'advertisers'}
        </span>
      </div>
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
                  className="group flex-1 min-w-0 flex items-center gap-2 text-base text-gray-900 font-medium leading-tight hover:underline underline-offset-2"
                >
                  <span className="flex-1 min-w-0">{a.name}</span>
                  <ArrowRight
                    className="flex-shrink-0 text-gray-400 group-hover:text-gray-700 transition-colors"
                    strokeWidth={1.75}
                    size={18}
                  />
                </Link>
                {site && (
                  <a
                    href={site}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${a.name} website (opens in new tab)`}
                    title="Visit company website"
                    className="shrink-0 w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
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
      ) : (
        <p className="text-center text-gray-500 font-light py-12 border-t border-b border-gray-200">
          No advertisers to display for {theme.label} right now.
        </p>
      )}
    </section>
  );
}
