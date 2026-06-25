'use client';

// hooks/use-ptr-refresh.ts
//
// Listen for the global 'caxton:ptr-refresh' window event dispatched by
// <GlobalPullToRefresh /> and return a nonce that increments every time
// the user pulls to refresh. Wire that nonce into a useEffect's
// dependency array to retrigger a client-side fetch.
//
// Usage:
//   const refreshNonce = usePtrRefresh();
//   useEffect(() => { fetch(...) }, [pub, refreshNonce]);
//
// Cheap: one event listener, one number-state.

import { useEffect, useState } from 'react';

export function usePtrRefresh(): number {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setNonce((n) => n + 1);
    window.addEventListener('caxton:ptr-refresh', handler);
    return () => {
      window.removeEventListener('caxton:ptr-refresh', handler);
    };
  }, []);

  return nonce;
}
