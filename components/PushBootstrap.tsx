'use client';

// components/PushBootstrap.tsx
//
// Registers the service worker on every page load. The actual permission
// prompt is gated by PushOptInPrompt so we never auto-prompt — only after
// the user explicitly opts in via the UI.
//
// On mount:
//   1. If the browser supports Service Workers, register /sw.js.
//   2. If a push subscription already exists, refresh its server row
//      (last_seen_at) by POSTing /api/push/subscribe again. This keeps
//      the subscription list accurate even when users come and go.

import { useEffect } from 'react';

export default function PushBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        if (cancelled) return;

        // If already subscribed, ping the server so we know this browser
        // is still active. Quiet no-op if the row is current.
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          try {
            await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subscription: existing.toJSON(),
                userAgent: navigator.userAgent,
              }),
            });
          } catch {
            // ignore — refresh is best-effort
          }
        }
      } catch (err) {
        // Service worker registration failures are non-fatal — the rest of
        // the app keeps working, push just stays unavailable for this user.
        console.warn('[PushBootstrap] sw registration failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
