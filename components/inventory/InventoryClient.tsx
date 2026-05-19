'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { builderNameToSlug } from '@/lib/builder-slug';
import type { BuilderInventoryRow, Kind, Publication } from '@/lib/builder-inventory';
import InventoryCard from './InventoryCard';
import FeaturedHero from './FeaturedHero';
import { trackEvent } from '@/app/posthog-provider';

type Props = {
  initialRows: BuilderInventoryRow[];
};

const KIND_CHIPS: { value: Kind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'listing', label: 'Listings' },
  { value: 'promotion', label: 'Promotions' },
];

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
  both: 'Both',
};

// ─────────────────────────────────────────────────────────────────────────
// Publication-state external store (useSyncExternalStore pattern)
// Reads localStorage `caxton_pub`. Avoids set-state-in-effect lint rule.
// (Legacy `savedPub` key migrated to `caxton_pub` in posthog-provider init.)
// ─────────────────────────────────────────────────────────────────────────

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

// Subscribe: re-read on cross-tab 'storage' event or same-tab 'savedPubChange'
// (the pub switcher elsewhere in the app can dispatch the latter when it
// changes the saved pub).
function subscribePub(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener('savedPubChange', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('savedPubChange', callback);
  };
}

// Server snapshot — always the default. Client snapshot reads localStorage.
const SERVER_PUB: Publication = 'realtyline';
function getServerPubSnapshot(): Publication {
  return SERVER_PUB;
}

// ─────────────────────────────────────────────────────────────────────────

export default function InventoryClient({ initialRows }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Publication scope — read from localStorage via useSyncExternalStore.
  // React handles SSR/CSR hydration correctly with this pattern.
  const pub = useSyncExternalStore<Publication>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  // Kind filter — read from URL, sync changes back to URL.
  const kindParam = searchParams.get('kind');
  const activeKind: Kind | 'all' =
    kindParam === 'listing' || kindParam === 'promotion' ? kindParam : 'all';

  // S18 c-proper: URL pub param overrides localStorage. When present, sync
  // localStorage + dispatch savedPubChange so AppShell drawer color matches
  // the page content. (S19: unified on caxton_pub; legacy savedPub key
  // dropped — migration handled by posthog-provider on app init.)
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

  function setKind(next: Kind | 'all') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('kind');
    else params.set('kind', next);
    const qs = params.toString();
    router.replace(qs ? `/inventory?${qs}` : '/inventory', { scroll: false });
  }

  // Filter rows by pub + kind. Exclude community summaries — those live on /communities.
  const filteredRows = useMemo(() => {
    return initialRows.filter((r) => {
      if (r.homeType === 'community') return false;
      if (r.publication !== activePub && r.publication !== 'both') return false;
      if (activeKind !== 'all' && r.kind !== activeKind) return false;
      return true;
    });
  }, [initialRows, activePub, activeKind]);

  // Split featured + regular.
  const featured = useMemo(() => filteredRows.filter((r) => r.featured), [filteredRows]);
  const regular = useMemo(() => filteredRows.filter((r) => !r.featured), [filteredRows]);

  // Featured carousel index. Use a raw counter + derive the visible index
  // via modulo so we don't need an effect when filtering changes the set.
  const [featuredIdxRaw, setFeaturedIdxRaw] = useState(0);
  const featuredIdx = featured.length > 0 ? featuredIdxRaw % featured.length : 0;

  // S13: derive unique builder list for the directional chip strip
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
                <Link key={b} href={`/builders/${builderNameToSlug(b)}`} onClick={() => trackEvent('builder_chip_clicked', { builder_name: b, source_page: '/inventory', pub })} className="whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-500 rounded-md">
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
            Builder Inventory &amp; Promotions
          </h1>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
            New home listings, quick move-ins, model home events, and limited-time promotions from builders and developers in your market. Tap any card to view the full flyer.
          </p>
        </div>

        {/* Featured carousel */}
        {featured.length > 0 && (
          <div className="mb-10">
            <FeaturedHero
              row={featured[featuredIdx]}
              showNav={featured.length > 1}
              index={featuredIdx}
              total={featured.length}
              onPrev={() =>
                setFeaturedIdxRaw((i) => (i - 1 + featured.length) % featured.length)
              }
              onNext={() =>
                setFeaturedIdxRaw((i) => (i + 1) % featured.length)
              }
            />
          </div>
        )}

        {/* Filter chips */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mr-2">
            Show:
          </span>
          {KIND_CHIPS.map((chip) => {
            const isActive = activeKind === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => {
                  trackEvent('inventory_filter_clicked', { filter: chip.value, previous_filter: activeKind, pub });
                  setKind(chip.value);
                }}
                className={
                  'px-3.5 py-1.5 text-sm font-medium border rounded-md transition-colors ' +
                  (isActive
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
                }
                aria-pressed={isActive}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {regular.length === 0 ? (
          <div className="border border-gray-200 bg-gray-50 px-6 py-12 text-center rounded-md">
            <p className="text-base text-gray-700 font-light">
              {filteredRows.length === 0
                ? `No inventory available for ${PUB_LABEL[pub]} right now. Check back soon.`
                : activeKind === 'all'
                  ? 'No additional inventory beyond the featured items above.'
                  : `No ${activeKind === 'listing' ? 'listings' : 'promotions'} available right now.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {regular.map((row) => (
              <InventoryCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
