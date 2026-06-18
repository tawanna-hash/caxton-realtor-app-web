'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { builderNameToSlug } from '@/lib/builder-slug';
import type { BuilderInventoryRow, Kind, Publication } from '@/lib/builder-inventory';
import InventoryCard from './InventoryCard';
import FeaturedHero from './FeaturedHero';
import { trackEvent } from '@/app/posthog-provider';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import CategoryChipBar from '@/components/happin/CategoryChipBar';

type Props = {
  initialRows: BuilderInventoryRow[];
  // Full distinct list of builders with active inventory across the row cap.
  // Optional; falls back to deriving from initialRows when omitted.
  allBuilders?: string[];
};

// Promotions are now a separate destination (/builder-promotions),
// surfaced via the inventory-detail floater pill. The chip filter on
// this page only switches between All and Listings.
const KIND_CHIPS: { value: Kind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'listing', label: 'Listings' },
];

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline San Antonio',
  'realtyline-houston': 'RealtyLine Houston',
  'realtyline-dallas': 'RealtyLine Dallas/FTW',
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

export default function InventoryClient({ initialRows, allBuilders }: Props) {
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

  // Floater handlers — Back / Share / Download (matches communities pattern)
  const onBack = useCallback(() => {
    trackEvent('inventory_back_pill_clicked', {});
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/builders');
    }
  }, [router]);

  const onShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const shareData = {
      title: 'Inventory & Promotions — Realty News Now',
      text: 'Move-in ready inventory and limited-time promotions from every builder and developer.',
      url,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        trackEvent('inventory_shared', { channel: 'native' });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        window.alert('Link copied to clipboard');
        trackEvent('inventory_shared', { channel: 'copy' });
      }
    } catch (err) {
      console.log('[InventoryClient] share cancelled or failed:', err);
    }
  }, []);

  const onDownload = useCallback(() => {
    if (typeof window === 'undefined') return;
    trackEvent('inventory_download_pill_clicked', {});
    const a = document.createElement('a');
    a.href = '/api/inventory/pdf';
    a.rel = 'noopener noreferrer';
    a.click();
  }, []);

  // Unique builder list for the navigational chip strip. Prefer the
  // server-supplied full list so it's not truncated by the row cap.
  const buildersForStrip = useMemo(() => {
    if (allBuilders && allBuilders.length > 0) {
      return [...allBuilders].sort((a, b) => a.localeCompare(b));
    }
    const set = new Set<string>();
    for (const r of initialRows) set.add(r.builderName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialRows, allBuilders]);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Navigational builder pills (the 'By Builder' label was removed
            but the pills themselves still anchor jump-to-builder navigation). */}
        {buildersForStrip.length > 0 && (
          <div className="mb-4 -mx-4 sm:-mx-0">
            <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {buildersForStrip.map((b) => (
                <Link
                  key={b}
                  href={`/builders/${builderNameToSlug(b)}`}
                  onClick={() => trackEvent('builder_chip_clicked', { builder_name: b, source_page: '/inventory', pub })}
                  className="whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 rounded-md transition-colors"
                >
                  {b}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Advertisers · Builders &amp; Developers
          </p>
          <PageTitle size="md">
            Inventory &amp; Promotions
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
            Move-in ready inventory and limited-time promotions from every builder and developer in your market. Tap any card to view the full flyer.
          </p>
        </div>

        {/* Floating action pill — Back / Share / Download */}
        <FloaterPill
          actions={[
            {
              key: 'back',
              label: 'Back',
              onClick: onBack,
              icon: <path d="m15 18-6-6 6-6" />,
            },
            {
              key: 'share',
              label: 'Share',
              onClick: onShare,
              icon: (
                <>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </>
              ),
            },
            {
              key: 'download',
              label: 'Download',
              onClick: onDownload,
              icon: (
                <>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </>
              ),
            },
          ] satisfies FloaterAction[]}
        />

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

        {/* Featured Builder strip (paid placement) */}
        <AdSlot slug="featured_builder_strip" className="mb-6" />

        {/* Filter chips — Happin CategoryChipBar (label-driven). The
            page still tracks/syncs by Kind value, so we translate between
            the chip label shown to the user and the underlying value. */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mr-2">
            Show:
          </span>
          <CategoryChipBar
            className="flex-1 px-0 py-0 bg-transparent border-b-0"
            items={KIND_CHIPS.map((c) => c.label)}
            active={(KIND_CHIPS.find((c) => c.value === activeKind) ?? KIND_CHIPS[0]).label}
            onChange={(label) => {
              const next = (KIND_CHIPS.find((c) => c.label === label) ?? KIND_CHIPS[0]).value;
              trackEvent('inventory_filter_clicked', { filter: next, previous_filter: activeKind, pub });
              setKind(next);
            }}
          />
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
