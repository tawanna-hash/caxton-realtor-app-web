'use client';

// components/builders/BuilderPageClient.tsx
//
// Per-builder client component with mini-tabs Communities | Move-In Ready |
// Promotions. Each tab filters the same row set differently.

import { useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { trackEvent } from '@/app/posthog-provider';
import { useRouter } from 'next/navigation';
import type { BuilderInventoryRow, Publication } from '@/lib/builder-inventory';
import InventoryCard from '@/components/inventory/InventoryCard';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import PageTitle from '@/components/ui/PageTitle';
import { builderNameToSlug } from '@/lib/builder-slug';

type Props = {
  builderName: string;
  initialRows: BuilderInventoryRow[];
};

type MiniTab = 'communities' | 'moveIn' | 'promos';

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine',
  newsline: 'Newsline',
  both: 'Both',
};

function readSavedPub(): Publication {
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

const SERVER_PUB: Publication = 'realtyline';
function getServerPubSnapshot(): Publication {
  return SERVER_PUB;
}

export default function BuilderPageClient({ builderName, initialRows }: Props) {
  const router = useRouter();
  const pub = useSyncExternalStore<Publication>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  const [tab, setTab] = useState<MiniTab>('communities');

  // Floating pill actions — match the aesthetic used on EventDetail so the
  // app feels consistent. Back uses router.back() with a /dashboard fallback
  // (covers the case where the user lands here from an external share link
  // and there's no in-app history to pop).
  const onBack = useCallback(() => {
    trackEvent('builder_back_pill_clicked', { builder_name: builderName });
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  }, [router, builderName]);

  const onShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const shareData = {
      title: `${builderName} — Realty News Now`,
      text: `Communities, move-in-ready homes, and promotions from ${builderName}.`,
      url,
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        trackEvent('builder_shared', { builder_name: builderName, channel: 'native' });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        window.alert('Link copied to clipboard');
        trackEvent('builder_shared', { builder_name: builderName, channel: 'copy' });
      }
    } catch (err) {
      // User cancelled the native share sheet, or the API rejected. Either
      // way it's a no-op from our side.
      console.log('[BuilderPageClient] share cancelled or failed:', err);
    }
  }, [builderName]);

  const onDownload = useCallback(() => {
    if (typeof window === 'undefined') return;
    trackEvent('builder_download_pill_clicked', { builder_name: builderName, tab });
    // Trigger the browser's native download flow. Using a hidden <a download>
    // here (rather than window.location) keeps the current page navigation
    // intact and respects the Content-Disposition: attachment header.
    const a = document.createElement('a');
    a.href = `/api/builders/${builderNameToSlug(builderName)}/pdf`;
    a.rel = 'noopener noreferrer';
    a.click();
  }, [builderName, tab]);

  const filtered = useMemo(() => {
    return initialRows.filter((r) => {
      if (r.publication !== 'both' && r.publication !== pub) return false;
      return true;
    });
  }, [initialRows, pub]);

  const communities = useMemo(
    () => filtered.filter((r) => r.homeType === 'community'),
    [filtered],
  );
  const moveIn = useMemo(
    () => filtered.filter((r) =>
      r.homeType !== 'community' && r.kind === 'listing'
    ),
    [filtered],
  );
  const promos = useMemo(
    () => filtered.filter((r) => r.kind === 'promotion'),
    [filtered],
  );

  const currentRows =
    tab === 'communities' ? communities :
    tab === 'moveIn' ? moveIn :
    promos;

  // Blur paywall: on La Cima and Santa Rita Ranch builder pages, the
  // Move-in Ready and Promotions tabs show advertiser (featured) listings
  // fully, plus one non-advertiser teaser per underlying builder. Remaining
  // non-advertiser entries render visually blurred and non-interactive —
  // no CTA, no overlay. Unblurred items float to the top of the grid.
  const isPaywalled =
    (builderName === 'La Cima' || builderName === 'Santa Rita Ranch') &&
    (tab === 'moveIn' || tab === 'promos');

  const displayRows: Array<{ row: BuilderInventoryRow; blurred: boolean }> = useMemo(() => {
    if (!isPaywalled) {
      return currentRows.map((row) => ({ row, blurred: false }));
    }
    // SRR/La Cima are master-planned developers — every row is attributed
    // to the developer in row.builderName, with the underlying homebuilder
    // embedded in the title after an em-dash (e.g. "141 Burke St — Perry
    // Homes"). Rows without that em-dash suffix are the developer's own
    // (e.g. SRR's own promotions, community summaries).
    const extractUnderlyingBuilder = (title: string): string | null => {
      const m = title.match(/\s+[\u2014\u2013-]\s+([^\u2014\u2013-]+?)\s*$/);
      return m ? m[1].trim() : null;
    };

    // Santa Rita Ranch promotions: keep ONLY the developer's own promos
    // unblurred. Every underlying-builder promo is blurred regardless of
    // count. Featured (advertiser) rows still bypass the paywall.
    if (builderName === 'Santa Rita Ranch' && tab === 'promos') {
      const visible: BuilderInventoryRow[] = [];
      const blurred: BuilderInventoryRow[] = [];
      for (const r of currentRows) {
        if (r.featured) {
          visible.push(r);
          continue;
        }
        const ub = extractUnderlyingBuilder(r.title);
        if (ub === null) {
          // Santa Rita Ranch's own promotion — keep visible.
          visible.push(r);
        } else {
          // Builder-attributed promotion — blur.
          blurred.push(r);
        }
      }
      return [
        ...visible.map((row) => ({ row, blurred: false })),
        ...blurred.map((row) => ({ row, blurred: true })),
      ];
    }

    // Default paywall (La Cima, plus SRR Move-in Ready): keep advertiser
    // rows visible, plus one non-advertiser teaser per underlying builder.
    // Blur the rest. Unblurred items float to the top.
    const featuredRows = currentRows.filter((r) => r.featured);
    const nonFeaturedRows = currentRows.filter((r) => !r.featured);

    const seenBuilders = new Set<string>();
    const visible: BuilderInventoryRow[] = [...featuredRows];
    const blurred: BuilderInventoryRow[] = [];
    for (const r of nonFeaturedRows) {
      const ub = extractUnderlyingBuilder(r.title) ?? '__developer__';
      if (!seenBuilders.has(ub)) {
        seenBuilders.add(ub);
        visible.push(r);
      } else {
        blurred.push(r);
      }
    }

    return [
      ...visible.map((row) => ({ row, blurred: false })),
      ...blurred.map((row) => ({ row, blurred: true })),
    ];
  }, [currentRows, isPaywalled, builderName, tab]);

  // Giddens Homes uses 'Realtors' as the label for their broker-bonus
  // commission program instead of the generic 'Promotions'. Match casing
  // (lower) so the empty-state copy reads naturally too.
  const isGiddens = builderName === 'Giddens Homes';
  const promosTabLabel = isGiddens ? 'Realtors' : 'Promotions';
  const promosCountWord = (n: number) =>
    isGiddens
      ? n === 1 ? 'realtor offer' : 'realtor offers'
      : n === 1 ? 'promotion' : 'promotions';
  const promosEmptyLabel = isGiddens ? 'realtor offers' : 'promotions';

  // Unified pill style (used app-wide). Active = thin gray-900 outline on
  // white. Idle hover = subtle gray-400 — no heavy outline, no dark fill.
  const tOn = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-gray-900 bg-white text-gray-900 transition-colors';
  const tOff = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors';

  return (
    <div className="min-h-screen bg-white">
      {/* Builder header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium">
          {PUB_LABEL[pub]} • Advertiser
        </p>
        <PageTitle size="md" className="mt-1">
          {builderName}
        </PageTitle>
        <p className="text-sm text-gray-500 mt-2 font-light">
          {(() => {
            const parts: string[] = [];
            if (communities.length > 0) parts.push(`${communities.length} ${communities.length === 1 ? 'community' : 'communities'}`);
            if (moveIn.length > 0) parts.push(`${moveIn.length} move-in ${moveIn.length === 1 ? 'home' : 'homes'}`);
            if (promos.length > 0) parts.push(`${promos.length} ${promosCountWord(promos.length)}`);
            return parts.length > 0 ? parts.join(' · ') : 'No active listings right now';
          })()}
        </p>
      </div>

      {/* Mini-tabs (pills) */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-200 px-4 py-3">
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => { trackEvent('builder_tab_clicked', { tab: 'communities', builder_name: builderName }); setTab('communities'); }} className={tab === 'communities' ? tOn : tOff}>
            New Home Communities
          </button>
          <button onClick={() => { trackEvent('builder_tab_clicked', { tab: 'moveIn', builder_name: builderName }); setTab('moveIn'); }} className={tab === 'moveIn' ? tOn : tOff}>
            Move-in Ready Homes
          </button>
          <button onClick={() => { trackEvent('builder_tab_clicked', { tab: 'promos', builder_name: builderName }); setTab('promos'); }} className={tab === 'promos' ? tOn : tOff}>
            {promosTabLabel}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="px-4 py-4 pb-32">
        {currentRows.length === 0 ? (
          <p className="text-center text-gray-500 font-light py-20">
            No {tab === 'communities' ? 'communities' : tab === 'moveIn' ? 'move-in-ready homes' : promosEmptyLabel} for {builderName} in {PUB_LABEL[pub]} right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayRows.map(({ row, blurred }) =>
              blurred ? (
                <div
                  key={row.id}
                  className="pointer-events-none select-none [filter:blur(8px)]"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <InventoryCard row={row} />
                </div>
              ) : (
                <InventoryCard key={row.id} row={row} />
              ),
            )}
          </div>
        )}
      </div>

      {/* Floating action pill — unified across the app via <FloaterPill>.
          bottom-[80px] sits above the global BottomNav rendered by AppShell. */}
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
    </div>
  );
}
