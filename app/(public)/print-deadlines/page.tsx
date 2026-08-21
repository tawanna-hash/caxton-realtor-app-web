// app/(public)/print-deadlines/page.tsx
//
// Public print-deadlines reference for advertisers.  Auto-scopes to
// whichever publication the viewer is browsing (RealtyLine on
// realtyline.com paths, Newsline on newslinesa paths, or whichever
// pub the visitor selected via the drawer switch).
//
// Design intent: this replaces the 2026-deadlines-2 WordPress page on
// realtyline.us as the source of truth *inside the app*.  The
// WordPress page can eventually redirect here.
//
// Three column tabs are exposed so an advertiser can jump straight to
// the date type they care about (space vs. print vs. digital release)
// without scanning a wide table on mobile.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { PRINT_DEADLINES_BY_PUB, type DeadlinesPub } from '@/lib/media-kit';

type ColKey = 'deadline' | 'mail' | 'digitalRelease';

const COLUMNS: Array<{ key: ColKey; label: string; sub: string }> = [
  { key: 'deadline',       label: 'Space Deadlines',   sub: 'Camera-ready artwork due' },
  { key: 'mail',           label: 'Print Release',     sub: 'Magazine mails on'         },
  { key: 'digitalRelease', label: 'Digital Release',   sub: 'e-Replica + e-blast live'  },
];

function readActivePub(): DeadlinesPub {
  if (typeof window === 'undefined') return 'realtyline';
  // realtynewsnow.app defaults to the current issue publication.
  // On advertise/inquire flows the visitor may have picked a pub via
  // the drawer; read caxton_pub localStorage set by
  // registerActivePublication().
  try {
    const saved = window.localStorage.getItem('caxton_pub');
    if (saved === 'realtyline' || saved === 'newsline') return saved;
  } catch {
    // ignore
  }
  return 'realtyline';
}

export default function PrintDeadlinesPage() {
  const [pub, setPub] = useState<DeadlinesPub>('realtyline');
  const [col, setCol] = useState<ColKey>('deadline');

  useEffect(() => {
    // Defer the initial hydration read to a microtask so we don't
    // fire a setState synchronously inside the effect body (react-
    // hooks/set-state-in-effect).  Matches the pattern used by
    // usePushSupported() in components/NavDrawer.tsx.
    queueMicrotask(() => setPub(readActivePub()));
    const handler = () => setPub(readActivePub());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'caxton_pub') handler();
    };
    window.addEventListener('savedPubChange', handler);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('savedPubChange', handler);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const data = PRINT_DEADLINES_BY_PUB[pub];
  const emptyState = data.rows.length === 0;

  const activeColumn = useMemo(
    () => COLUMNS.find((c) => c.key === col) ?? COLUMNS[0],
    [col],
  );

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            {data.name}
          </p>
          <h1 className="text-3xl font-semibold text-gray-900">
            {data.year} Print Deadlines
          </h1>
          <p className="mt-3 text-gray-700">
            Camera-ready artwork is due by the Space Deadline. The magazine
            mails on the Print Release date, and the digital edition plus
            e-blast go live on the Digital Release date.
          </p>
        </header>

        {emptyState ? (
          <section className="border border-gray-200 rounded-md p-6 bg-gray-50">
            <p className="text-gray-800 font-medium">
              {data.year} {data.name} deadlines are being finalized.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Reach out to book an issue and we&apos;ll confirm ad-close and
              release dates directly.
            </p>
            <a
              href="/advertise/inquire?channel=print"
              className="inline-flex items-center justify-center mt-4 px-4 py-2 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition"
            >
              Start a print inquiry
            </a>
          </section>
        ) : (
          <>
            {/* Column tabs (drawer-style) */}
            <div
              role="tablist"
              aria-label="Deadline column"
              className="flex gap-2 mb-6 overflow-x-auto"
            >
              {COLUMNS.map((c) => {
                const active = c.key === col;
                return (
                  <button
                    key={c.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCol(c.key)}
                    className={
                      'px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ' +
                      (active
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200')
                    }
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-gray-600 mb-4">{activeColumn.sub}</p>

            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium w-1/2">Month</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((row) => {
                    const value =
                      col === 'digitalRelease'
                        ? row.digitalRelease ?? '—'
                        : row[col];
                    return (
                      <tr key={row.month}>
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {row.month} {data.year}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.sourceUrl && (
              <p className="mt-3 text-xs text-gray-500">
                Source:{' '}
                <a
                  href={data.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-gray-700"
                >
                  {data.sourceUrl.replace(/^https?:\/\//, '')}
                </a>
              </p>
            )}
          </>
        )}

        <section className="border-t border-gray-200 mt-10 pt-8">
          <p className="text-base text-gray-700 mb-4">
            Ready to reserve space? We&apos;ll walk you through size, frequency,
            and creative specs.
          </p>
          <a
            href="/advertise/inquire?channel=print"
            className="inline-flex items-center justify-center px-5 py-2.5 border border-brand-700 text-brand-700 text-sm font-medium rounded-md hover:bg-brand-700 hover:text-white transition"
          >
            Start a print inquiry
          </a>
        </section>
      </div>
    </main>
  );
}
