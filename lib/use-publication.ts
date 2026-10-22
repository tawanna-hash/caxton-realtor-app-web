'use client';

/**
 * usePublication — single React hook for publication state.
 *
 * All client components should call this instead of rolling their own
 * localStorage reader. Backed by useSyncExternalStore so it is SSR-safe
 * and reacts in real time to:
 *   - In-page switches (via savedPubChange event)
 *   - Cross-tab switches (via storage event)
 *
 * Initial snapshot reads the cookie first, then falls back to localStorage.
 * Because the cookie is sent on the SSR request and is visible to JS on the
 * client, server and client see the same value — no hydration mismatch and
 * no first-paint flash to RealtyLine.
 */

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { InitialPubContext } from './publication-provider';
import {
  PUB_CHANGE_EVENT,
  PUB_DEFAULT,
  type Pub,
  readClientPub,
  writeClientPub,
} from './publication';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PUB_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  window.addEventListener('focus', callback);
  window.addEventListener('pageshow', callback);
  document.addEventListener('visibilitychange', callback);
  return () => {
    window.removeEventListener('focus', callback);
    window.removeEventListener('pageshow', callback);
    document.removeEventListener('visibilitychange', callback);
    window.removeEventListener(PUB_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot(): Pub {
  return readClientPub();
}

function getServerSnapshot(): Pub {
  // SSR fallback. The real SSR value is injected by the public layout via
  // a top-level cookie read; this default is only used when the hook is
  // called outside that context.
  return PUB_DEFAULT;
}

export function usePublication(): {
  pub: Pub;
  setPub: (next: Pub) => void;
  toggle: () => void;
} {
  // Hydrate from the market the server rendered (the same one the header
  // uses) instead of a hardcoded RealtyLine, so body and header agree.
  const initial = useContext(InitialPubContext);
  const pub = useSyncExternalStore(
    subscribe,
    getSnapshot,
    initial ? () => initial : getServerSnapshot,
  );
  const setPub = useCallback((next: Pub) => writeClientPub(next), []);
  const toggle = useCallback(() => {
    writeClientPub(readClientPub() === 'newsline' ? 'realtyline' : 'newsline');
  }, []);
  return { pub, setPub, toggle };
}
