'use client';

// components/communities/CommunitiesClient.tsx
//
// Client component for the /communities public page.
// Mirrors InventoryClient structure but:
//   - No kind chips (no Listings/Promotions distinction here)
//   - Reuses the existing InventoryCard for visual consistency
//   - Same publication-scope external store pattern (reads localStorage
//     `caxton_pub` with useSyncExternalStore for SSR-safe hydration)

import { useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';
import Link from 'next/link';
import { builderNameToSlug } from '@/lib/builder-slug';
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
    const v = window.localStorage.getItem('caxton_pub');
    if (v === 'realtyline' || v === 'newsline') return v;
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

  // S18 c-proper: URL pub param overrides localStorage. When present, sync
  // localStorage + dispatch savedPubChange so AppShell drawer color matches
  // the page content. (S19: unified on caxton_pub; legacy savedPub key
  // dropped — migration handled by posthog-provider on app init.)
  const searchParams = useSearchParams();
  const pubParam = searchParams.get('pub');
  const urlPub: Publication | null =
    pubParam === 'realtyline' || pubParam === 'newsline' ? pubParam : null;
  if (typeof window !== 'undefined' && urlPub && urlPub !== pub) {
    try {
      window.localStorage.setItem('caxton_pub', urlPub);
      window.dispatchEvent(new Event('savedPubChange'));
    } catch {}
  }
  const activePub: Publication = urlPub ?? pub;

  // Filter rows by publication scope. 'both' rows always show.
  const filtered = useMemo(() => {
    return initialRows.filter((r) => {
      if (r.publication === 'both') return true;
      return r.publication === activePub;
    });
  }, [initialRows, activePub]);

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

  // S13: derive unique builder list for chip strip
  const buildersForStrip = useMemo(() => {
    const set = new Set<string>();
    for (const r of initialRows) set.add(r.builderName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialRows]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* S13: By-builder directional strip */}
        {buildersForStrip.length > 0 && (
          <div className="mb-4 -mx-4 sm:-mx-0">
            <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium whitespace-nowrap pr-1">By Builder</span>
              {buildersForStrip.map((b) => (
                <Link key={b} href={`/builders/${builderNameToSlug(b)}`} onClick={() => trackEvent('builder_chip_clicked', { builder_name: b, source_page: '/communities' })} className="whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-500 rounded-md">
                  {b}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            {PUB_LABEL[pub]} · Builders &amp; Developers
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight mb-3">
            New Home Communities
          </h1>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
            {filtered.length} {filtered.length === 1 ? 'community' : 'communities'} from{' '}
            {byBuilder.length} {byBuilder.length === 1 ? 'builder' : 'builders'}.
            {' '}For specific move-in-ready homes, see Builder Inventory.
          </p>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-gray-500 font-light">
              No communities to show for {PUB_LABEL[pub]}.
            </p>
          </div>
        )}

        {/* Grouped by builder */}
        <div className="space-y-8">
        {byBuilder.map(([builder, rows]) => (
          <section key={builder}>
            <h2 className="text-sm uppercase tracking-[0.2em] text-gray-700 font-medium mb-3">
              {builder}
              <span className="ml-2 text-xs text-gray-400 font-light normal-case tracking-normal">
                ({rows.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {rows.map((row) => (
                <InventoryCard key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))}
        </div>
      </div>
    </main>
  );
}
