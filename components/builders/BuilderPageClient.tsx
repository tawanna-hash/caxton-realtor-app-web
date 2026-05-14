'use client';

// components/builders/BuilderPageClient.tsx
//
// Per-builder client component with mini-tabs Communities | Move-In Ready |
// Promotions. Each tab filters the same row set differently.

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
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
    const v = window.localStorage.getItem('savedPub');
    if (v === 'realtyline' || v === 'newsline') return v;
    if (v === 'RealtyLine') return 'realtyline';
    if (v === 'Newsline') return 'newsline';
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
  const pub = useSyncExternalStore<Publication>(
    subscribePub,
    readSavedPub,
    getServerPubSnapshot,
  );

  const [tab, setTab] = useState<MiniTab>('communities');

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

  const tOn = 'flex-1 py-3 text-sm font-medium text-center border-b-2 border-[#1a2a44] text-[#1a2a44] uppercase tracking-wider';
  const tOff = 'flex-1 py-3 text-sm font-medium text-center border-b-2 border-transparent text-gray-500 uppercase tracking-wider';

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
          {communities.length} {communities.length === 1 ? 'community' : 'communities'} ·{' '}
          {moveIn.length} move-in {moveIn.length === 1 ? 'home' : 'homes'} ·{' '}
          {promos.length} {promos.length === 1 ? 'promotion' : 'promotions'}
        </p>
      </div>

      {/* Mini-tabs */}
      <div className="flex bg-white sticky top-0 z-10 border-b border-gray-200">
        <button onClick={() => setTab('communities')} className={tab === 'communities' ? tOn : tOff}>
          Communities
        </button>
        <button onClick={() => setTab('moveIn')} className={tab === 'moveIn' ? tOn : tOff}>
          Move-In Ready
        </button>
        <button onClick={() => setTab('promos')} className={tab === 'promos' ? tOn : tOff}>
          Promos
        </button>
      </div>

      {/* List */}
      <div className="px-4 py-4">
        {currentRows.length === 0 ? (
          <p className="text-center text-gray-500 font-light py-20">
            No {tab === 'communities' ? 'communities' : tab === 'moveIn' ? 'move-in-ready homes' : 'promotions'} for {builderName} in {PUB_LABEL[pub]} right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentRows.map((row) => (
              <InventoryCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
