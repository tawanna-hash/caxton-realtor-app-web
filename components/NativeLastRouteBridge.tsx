'use client';

// components/NativeLastRouteBridge.tsx
//
// Preserves the user's current route across native app cold starts.
//
// Problem this solves:
//   The Capacitor iOS/Android shell loads `server.url = realtynewsnow.app`
//   on cold start. That URL is the site root ('/'), so every fresh app
//   launch drops the user back on the homepage even when the last thing
//   they saw before backgrounding was `/admin/mailing/...?q=foo&page=3`
//   or `/magazine?read=330&page=12`. Web refreshes (Cmd+R, pull-to-
//   refresh) already preserve the URL because WKWebView reloads the
//   current document — this component only fires on true cold starts.
//
// Strategy:
//   1. Poll-free navigation persistence: monkey-patch history.pushState /
//      replaceState and listen for `popstate`, saving the current path +
//      query + hash to localStorage on each change.
//   2. Cold-start restore: exactly once per launch (guarded by a session-
//      storage flag), if we're inside a Capacitor native shell AND the
//      current path is the site root, replace the URL with the saved
//      one via `history.replaceState` and dispatch `popstate` so
//      Next.js's app-router picks up the new route without a network
//      trip. This is safer than router.replace() here because we don't
//      need to be inside a <Suspense/> boundary (usePathname /
//      useSearchParams aren't used).
//
// Safety:
//   - Web (non-native): every restore branch is skipped; navigation
//     persistence is still cheap and helps if we ever want to reuse the
//     saved route on desktop.
//   - Saved routes are same-origin path strings only; we never restore
//     an absolute URL or a `//host` string.
//   - `sessionStorage.caxton_last_route_restored` prevents double-
//     restore if the component unmounts / remounts during a client
//     route change.

import { useEffect } from 'react';
import { isNative } from '@/lib/native/runtime';

const LAST_ROUTE_KEY = 'caxton_last_route';
const RESTORE_FLAG_KEY = 'caxton_last_route_restored';

function safePath(raw: string | null): string | null {
  if (!raw) return null;
  // Only accept same-origin paths like "/foo/bar?x=1#h". Reject anything
  // that looks like an absolute URL, protocol-relative URL, or a bare
  // hostname. A missing leading slash almost certainly means garbage
  // written by an older build; drop it.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  // Don't persist / restore to the site root — pointless.
  if (raw === '/' || raw === '') return null;
  return raw;
}

function currentRoute(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function persistCurrent(): void {
  try {
    const cleaned = safePath(currentRoute());
    if (!cleaned) return;
    window.localStorage.setItem(LAST_ROUTE_KEY, cleaned);
  } catch {
    // localStorage can throw in private browsing modes and some webviews.
  }
}

export default function NativeLastRouteBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ── 1. Cold-start restore (native only) ────────────────────────
    // Runs exactly once per launch. sessionStorage clears on cold
    // start, so the flag distinguishes a fresh launch from a
    // component remount during in-app navigation.
    if (isNative()) {
      try {
        const alreadyRestored = window.sessionStorage.getItem(RESTORE_FLAG_KEY) === '1';
        window.sessionStorage.setItem(RESTORE_FLAG_KEY, '1');
        if (
          !alreadyRestored
          && window.location.pathname === '/'
          && !window.location.search
          && !window.location.hash
        ) {
          const saved = safePath(window.localStorage.getItem(LAST_ROUTE_KEY));
          if (saved) {
            // Rewrite the URL in-place, then let Next.js's app-router
            // hydrate to the new route. Dispatching popstate makes
            // next/navigation observers refetch their param streams.
            window.history.replaceState(window.history.state, '', saved);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }
      } catch {
        // sessionStorage / history can throw in some webviews.
      }
    }

    // ── 2. Persist current route on every navigation ───────────────
    // Monkey-patch history.pushState / replaceState so client-side
    // navigations (Next.js router.push / router.replace) trigger our
    // save. popstate handles back / forward. beforeunload handles the
    // final state before a hard reload or app close. Persist the
    // current route immediately on mount as the initial baseline.
    persistCurrent();

    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);

    window.history.pushState = function patchedPush(
      ...args: Parameters<typeof origPush>
    ) {
      const ret = origPush(...args);
      queueMicrotask(persistCurrent);
      return ret;
    };
    window.history.replaceState = function patchedReplace(
      ...args: Parameters<typeof origReplace>
    ) {
      const ret = origReplace(...args);
      queueMicrotask(persistCurrent);
      return ret;
    };

    const onPop = () => persistCurrent();
    const onBeforeUnload = () => persistCurrent();
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    // Also persist when the app is backgrounded (native lifecycle).
    // WKWebView fires visibilitychange when the shell resigns active.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistCurrent();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
