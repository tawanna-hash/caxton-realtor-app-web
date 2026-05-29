'use client';

// components/builders/BuilderPageClient.tsx
//
// Per-builder client component with mini-tabs Communities | Move-In Ready |
// Promotions. Each tab filters the same row set differently.

import { useMemo, useState, useSyncExternalStore, useCallback } from 'react';
import { trackEvent } from '@/app/posthog-provider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuilderInventoryRow, Publication } from '@/lib/builder-inventory';
import InventoryCard from '@/components/inventory/InventoryCard';

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

  const onPrint = useCallback(() => {
    if (typeof window === 'undefined') return;
    trackEvent('builder_print_pill_clicked', { builder_name: builderName, tab });
    window.print();
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

  const tOn = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-[#1a2a44] bg-[#1a2a44] text-white';
  const tOff = 'whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:border-gray-500';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back link */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 font-light inline-flex items-center gap-1">
          <span>{'\u2190'}</span>
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Builder header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium">
          {PUB_LABEL[pub]}
        </p>
        <h1 className="text-2xl font-light text-gray-900 mt-1">
          {builderName}
        </h1>
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
            {currentRows.map((row) => (
              <InventoryCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      {/* Floating action pill — Back / Share / Print. Same aesthetic as
          EventDetail's pill. Hidden in print output so it doesn't show up
          on the printed page itself. bottom-[80px] sits above the global
          BottomNav rendered by AppShell. */}
      <div className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-50 pointer-events-none print:hidden">
        <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-1.5 shadow-lg">
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Back</span>
          </button>
          <button
            onClick={onShare}
            aria-label="Share"
            className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Share</span>
          </button>
          <button
            onClick={onPrint}
            aria-label="Print"
            className="flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md transition-colors text-white/85 hover:text-white active:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
            <span className="text-[10px] uppercase tracking-wider mt-0.5 font-medium">Print</span>
          </button>
        </div>
      </div>
    </div>
  );
}
