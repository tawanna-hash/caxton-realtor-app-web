'use client';

// components/NativeSplashBootstrap.tsx
//
// Hides the Capacitor native splash screen as soon as the web app is
// interactive. Without this, the iOS shell waits for the full timeout
// configured in capacitor.config.ts (1500ms) before auto-hiding, which
// makes cold starts feel sluggish and produces the Xcode warning:
//   "SplashScreen.hideSplash: SplashScreen was automatically hidden
//    after default timeout. You should call SplashScreen.hide() as
//    soon as your web app is loaded."
//
// Strategy:
//   1. No-op on web (isNative() === false) so nothing changes for PWA
//      or desktop visits.
//   2. In the native shell, dynamically import @capacitor/splash-screen
//      so this code is tree-shaken out of the web bundle.
//   3. Wait one animation frame after mount so React has actually
//      painted the dashboard before we lift the splash — otherwise the
//      user briefly sees a flash of white between splash and app.
//   4. Best-effort: swallow any errors. The native shell auto-hides on
//      timeout anyway, so a failed hide() call is non-fatal.

import { useEffect } from 'react';
import { isNative } from '@/lib/native/runtime';

export default function NativeSplashBootstrap() {
  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    const hide = async () => {
      try {
        // Dynamic import keeps the plugin out of the web bundle.
        const mod = await import('@capacitor/splash-screen');
        if (cancelled) return;
        // Wait one frame so React's first paint has flushed; this
        // prevents a brief white flash between splash dismiss and the
        // first dashboard render.
        requestAnimationFrame(async () => {
          if (cancelled) return;
          try {
            await mod.SplashScreen.hide({ fadeOutDuration: 200 });
          } catch {
            // Non-fatal: the native shell will auto-hide on timeout.
          }
        });
      } catch {
        // Plugin not available (shouldn't happen in the native shell,
        // but be defensive). Native auto-hide will still kick in.
      }
    };

    hide();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
