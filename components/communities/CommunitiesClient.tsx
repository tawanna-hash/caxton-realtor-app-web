'use client';

// components/communities/CommunitiesClient.tsx
//
// Client component for the /communities public page.
// Mirrors InventoryClient structure but:
//   - No kind chips (no Listings/Promotions distinction here)
//   - Reuses the existing InventoryCard for visual consistency
//   - Same publication-scope external store pattern (reads localStorage
//     `savedPub` with useSyncExternalStore for SSR-safe hydration)

import { useMemo, useSyncExternalStore } from 'react';
import type { BuilderInventoryRow, Publication } from '@/lib/builder-inventory';
import InventoryCard from '@/components/inventory/InventoryCard';

type Props = {
  initialRows: BuilderInventoryRow[];
};

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
  both: 'Both',
};

// Publication state external store (same pattern as InventoryClient)
function readSavedPub(): Publication {
  if (typeof window === 'undefined') return 'realtyline';
  try {
    const v = window.localStorage.getItem('savedPub');
    if (v === 'realtyline' || v === 'newsline') return v;
    if (v === 'RealtyLine') return 'realtyline';
    if (v === 'Newsline') return 'newsline';
  } catch {
    // localStorage unavailable
  }
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

const SERVER_PUB: Publication = 'realtyline';
function getServerPubSnapshot(): Publication {
  return SERVER_PUB;
}

export default function CommunitiesClient({ initialRows }: Props) {
  const pub = useSyncExternalStore<Publication>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  // Filter rows by publication scope. 'both' rows always show.
  const filtered = useMemo(() => {
    return initialRows.filter((r) => {
      if (r.publication === 'both') return true;
      return r.publication === pub;
    });
  }, [initialRows, pub]);

  // Group by builder for display
  const byBuilder = useMemo(() => {
    const groups = new Map<string, BuilderInventoryRow[]>();
    for (const row of filtered) {
      const existing = groups.get(row.builderName) ?? [];
      existing.push(row);
      groups.set(row.builderName, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium">
          {PUB_LABEL[pub]}
        </p>
        <h1 className="text-2xl font-light text-gray-900 mt-1">
          Builder &amp; Developer Communities
        </h1>
        <p className="text-sm text-gray-500 mt-2 font-light">
          {filtered.length} {filtered.length === 1 ? 'community' : 'communities'} from{' '}
          {byBuilder.length} {byBuilder.length === 1 ? 'builder' : 'builders'}.
          {' '}For specific move-in-ready homes, see Builder Inventory.
        </p>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="px-4 py-20 text-center">
          <p className="text-gray-500 font-light">
            No communities to show for {PUB_LABEL[pub]}.
          </p>
        </div>
      )}

      {/* Grouped by builder */}
      <div className="px-4 py-4 space-y-8">
        {byBuilder.map(([builder, rows]) => (
          <section key={builder}>
            <h2 className="text-sm uppercase tracking-[0.2em] text-gray-700 font-medium mb-3">
              {builder}
              <span className="ml-2 text-xs text-gray-400 font-light normal-case tracking-normal">
                ({rows.length})
              </span>
            </h2>
            <div className="space-y-3">
              {rows.map((row) => (
                <InventoryCard key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
