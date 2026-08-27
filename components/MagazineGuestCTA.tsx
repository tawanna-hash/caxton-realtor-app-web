'use client';

// MagazineGuestCTA
// ----------------
// Soft sign-in / sign-up CTA shown ONLY to logged-out visitors on the
// public magazine surface. Mounts on /magazine and /magazine/[id]
// (via MagazineClient). For signed-in realtors the component renders
// nothing — a single /api/auth/me probe decides which state to show.
//
// The card is dismissable for the current session (sessionStorage flag).
// We deliberately do NOT use localStorage: a guest who opens the magazine
// in a new tab the next day should be re-prompted, since the whole point
// of the public magazine is to be a top-of-funnel lead capture.

import { useEffect, useState } from 'react';
import Link from 'next/link';

type LoadState = 'loading' | 'guest' | 'authed';

const DISMISS_KEY = 'caxton_magazine_cta_dismissed';

export default function MagazineGuestCTA({ brandColor }: { brandColor: string }) {
  const [state, setState] = useState<LoadState>('loading');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Respect a session-scoped dismissal so the banner does not nag the
    // visitor while they browse multiple issues.
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === '1') {
        queueMicrotask(() => setDismissed(true));
      }
    } catch {
      // sessionStorage can throw in private modes — fall through to fetch.
    }

    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (cancelled) return;
        // /api/auth/me returns { realtor: null } for guests and
        // { realtor: { ... } } for signed-in users.
        if (j && j.realtor) {
          setState('authed');
        } else {
          setState('guest');
        }
      })
      .catch(() => {
        // Network failure → assume guest. Worst case is the banner shows
        // briefly to a signed-in user, which is harmless.
        if (!cancelled) setState('guest');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== 'guest' || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(DISMISS_KEY, '1');
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
      <div className="mx-auto max-w-2xl flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm text-gray-900 font-medium leading-snug">
            Create a free account for the full experience.
          </p>
          <p className="text-xs text-gray-600 font-light mt-1 leading-snug">
            Sign in to access the partner directory, events calendar, builder communities, and the weekly feed.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium uppercase tracking-[0.1em] text-white rounded-md"
              style={{ backgroundColor: brandColor }}
            >
              Create account
            </Link>
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-medium uppercase tracking-[0.1em] text-gray-700 border border-gray-300 rounded-md hover:bg-white"
            >
              Sign in
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
