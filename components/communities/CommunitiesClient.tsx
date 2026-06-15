'use client';

// components/communities/CommunitiesClient.tsx
//
// Client component for the /communities public page.
// Mirrors InventoryClient structure but:
//   - No kind chips (no Listings/Promotions distinction here)
//   - Reuses the existing InventoryCard for visual consistency
//   - Same publication-scope external store pattern (reads localStorage
//     `caxton_pub` with useSyncExternalStore for SSR-safe hydration)

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { BuilderInventoryRow, Publication } from '@/lib/builder-inventory';
import InventoryCard from '@/components/inventory/InventoryCard';
import { builderNameToSlug } from '@/lib/builder-slug';
import { trackEvent } from '@/app/posthog-provider';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import PageTitle from '@/components/ui/PageTitle';

type Props = {
  initialRows: BuilderInventoryRow[];
};

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
  'realtyline-houston': 'RealtyLine Houston',
  'realtyline-dallas': 'RealtyLine Dallas',
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
  const router = useRouter();
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

  // Unique builder list for the navigational chip strip
  const buildersForStrip = useMemo(() => {
    const set = new Set<string>();
    for (const r of initialRows) set.add(r.builderName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [initialRows]);

  // Floater handlers
  const onBack = useCallback(() => {
    trackEvent('communities_back_pill_clicked', {});
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
      title: 'New Home Communities — Realty News Now',
      text: 'Master-planned developments and active community listings.',
      url,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        trackEvent('communities_shared', { channel: 'native' });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        window.alert('Link copied to clipboard');
        trackEvent('communities_shared', { channel: 'copy' });
      }
    } catch (err) {
      console.log('[CommunitiesClient] share cancelled or failed:', err);
    }
  }, []);

  const onDownload = useCallback(() => {
    if (typeof window === 'undefined') return;
    trackEvent('communities_download_pill_clicked', {});
    const a = document.createElement('a');
    a.href = '/api/communities/pdf';
    a.rel = 'noopener noreferrer';
    a.click();
  }, []);

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
                  onClick={() => trackEvent('builder_chip_clicked', { builder_name: b, source_page: '/communities' })}
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
            New Home Communities
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
            {filtered.length} {filtered.length === 1 ? 'community' : 'communities'} from{' '}
            {byBuilder.length} {byBuilder.length === 1 ? 'builder' : 'builders'}.
            {' '}For specific move-in-ready homes, see Inventory &amp; Promotions.
          </p>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          // BUG-07: when caxton_pub is sticky on newsline (no SA communities yet),
          // a flat "0 communities" left users stranded. Surface a one-tap switch
          // back to the publication that has data.
          <div className="py-20 text-center">
            <p className="text-gray-500 font-light">
              No communities to show for {PUB_LABEL[activePub]}.
            </p>
            {activePub !== 'realtyline' && initialRows.some(
              (r) => r.publication === 'realtyline' || r.publication === 'both',
            ) && (
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.setItem('caxton_pub', 'realtyline');
                    window.dispatchEvent(new Event('savedPubChange'));
                  } catch {}
                  router.push('/communities?pub=realtyline');
                }}
                className="mt-4 inline-flex items-center justify-center min-h-[44px] px-5 py-2 text-sm font-medium text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Switch to RealtyLine Austin
              </button>
            )}
          </div>
        )}

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
