'use client';

// components/AutoPrint.tsx
//
// Global auto-print trigger. Mounted once in the root layout.
// When the URL contains ?print=1 (set by lib/native/print.ts when the
// native iOS app opens the page in SFSafariViewController), this component:
//   1. Waits for the window 'load' event (page fully loaded + images)
//   2. Adds a 1.5s delay for layout to settle
//   3. Calls window.print()
//   4. Shows a visible "Print this page" button as fallback if the
//      auto-trigger fails or the user dismisses the dialog and wants
//      to try again.

import { useEffect, useState } from 'react';

const BRAND_PURPLE = '#301D5D';
const SETTLE_DELAY_MS = 1500;

export default function AutoPrint() {
  const [shouldPrint, setShouldPrint] = useState(false);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') !== '1') return;

    setShouldPrint(true);

    const triggerPrint = () => {
      setTimeout(() => {
        try {
          window.print();
          setPrinted(true);
        } catch {
          // window.print() not available — the fallback button will show.
        }
      }, SETTLE_DELAY_MS);
    };

    // If the page is already loaded (cached navigation), trigger immediately.
    if (document.readyState === 'complete') {
      triggerPrint();
    } else {
      window.addEventListener('load', triggerPrint, { once: true });
      return () => window.removeEventListener('load', triggerPrint);
    }
  }, []);

  if (!shouldPrint) return null;

  return (
    <>
      {/* Visible fallback button — always present when ?print=1 so the user
          can manually trigger print if the auto-trigger fails. */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
        }}
      >
        <button
          onClick={() => {
            try {
              window.print();
              setPrinted(true);
            } catch {
              /* ignore */
            }
          }}
          style={{
            backgroundColor: BRAND_PURPLE,
            color: 'white',
            border: 'none',
            borderRadius: '9999px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            cursor: 'pointer',
          }}
          aria-label="Print this page"
        >
          {printed ? 'Print Again' : 'Print This Page'}
        </button>
      </div>
    </>
  );
}
