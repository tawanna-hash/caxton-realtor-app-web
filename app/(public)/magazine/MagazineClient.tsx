'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import MagazineCarousel from '@/components/MagazineCarousel';
import MagazineReaderRouter from '@/components/MagazineReaderRouter';
import MagazineFeatured from '@/components/MagazineFeatured';
import MagazineGuestCTA from '@/components/MagazineGuestCTA';
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
  // Guest article gate: probe /api/auth/me once on mount so we know
  // whether to intercept article link clicks with a sign-up modal.
  // Defaults to 'guest' so a network failure errs on showing the modal
  // (worst case: a signed-in user sees an account-creation pitch they
  // can dismiss; better than letting guests through to a route that
  // does not exist yet).
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authed'>('loading');
  const [showArticleGate, setShowArticleGate] = useState(false);

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

  // Probe /api/auth/me once on mount to decide whether article clicks
  // should pass through (authed) or open the create-account gate (guest).
  // Endpoint returns { realtor: null } for guests, { realtor: {...} } for
  // signed-in users (always 200, never 401 -- BUG-23 contract).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (cancelled) return;
        setAuthState(j && j.realtor ? 'authed' : 'guest');
      })
      .catch(() => {
        if (!cancelled) setAuthState('guest');
      });
    return () => {
      cancelled = true;
    };
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
      <MagazineGuestCTA brandColor={info.color} />
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
          onOpenArticle={() => {
            // Guests must create an account to read full articles; the
            // gate modal below renders the brand-colored Create account
            // and Sign in CTAs. Signed-in users currently no-op until
            // /article/[id] is wired (S23-followup).
            if (authState !== 'authed') {
              setShowArticleGate(true);
            }
          }}
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
        />
      )}
      {showArticleGate && (
        <GuestArticleGateModal
          brandColor={info.color}
          onClose={() => setShowArticleGate(false)}
        />
      )}
    </div>
  );
}

function GuestArticleGateModal({
  brandColor,
  onClose,
}: {
  brandColor: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-md shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
        >
          {'\u00D7'}
        </button>
        <p
          className="text-[10px] uppercase tracking-[0.25em] font-semibold mb-3"
          style={{ color: brandColor }}
        >
          Realtor Account Required
        </p>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Create a free account to read articles.
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">
          Magazine PDFs are free to read. Full articles, the advertiser
          directory, events calendar, and the weekly feed are unlocked
          with a free realtor account.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-medium uppercase tracking-[0.1em] text-white rounded-md"
            style={{ backgroundColor: brandColor }}
          >
            Create Account
          </Link>
          <Link
            href="/auth/sign-in"
            className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-medium uppercase tracking-[0.1em] text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
