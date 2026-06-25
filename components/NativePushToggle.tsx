'use client';

// components/NativePushToggle.tsx
//
// Profile-panel settings row that lets a native-iOS / Android app user
// turn notifications on or off. On enable we call registerNativePush which
// prompts the OS, registers with APNs/FCM, and POSTs the token to
// /api/push/native. On disable we POST /api/push/native/disable so the
// backend marks the token disabled (we cannot revoke OS permission from
// JS, but the server stops sending to it).
//
// Renders nothing on web — web push has its own button in PushOptInBanner.

import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native/runtime';
import {
  disableNativePush,
  getNativePushPermission,
  registerNativePush,
} from '@/lib/native/push';
import { haptics } from '@/lib/native/haptics';

type Props = {
  accentColor?: string;
};

type Status = 'loading' | 'prompt' | 'granted' | 'denied' | 'unsupported' | 'busy';

export default function NativePushToggle({ accentColor = '#301D5D' }: Props) {
  // Lazy initializer so we can decide 'unsupported' synchronously without
  // an effect-time setState (which the React Compiler rule rejects).
  const [status, setStatus] = useState<Status>(() => (isNative() ? 'loading' : 'unsupported'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      const p = await getNativePushPermission();
      if (cancelled) return;
      setStatus(p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'unsupported' || status === 'loading') return null;

  const enabled = status === 'granted';

  const onToggle = async () => {
    setError(null);
    if (enabled) {
      // Turning off: we can't revoke iOS permission from JS, so the best
      // we can do is tell the server to stop sending to this device. We
      // optimistically flip the UI; if the request fails we restore.
      setStatus('busy');
      const res = await disableNativePush();
      if (res.ok) {
        void haptics.light();
        // Permission stays 'granted' at the OS layer; we surface a
        // distinct state so the row reads as "off" until the user
        // opts back in. Easiest is to drop straight to 'prompt'.
        setStatus('prompt');
      } else {
        setError('Could not turn off notifications. Try again.');
        setStatus('granted');
      }
      return;
    }

    // Turning on: registerNativePush handles the OS prompt and the
    // server POST in one call.
    setStatus('busy');
    const res = await registerNativePush();
    if (res.ok) {
      void haptics.notify('success');
      setStatus('granted');
    } else if (res.reason === 'denied') {
      setError(
        'Notifications are blocked. Enable in iOS Settings → Realty News Now.',
      );
      setStatus('denied');
    } else {
      setError('Could not enable notifications. Try again.');
      setStatus('prompt');
    }
  };

  const busy = status === 'busy';
  const blocked = status === 'denied';

  return (
    <section
      className="border border-gray-200 rounded-md p-4"
      aria-labelledby="native-push-toggle-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3
            id="native-push-toggle-heading"
            className="text-sm font-semibold text-gray-900 mb-1"
          >
            Push Notifications
          </h3>
          <p className="text-xs text-gray-500 font-light">
            Get alerts for breaking news, new issues, and event reminders.
          </p>
          {blocked && (
            <p className="mt-2 text-xs text-rose-600 font-light" role="status">
              Notifications are blocked in iOS Settings. Open Settings →
              Realty News Now → Notifications to re-enable.
            </p>
          )}
          {error && !blocked && (
            <p className="mt-2 text-xs text-rose-600 font-light" role="status">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disable' : 'Enable'} push notifications`}
          onClick={() => void onToggle()}
          disabled={busy || blocked}
          className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
          style={{ backgroundColor: enabled ? accentColor : '#d1d5db' }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: enabled ? 'translateX(22px)' : 'translateX(4px)' }}
          />
        </button>
      </div>
    </section>
  );
}
