'use client';

// app/(public)/advertisers/AdvertisersDirectoryClient.tsx
//
// Client view for the public Advertisers directory. Filters the
// advertiser list to match the active publication (caxton_pub in
// localStorage) so RealtyLine and Newsline directories stay separate.
// Mirrors the useSyncExternalStore pattern used by BuilderPageClient.

import { useSyncExternalStore } from 'react';

type SitePub = 'realtyline' | 'newsline';

type DirEntry = {
  id: number;
  name: string;
  publication: 'austin' | 'san_antonio';
};

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

// Map the UI-level site pub to the DB-level publication value used on
// the advertisers table (austin = RealtyLine, san_antonio = Newsline).
const SITE_TO_DB: Record<SitePub, 'austin' | 'san_antonio'> = {
  realtyline: 'austin',
  newsline: 'san_antonio',
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
          {filtered.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-4 px-1 py-4"
            >
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: theme.accent }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-base text-gray-900 font-medium leading-tight">
                {a.name}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-gray-500 font-light py-12 border-t border-b border-gray-200">
          No advertisers to display for {theme.label} right now.
        </p>
      )}
    </section>
  );
}
