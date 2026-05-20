'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import MagazineCarousel from '@/components/MagazineCarousel';
import MagazineReaderRouter from '@/components/MagazineReaderRouter';
import MagazineFeatured from '@/components/MagazineFeatured';
import type { Magazine } from '@/lib/magazines';

// Local pub type mirrors CalendarClient. Values are the dashboard SPA's
// 'realtyline' | 'newsline' stored in caxton_pub localStorage. The magazines
// API translates these internally (same way MagazinePhase has always passed
// pub directly to MagazineCarousel).
type Pub = 'realtyline' | 'newsline';

const PUBS_INFO: Record<Pub, { name: string; city: string; color: string }> = {
  realtyline: { name: 'RealtyLine', city: 'Austin', color: '#1a2a44' },
  newsline: { name: 'Newsline San Antonio', city: 'San Antonio', color: '#2d1a44' },
};

function readPub(): Pub {
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

const SERVER_PUB: Pub = 'realtyline';
function getServerPubSnapshot(): Pub {
  return SERVER_PUB;
}

export default function MagazineClient() {
  const router = useRouter();
  const pub = useSyncExternalStore(subscribePub, readPub, getServerPubSnapshot);
  const info = PUBS_INFO[pub];

  const [openMag, setOpenMag] = useState<Magazine | null>(null);
  const [currentMag, setCurrentMag] = useState<Magazine | null>(null);
  const [autoOpenLatest, setAutoOpenLatest] = useState<boolean>(false);

  // Honor caxton:openLatestMagazine if the user lands here from the existing
  // BottomNav dispatch (will be removed in C2 once nav routes here directly).
  useEffect(() => {
    const handler = () => setAutoOpenLatest(true);
    window.addEventListener('caxton:openLatestMagazine', handler);
    return () => window.removeEventListener('caxton:openLatestMagazine', handler);
  }, []);

  // Auto-open the latest issue when both flag + currentMag are ready.
  useEffect(() => {
    if (autoOpenLatest && currentMag) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO(S23-lint-debt): refactor as derived state; matches dashboard SPA pattern
      setOpenMag(currentMag);
      setAutoOpenLatest(false);
    }
  }, [autoOpenLatest, currentMag]);

  return (
    <div className="min-h-screen bg-white" style={{ paddingBottom: 96 }}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => router.back()} aria-label="Back" className="text-gray-900 p-2 -ml-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-900 font-medium ml-2">Magazine</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>
      <MagazineCarousel
        publication={pub}
        brandColor={info.color}
        onOpen={(m: Magazine) => setOpenMag(m)}
        onMagazinesLoaded={(mags: Magazine[]) => { if (mags.length > 0) setCurrentMag(mags[0]); }}
      />
      {currentMag && (
        <MagazineFeatured
          magazine={currentMag}
          brandColor={info.color}
          onOpenMagazine={() => setOpenMag(currentMag)}
          onOpenArticle={() => {
            /* TODO(S23-followup): no /article/[id] route exists yet. Wire when articles are extracted from the dashboard SPA. */
          }}
        />
      )}
      {openMag && (
        <MagazineReaderRouter
          magazine={openMag}
          brandColor={info.color}
          onClose={() => setOpenMag(null)}
        />
      )}
    </div>
  );
}
