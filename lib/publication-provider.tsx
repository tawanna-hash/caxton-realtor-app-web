'use client';

/**
 * PublicationProvider — seeds the SSR initial value for usePublication.
 *
 * The public layout reads the cookie on the server and renders this
 * provider with `initialPub`. On the client, the provider rewrites the
 * cookie if needed (e.g., to backfill from localStorage for legacy users),
 * which causes usePublication's useSyncExternalStore to settle on the
 * correct value before paint with no hydration mismatch.
 */

import { createContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  readClientPub,
  writeClientPub,
  type Pub,
} from './publication';

export const InitialPubContext = createContext<Pub | null>(null);

function hasPubCookie(): boolean {
  return /(?:^|;\s*)caxton_pub=[^;]+/.test(document.cookie);
}

export function PublicationProvider({
  initialPub,
  children,
}: {
  initialPub: Pub;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const current = readClientPub();
    if (current === initialPub) return;
    if (hasPubCookie()) {
      // The cookie is authoritative and the server rendered from it, so a
      // difference can only be a stale localStorage mirror: refresh the mirror.
      writeClientPub(initialPub);
    } else {
      // No cookie (expired, or dropped by the native WebView) but the user's
      // saved market is in localStorage. The server rendered the default
      // market, so restore the cookie from the saved choice and re-render the
      // server content. Never overwrite the saved choice with the default:
      // that left the header and pages on different markets.
      writeClientPub(current);
      router.refresh();
    }
  }, [initialPub, router]);

  return <InitialPubContext.Provider value={initialPub}>{children}</InitialPubContext.Provider>;
}
