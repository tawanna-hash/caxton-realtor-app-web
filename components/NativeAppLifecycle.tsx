'use client';

// components/NativeAppLifecycle.tsx
//
// Wires Capacitor's @capacitor/app lifecycle events to the rest of the
// app. Two responsibilities:
//
//   1. Foreground refresh:
//      When the user re-opens the app after backgrounding it (a few minutes
//      switching to Messages, half an hour at lunch, overnight), the WebView
//      keeps showing the stale page. iOS users expect a fresh feed when
//      they reopen — so we dispatch caxton:ptr-refresh + router.refresh()
//      on transitions to active state.
//
//   2. Notification tray + badge clear:
//      Once the app is active, leaving unread push notifications in
//      Notification Center is annoying. We clear delivered notifications
//      and reset the app badge on every foreground.
//
//   3. Back-button / hardware-back: Apple devices don't have one but iPadOS
//      supports keyboard back; we let Capacitor's default web back work.
//
// No-op on web. Static-import-safe (the App plugin is fine to dynamic-import
// — only push-notifications has the static-import requirement per
// 8e7df2c).

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/native/runtime';
import { clearDeliveredAndBadge } from '@/lib/native/push';

export default function NativeAppLifecycle() {
  const router = useRouter();
  // Skip the very first activation — App.addListener fires once shortly
  // after mount and we don't want to refresh the page the user just
  // navigated to.
  const armedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNative()) return;

    let cancelled = false;
    let removeStateListener: (() => Promise<void>) | null = null;
    let removeResumeListener: (() => Promise<void>) | null = null;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;

        const handleActive = () => {
          // Always clear the tray + badge on activation.
          void clearDeliveredAndBadge();

          if (!armedRef.current) {
            armedRef.current = true;
            return;
          }
          // Re-fetch RSC for the current route + ping client listeners
          // to refetch their own data (reuses the PTR plumbing).
          try {
            router.refresh();
            window.dispatchEvent(
              new CustomEvent('caxton:ptr-refresh', { detail: { source: 'foreground' } }),
            );
          } catch {
            /* ignore */
          }
        };

        // appStateChange fires with { isActive: boolean } on every
        // foreground/background transition.
        const stateHandle = await App.addListener('appStateChange', (state) => {
          if (state.isActive) handleActive();
        });
        removeStateListener = () => stateHandle.remove();

        // resume is iOS-specific; some Capacitor versions fire only one
        // of the two. Bind both for safety; the de-dup happens because
        // `armedRef` only triggers a refresh on the first active call
        // after a background.
        try {
          const resumeHandle = await App.addListener('resume', handleActive);
          removeResumeListener = () => resumeHandle.remove();
        } catch {
          /* resume not available on this plugin version — fine */
        }
      } catch {
        // App plugin missing — silent degrade.
      }
    })();

    return () => {
      cancelled = true;
      if (removeStateListener) void removeStateListener();
      if (removeResumeListener) void removeResumeListener();
    };
  }, [router]);

  return null;
}
