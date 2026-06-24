'use client';

// components/DeepLinkBootstrap.tsx
//
// Mounts the Capacitor `appUrlOpen` listener for the iOS app shell.
//
// Why this exists:
//   1. iOS Universal Links (declared in App.entitlements as
//      `applinks:realtynewsnow.app`) cause iOS to deep-launch the app when
//      the user taps a magic-link or share URL on https://realtynewsnow.app.
//   2. Capacitor receives that URL but the in-app WebView's initial route
//      is still `server.url` (the homepage). Without this bootstrap, a
//      cold-launch magic-link tap lands the user on the homepage instead
//      of /auth/verify, breaking signup completion on iOS.
//
// This component is a no-op on web. It is safe to mount in the root layout.
//
// Routing strategy:
//   - Same-origin web routes (/auth/verify, /portal/…) are pushed via
//     window.location so Next.js handles them as a normal navigation.
//   - This avoids needing a Next.js router instance (we'd have to mount
//     inside <ClientProviders/>) and keeps the listener install order
//     simple: register once on app boot.

import { useEffect } from 'react';
import { installDeepLinkListener } from '@/lib/native/deep-link';

export default function DeepLinkBootstrap() {
  useEffect(() => {
    void installDeepLinkListener((path) => {
      if (typeof window === 'undefined') return;
      // Only navigate if we'd actually go somewhere new — otherwise a deep
      // link to the current page would reload it and lose form state.
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (current === path) return;
      window.location.href = path;
    });
  }, []);

  return null;
}
