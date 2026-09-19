'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import MagazineCarousel from '@/components/MagazineCarousel';
import MagazineReaderRouter from '@/components/MagazineReaderRouter';
import MagazineFeatured from '@/components/MagazineFeatured';
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

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [openMag, setOpenMagState] = useState<Magazine | null>(null);
  const [currentMag, setCurrentMag] = useState<Magazine | null>(null);
  const [autoOpenLatest, setAutoOpenLatest] = useState<boolean>(false);

  // Snapshot ?page= from the URL exactly once on mount so both readers seed
  // their initial page from it. useState lazy-init runs only on the first
  // render — later URL writes (from onPageChange below) won't cause the
  // reader to remount / lose animation state because we never read the
  // URL again for this value.
  const [initialReaderPage] = useState<number>(() => {
    const raw = searchParams?.get('page');
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });

  // Track the currently-open magazine id in a ref so URL writers always
  // see the latest value even when scheduled router.replace calls race
  // each other. Reading `openMag` from closure isn't enough — the reader's
  // onPageChange effect fires on mount before the setOpenMag render has
  // committed, so a plain state read there would see null.
  const openMagIdRef = useRef<number | null>(null);

  // Wrap setOpenMag so opening / closing the reader keeps ?read=<id> in the
  // URL. On refresh the effect below rehydrates openMag by fetching the
  // magazine by that id so the reader re-opens on the same page (BUG-30).
  //
  // URL writers read from window.location.search (live) rather than the
  // useSearchParams snapshot (stale between render commits). setOpenMag
  // and handleReaderPageChange can fire in the same tick when the user
  // clicks a cover — the reader mounts, its useEffect([currentPage])
  // fires onPageChange(initialPage), and both writers race to router.replace.
  // Reading from the live URL and preserving ?read=<openMagIdRef.current>
  // makes the last-write-wins reconcile keep both params.
  function setOpenMag(m: Magazine | null) {
    openMagIdRef.current = m ? m.id : null;
    setOpenMagState(m);
    try {
      const params = new URLSearchParams(window.location.search);
      if (m) {
        params.set('read', String(m.id));
      } else {
        params.delete('read');
        // also strip in-reader page cursor when closing
        params.delete('page');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname || '/magazine'), { scroll: false });
    } catch {}
  }

  // Persist the reader's current page into ?page=<n>. Stable identity via
  // useCallback so we don't retrigger the reader's onPageChange effect.
  // Always reasserts ?read=<id> from the ref so a racing router.replace
  // that hasn't landed yet can't strip it (see setOpenMag comment).
  const handleReaderPageChange = useCallback((page: number) => {
    try {
      const params = new URLSearchParams(window.location.search);
      const openId = openMagIdRef.current;
      if (openId != null) {
        params.set('read', String(openId));
      }
      if (page > 0) {
        params.set('page', String(page));
      } else {
        params.delete('page');
      }
      const qs = params.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      router.replace(url, { scroll: false });
    } catch {}
  }, [router]);
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
    // setOpenMag is a stable function declared in this component, safe to
    // omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenLatest, currentMag]);

  // When opened via /magazine/[id], auto-open the reader on mount.
  useEffect(() => {
    if (initialMagazine) {
      openMagIdRef.current = initialMagazine.id;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time on mount, matches autoOpenLatest pattern above
      setOpenMagState(initialMagazine);
    }
    // initialMagazine is a server-passed prop, never changes after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehydrate the reader from ?read=<id> on refresh so the user lands back
  // in the same issue they were reading. Only runs on /magazine (no
  // initialMagazine) since /magazine/[id] already opens the reader above.
  useEffect(() => {
    if (initialMagazine) return;
    if (openMag) return;
    const readId = searchParams?.get('read');
    if (!readId) return;
    const idNum = Number(readId);
    if (!Number.isInteger(idNum) || idNum < 1) return;
    let cancelled = false;
    // Seed the ref immediately so URL writers preserve ?read= while the
    // fetch is in flight and the reader hasn't mounted yet.
    openMagIdRef.current = idNum;
    fetch(`/api/magazines/${idNum}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((mag) => {
        if (cancelled || !mag) return;
        openMagIdRef.current = (mag as Magazine).id;
        setOpenMagState(mag as Magazine);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Only run once on mount; ?read= is captured from initial searchParams.
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
        {/* Market switcher lives in the header title now (iOS HIG
            title-as-switcher). The inline button was redundant and was
            the smallest tap target on the page — dropped in favor of
            the global control. Show the city as a passive label so
            users still see which market they're viewing. */}
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>
      {/* Quick-jump pill: scrolls to the issues archive below the current
          issue spotlight. Hidden until currentMag has loaded so the page
          doesn't show a jump-to-nothing affordance during the initial
          fetch. */}
      {currentMag && (
        <div className="px-4 pt-6 pb-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('archives');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 bg-white text-xs uppercase tracking-[0.2em] font-medium text-gray-700 hover:bg-gray-50"
            aria-label="Jump to issues archive"
          >
            <span>Browse Issues Archive</span>
            <span className="text-gray-400">{'\u2193'}</span>
          </button>
        </div>
      )}
      {currentMag && (
        <MagazineFeatured
          magazine={currentMag}
          brandColor={info.color}
          onOpenMagazine={() => setOpenMag(currentMag)}
          onOpenArticle={() => {}}
        />
      )}
      <div id="archives" style={{ scrollMarginTop: 72 }}>
        <MagazineCarousel
          publication={pub}
          brandColor={info.color}
          onOpen={(m: Magazine) => setOpenMag(m)}
          onMagazinesLoaded={(mags: Magazine[]) => { if (mags.length > 0) setCurrentMag(mags[0]); }}
        />
      </div>
      {openMag && (
        <MagazineReaderRouter
          magazine={openMag}
          brandColor={info.color}
          onClose={() => setOpenMag(null)}
          initialPage={initialReaderPage}
          onPageChange={handleReaderPageChange}
        />
      )}
    </div>
  );
}
