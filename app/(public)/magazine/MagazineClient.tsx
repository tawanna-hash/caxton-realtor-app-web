'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import MagazineCarousel from '@/components/MagazineCarousel';
import MagazineReaderRouter from '@/components/MagazineReaderRouter';
import MagazineFeatured from '@/components/MagazineFeatured';
import MagazineGuestCTA from '@/components/MagazineGuestCTA';
import MarketSelectorButton from '@/components/MarketSelectorButton';
import type { Magazine } from '@/lib/magazines';

// Local pub type mirrors CalendarClient. Values are the dashboard SPA's
// 'realtyline' | 'newsline' stored in caxton_pub localStorage. The magazines
// API translates these internally (same way MagazinePhase has always passed
// pub directly to MagazineCarousel).
type Pub = PubKey;

// Houston/Dallas use RealtyLine navy; they share the magazine surface with
// the rest of the RealtyLine family until they have their own issues.
const PUBS_INFO: Record<Pub, { name: string; city: string; color: string }> = {
  realtyline: { name: 'RealtyLine', city: 'Austin', color: '#301D5D' },
  newsline: { name: 'Newsline San Antonio', city: 'San Antonio', color: '#301D5D' },
  'realtyline-houston': { name: 'RealtyLine Houston', city: 'Houston', color: '#301D5D' },
  'realtyline-dallas': { name: 'RealtyLine Dallas/FTW', city: 'Dallas', color: '#301D5D' },
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

interface MagazineClientProps {
  /** When set, opens the reader directly to this magazine and locks pub to its publication. Used by /magazine/[id] share links. */
  initialMagazine?: Magazine;
}

export default function MagazineClient({ initialMagazine }: MagazineClientProps = {}) {
  const storedPub = useSyncExternalStore(subscribePub, readPub, getServerPubSnapshot);
  // Only render the back chevron when the client was mounted from a
  // /magazine/[id] share link — the chevron used to call router.back(),
  // which would either pop the user off-site or land them on the
  // dashboard auth wall when /magazine was the first tab they opened.
  // On the regular /magazine list the AppShell top nav + drawer already
  // provide every escape hatch they need.
  const showBack = !!initialMagazine;
  // When opened via a share link, lock pub to the magazine's actual publication
  // so a Newsline San Antonio subscriber clicking a RealtyLine share link still sees correct branding.
  const pub: Pub = initialMagazine
    ? (initialMagazine.publication === 'austin' ? 'realtyline' : 'newsline')
    : storedPub;
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

  // When opened via /magazine/[id], auto-open the reader on mount.
  useEffect(() => {
    if (initialMagazine) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time on mount, matches autoOpenLatest pattern above
      setOpenMag(initialMagazine);
    }
    // initialMagazine is a server-passed prop, never changes after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white" style={{ paddingBottom: 96 }}>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          {showBack ? (
            <Link href="/magazine" aria-label="Back to all issues" className="text-gray-900 p-2 -ml-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
          ) : null}
          <p className="text-sm uppercase tracking-[0.2em] text-gray-900 font-medium ml-2">Issues</p>
        </div>
        {showBack ? (
          <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
        ) : (
          <MarketSelectorButton currentPub={pub} labelClassName="text-gray-500" reloadTo="/magazine" />
        )}
      </div>
      <MagazineGuestCTA brandColor={info.color} />
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
