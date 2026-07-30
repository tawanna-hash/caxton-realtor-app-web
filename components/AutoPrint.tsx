'use client';

// components/AutoPrint.tsx
//
// Global auto-print trigger. Mounted once in the root layout.
// When the URL contains ?print=1 (set by lib/native/print.ts when the
// native iOS app opens the page in SFSafariViewController), this component:
//   1. Waits for the window 'load' event (page fully loaded + images)
//   2. Adds a 1.5s delay for layout to settle
//   3. Calls window.print()

import { useEffect } from 'react';

const SETTLE_DELAY_MS = 1500;

export default function AutoPrint() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') !== '1') return;

    const triggerPrint = () => {
      setTimeout(() => {
        try {
          window.print();
        } catch {
          /* ignore */
        }
      }, SETTLE_DELAY_MS);
    };

    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint, { once: true });
      return () => window.removeEventListener('load', triggerPrint);
    }
  }, []);

  return null;
}
