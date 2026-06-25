'use client';

// components/NativePushBanner.tsx
//
// Native-only counterpart to PushOptInBanner. Shows a dismissable opt-in
// CTA inside the iOS / Android app shell so users actually see a prompt
// without having to find the Profile → Push toggle. Hidden on web (web
// users see PushOptInBanner above), hidden inside native when permission
// is already granted or hard-denied, and hidden permanently after the
// user dismisses (separate localStorage key from the web banner).
//
// Tapping Enable triggers the OS push prompt via registerNativePush().

import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native/runtime';
import {
  getNativePushPermission,
  registerNativePush,
} from '@/lib/native/push';
import { haptics } from '@/lib/native/haptics';

const DISMISS_KEY = 'caxton.native-push-banner.dismissed.v1';

type Props = {
  realtorId?: string | null;
  market?: string | null;
};

type State = 'loading' | 'show' | 'hidden' | 'pending';

function initialState(): State {
  if (!isNative()) return 'hidden';
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1') {
      return 'hidden';
    }
  } catch {
    /* ignore */
  }
  return 'loading';
}

export default function NativePushBanner({ realtorId, market }: Props) {
  // Lazy initializer keeps the synchronous "hidden" decisions out of an
  // effect (React Compiler enforces no setState in effects).
  const [state, setState] = useState<State>(initialState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'loading') return;
    let cancelled = false;
    (async () => {
      const perm = await getNativePushPermission();
      if (cancelled) return;
      // Only ask users who haven't decided yet. 'granted' = already on,
      // 'denied' = OS-level block we can't undo, 'unsupported' = web.
      setState(perm === 'prompt' ? 'show' : 'hidden');
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === 'loading' || state === 'hidden') return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setState('hidden');
  };

  const enable = async () => {
    setError(null);
    setState('pending');
    const res = await registerNativePush({
      realtorId: realtorId ?? null,
      market: market ?? null,
    });
    if (res.ok) {
      void haptics.notify('success');
      setState('hidden');
      try {
        window.localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* ignore */
      }
    } else if (res.reason === 'denied') {
      setError('Notifications blocked. Enable in iOS Settings.');
      // Still hide the banner — the user made a choice.
      setTimeout(() => setState('hidden'), 2500);
    } else {
      setError('Could not enable. Try again later.');
      setState('show');
    }
  };

  return (
    <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-base">🔔</span>
          <span className="text-xs sm:text-sm text-amber-900 font-medium truncate">
            Get breaking news alerts
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => void enable()}
            disabled={state === 'pending'}
            className="inline-flex items-center px-3 py-1 rounded text-xs font-semibold text-white bg-[#301D5D] hover:bg-[#493676] disabled:opacity-60 whitespace-nowrap"
          >
            {state === 'pending' ? 'Enabling…' : 'Enable'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-amber-700 hover:text-amber-900 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1 text-[11px] text-rose-600 font-light" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
