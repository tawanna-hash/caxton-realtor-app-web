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
//   3. (Native) Install pushNotificationActionPerformed handlers so a
//      tap on a notification navigates to data.url, then opportunistically
//      re-register if permission is already granted.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/native/runtime';
import { installNativePushHandlers, registerNativePush } from '@/lib/native/push';
import { PushNotifications } from '@capacitor/push-notifications';

export default function PushBootstrap() {
  const router = useRouter();

  // Native: install push handlers + (if already granted) refresh the
  // server-side token. Listen for caxton:push-nav so a notification tap
  // routes through Next's client router for instant SPA navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isNative()) return;

    let cancelled = false;

    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ target?: string }>).detail;
      const target = detail?.target;
      if (typeof target !== 'string' || target.length === 0) return;
      // Use replace so the system 'Open' from a notification doesn't stack
      // a phantom history entry the user can't back out of.
      router.replace(target);
    };
    window.addEventListener('caxton:push-nav', onNav);

    (async () => {
      try {
        await installNativePushHandlers();
        if (cancelled) return;
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'granted') {
          // Already granted — refresh the server-side token.
          await registerNativePush();
        } else if (perm.receive === 'prompt') {
          // Auto-request permission on first launch — no opt-in banner needed.
          // User can still disable via iOS Settings → Notifications.
          const req = await PushNotifications.requestPermissions();
          if (req.receive === 'granted') {
            await registerNativePush();
          }
        }
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('caxton:push-nav', onNav);
    };
  }, [router]);

  // Web: register service worker + refresh subscription row.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isNative()) return;
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
