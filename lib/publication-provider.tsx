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

import { useEffect } from 'react';
import {
  readClientPub,
  writeClientPub,
  type Pub,
} from './publication';

export function PublicationProvider({
  initialPub,
  children,
}: {
  initialPub: Pub;
  children: React.ReactNode;
}) {
  useEffect(() => {
    // One-time reconciliation. If the cookie is missing but localStorage
    // has a value (legacy user from before the cookie migration), promote
    // the localStorage value into the cookie. Otherwise, if the cookie
    // and the in-memory state diverge, the server's initialPub already
    // matches the cookie — usePublication will pick it up.
    const current = readClientPub();
    if (current !== initialPub) {
      // Cookie is authoritative on the server. Mirror it to localStorage.
      writeClientPub(initialPub);
    }
  }, [initialPub]);

  return <>{children}</>;
}
