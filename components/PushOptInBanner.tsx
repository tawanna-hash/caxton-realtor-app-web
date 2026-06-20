'use client';

// components/PushOptInBanner.tsx
//
// Dashboard opt-in banner. Shows a compact but visible bell + "Enable
// notifications" CTA when the visitor can subscribe. Dismissable via
// localStorage so the user only sees it once unless they clear storage.
// Self-hides when push is unsupported, denied, or already on.
//
// On iOS Safari (which only allows web push for installed PWAs), the
// banner switches to an instruction to Add to Home Screen.
//
// When the page is running INSIDE the native Capacitor iOS app, we never
// show either variant: the native app handles push through Capacitor's
// native push plugin, and the user is obviously not in a web browser.

import { useEffect, useState } from 'react';
import PushOptInButton, { type PushMarket } from './PushOptInButton';

type Props = {
  realtorId?: string | null;
  market?: PushMarket | null;
};

const DISMISS_KEY = 'rnn:push-banner-dismissed';

type CapacitorWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
};

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as CapacitorWindow;
  const cap = w.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
    if (typeof cap.getPlatform === 'function') {
      const p = cap.getPlatform();
      return p === 'ios' || p === 'android';
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isIosSafariNeedsPWA(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Never show the A2HS instruction inside the native shell - the app IS
  // already installed and notifications come through Capacitor Push.
  if (isCapacitorNative()) return false;
  const ua = navigator.userAgent;
  type LegacyNav = Navigator & { standalone?: boolean; maxTouchPoints?: number };
  const nav = navigator as LegacyNav;
  const isiOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && (nav.maxTouchPoints ?? 0) > 1);
  if (!isiOS) return false;
  const standalone =
    nav.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return !standalone && !('PushManager' in window);
}

export default function PushOptInBanner({ realtorId, market }: Props) {
  // null = still deciding; false = hide; true = show standard CTA;
  // 'ios-pwa' = show Add-to-Home-Screen hint instead
  const [actionable, setActionable] = useState<boolean | 'ios-pwa' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (localStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true);
    }

    // Inside the native Capacitor iOS app, the banner has nothing useful
    // to say: native push is wired through @capacitor/push-notifications,
    // not the web PushManager. Hide it entirely.
    if (isCapacitorNative()) {
      setActionable(false);
      return;
    }
    if (isIosSafariNeedsPWA()) {
      setActionable('ios-pwa');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setActionable(false);
      return;
    }
    if (Notification.permission === 'denied') {
      setActionable(false);
      return;
    }

    let cancelled = false;
    const settle = (value: boolean) => {
      if (!cancelled) setActionable(value);
    };

    // Race serviceWorker.ready against a 2s timeout so the banner appears
    // even on a brand-new browser where the SW is still installing.
    const timeout = setTimeout(() => settle(true), 2000);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        clearTimeout(timeout);
        settle(!sub);
      } catch {
        clearTimeout(timeout);
        settle(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!actionable || dismissed) return null;

  if (actionable === 'ios-pwa') {
    return (
      <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-base">🔔</span>
          <span className="text-xs sm:text-sm text-amber-900 font-medium leading-snug">
            Get alerts: tap Share → Add to Home Screen, then open from your home screen.
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-amber-700 hover:text-amber-900 text-lg leading-none px-1 flex-shrink-0"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true" className="text-base">🔔</span>
        <span className="text-xs sm:text-sm text-amber-900 font-medium truncate">
          Get breaking news alerts
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <PushOptInButton
          hideWhenInactive
          realtorId={realtorId ?? null}
          market={market ?? null}
          label="Enable"
          className="inline-flex items-center px-3 py-1 rounded text-xs font-semibold text-white bg-[#301D5D] hover:bg-[#493676] whitespace-nowrap"
        />
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-amber-700 hover:text-amber-900 text-lg leading-none px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}
