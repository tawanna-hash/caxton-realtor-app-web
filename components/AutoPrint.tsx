'use client';

// components/AutoPrint.tsx
//
// When ?print=1 is in the URL (opened by the native iOS app's print
// button via @capacitor/browser), this component shows a small banner
// instructing the user to tap Safari's Share button → Print.
//
// window.print() cannot auto-trigger the print dialog inside an
// SFSafariViewController — iOS blocks it for security. The user must
// manually use Safari's built-in Share → Print flow.

import { useEffect, useState } from 'react';

const BRAND_PURPLE = '#301D5D';

export default function AutoPrint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') !== '1') return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: 9999,
        backgroundColor: BRAND_PURPLE,
        color: 'white',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M12 8v13" />
        <path d="M15 12H9" />
        <rect x="6" y="2" width="12" height="6" rx="1" />
        <rect x="6" y="12" width="12" height="10" rx="1" />
      </svg>
      <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>
        Tap the Share button below, then select Print.
      </span>
      <button
        onClick={() => setShow(false)}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: 'white',
          borderRadius: '9999px',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        Got it
      </button>
    </div>
  );
}
