'use client';

// components/PushOptInButton.tsx
//
// User-initiated opt-in for web push. Renders a single button that:
//   1. Requests Notification permission (browser will only show the
//      native prompt on a real user gesture — that's why we never call
//      this on mount).
//   2. Subscribes via PushManager using the VAPID public key.
//   3. POSTs the resulting PushSubscription to /api/push/subscribe.
//
// Drop this anywhere on a public page (e.g. settings, profile, or as a
// dismissable banner) to let users opt in to notifications.

import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native/runtime';
import { registerNativePush } from '@/lib/native/push';
import { haptics } from '@/lib/native/haptics';

type Status = 'unknown' | 'unsupported' | 'ios-needs-pwa' | 'denied' | 'subscribed' | 'idle' | 'pending';

function detectIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports MacIntel; check touch points to identify it.
  type LegacyNav = Navigator & { standalone?: boolean; maxTouchPoints?: number };
  const nav = navigator as LegacyNav;
  const isiOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && (nav.maxTouchPoints ?? 0) > 1);
  return isiOS;
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  type LegacyNav = Navigator & { standalone?: boolean };
  return (
    (navigator as LegacyNav).standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

export type PushMarket = 'austin' | 'san_antonio' | 'houston' | 'dallas';

type Props = {
  realtorId?: string | null;
  market?: PushMarket | null;
  className?: string;
  /** When true, render nothing if push is unsupported / denied / already on. */
  hideWhenInactive?: boolean;
  /** Optional override for the active CTA label. */
  label?: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function PushOptInButton({ realtorId, market, className, hideWhenInactive, label }: Props) {
  const [status, setStatus] = useState<Status>('unknown');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Native app shell: report status from the Capacitor plugin instead
    // of from the browser PushManager (which isn't present in the WKWebView).
    if (isNative()) {
      (async () => {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          const perm = await PushNotifications.checkPermissions();
          if (perm.receive === 'granted') setStatus('subscribed');
          else if (perm.receive === 'denied') setStatus('denied');
          else setStatus('idle');
        } catch {
          setStatus('unsupported');
        }
      })();
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iOS Safari only exposes PushManager when the site is installed as
      // a PWA. The native iOS app handles push directly via APNs, so the
      // legacy A2HS branch (still present below) is rendered as null.
      const next =
        detectIosSafari() && !isStandalonePWA() ? 'ios-needs-pwa' : 'unsupported';
      queueMicrotask(() => setStatus(next));
      return;
    }
    if (Notification.permission === 'denied') {
      queueMicrotask(() => setStatus('denied'));
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? 'subscribed' : 'idle');
      } catch {
        setStatus('idle');
      }
    })();
  }, []);

  async function handleSubscribe() {
    setStatus('pending');

    // Native (iOS / Android app): use the Capacitor plugin path.
    if (isNative()) {
      const res = await registerNativePush({
        realtorId: realtorId ?? null,
        market: market ?? null,
      });
      if (res.ok) {
        haptics.notify('success');
        setStatus('subscribed');
      } else if (res.reason === 'denied') {
        setStatus('denied');
      } else {
        setStatus('idle');
      }
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        console.error('[PushOptInButton] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
        setStatus('idle');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          realtorId: realtorId ?? null,
          market: market ?? null,
          userAgent: navigator.userAgent,
        }),
      });
      setStatus('subscribed');
    } catch (err) {
      console.error('[PushOptInButton] subscribe failed:', err);
      setStatus('idle');
    }
  }

  async function handleUnsubscribe() {
    setStatus('pending');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus('idle');
    } catch (err) {
      console.error('[PushOptInButton] unsubscribe failed:', err);
      setStatus('subscribed');
    }
  }

  if (status === 'unknown') {
    // Detecting support — render nothing until we know.
    return null;
  }

  if (status === 'unsupported') {
    if (hideWhenInactive) return null;
    return (
      <button
        type="button"
        disabled
        className={
          className ||
          'inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed'
        }
      >
        Notifications not supported
      </button>
    );
  }

  if (status === 'ios-needs-pwa') {
    // The native iOS app handles push directly via APNs. On iOS Safari
    // the legacy A2HS prompt is misleading because users are pointed at
    // the native app instead. Hide the button entirely in this branch.
    return null;
  }

  if (status === 'denied') {
    if (hideWhenInactive) return null;
    return (
      <button
        type="button"
        disabled
        title="Permission blocked. Enable in browser site settings."
        className={
          className ||
          'inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-500 cursor-not-allowed'
        }
      >
        Notifications blocked
      </button>
    );
  }

  if (status === 'subscribed') {
    if (hideWhenInactive) return null;
    return (
      <button
        type="button"
        onClick={handleUnsubscribe}
        className={
          className ||
          'inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
        }
      >
        Notifications on · Turn off
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={status === 'pending'}
      className={
        className ||
        'inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-brand-700 hover:bg-brand-800 disabled:opacity-60'
      }
    >
      {status === 'pending' ? 'Enabling...' : label || 'Enable notifications'}
    </button>
  );
}
