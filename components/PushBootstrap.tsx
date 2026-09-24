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
import { usePathname, useRouter } from 'next/navigation';
import { isNative } from '@/lib/native/runtime';
import { ensureNativePushActive, installNativePushHandlers, registerNativePush } from '@/lib/native/push';
import { PushNotifications } from '@capacitor/push-notifications';

const PENDING_KEY = 'caxton_pending_push_nav';

export default function PushBootstrap() {
  const router = useRouter();
  const pathname = usePathname();

  // Re-apply a pending alert tap if a startup redirect pulled the user away.
  useEffect(() => {
    if (typeof window === 'undefined' || !isNative()) return;
    try {
      const raw = window.sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const { target, at } = JSON.parse(raw) as { target?: string; at?: number };
      if (!target || !at || Date.now() - at > 20000) {
        window.sessionStorage.removeItem(PENDING_KEY);
        return;
      }
      const targetPath = target.split(/[?#]/)[0];
      if (pathname === targetPath) {
        window.sessionStorage.removeItem(PENDING_KEY);
        return;
      }
      router.replace(target);
    } catch { /* ignore */ }
  }, [pathname, router]);

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
      // Remember the target briefly: on launch/resume the app's own startup
      // redirect (/ -> /dashboard) can land after this and override it.
      try {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ target, at: Date.now() }));
      } catch { /* ignore */ }
      router.replace(target);
    };
    window.addEventListener('caxton:push-nav', onNav);
    const onAuth = () => { void ensureNativePushActive(); };
    window.addEventListener('caxton:authSuccess', onAuth);
    // Re-confirm the device every time the app comes back to the foreground.
    let removeResume: (() => void) | null = null;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', (state) => {
        if (state.isActive) void ensureNativePushActive();
      }).then((handle) => {
        if (cancelled) void handle.remove();
        else removeResume = () => { void handle.remove(); };
      }),
    ).catch(() => undefined);

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
      window.removeEventListener('caxton:authSuccess', onAuth);
      removeResume?.();
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
