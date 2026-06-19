// lib/native/push.ts
//
// Native push registration helper. On iOS, requests notification permission,
// registers with APNs, and posts the resulting token to /api/push/native so
// the backend can store it alongside web push subscriptions. On web this is
// a no-op (web push goes through PushOptInButton.tsx + service worker).

import { isNative, nativePlatform } from './runtime';

export type NativePushResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'denied' | 'unsupported' | 'error'; error?: unknown };

let registered = false;

export async function registerNativePush(opts?: {
  realtorId?: string | null;
  market?: string | null;
}): Promise<NativePushResult> {
  if (!isNative()) return { ok: false, reason: 'unsupported' };
  const platform = nativePlatform();
  if (platform !== 'ios' && platform !== 'android') {
    return { ok: false, reason: 'unsupported' };
  }
  if (registered) {
    return { ok: false, reason: 'error', error: 'already-registered' };
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
    }
    if (!granted) return { ok: false, reason: 'denied' };

    const tokenPromise = new Promise<string>((resolve, reject) => {
      const removeAll = () => {
        try {
          regHandle?.then((h) => h.remove?.()).catch(() => undefined);
          errHandle?.then((h) => h.remove?.()).catch(() => undefined);
        } catch {
          /* ignore */
        }
      };
      const regHandle = PushNotifications.addListener('registration', (t) => {
        removeAll();
        resolve(t.value);
      });
      const errHandle = PushNotifications.addListener('registrationError', (err) => {
        removeAll();
        reject(err);
      });
      // 15s safety timeout
      setTimeout(() => {
        removeAll();
        reject(new Error('registration-timeout'));
      }, 15000);
    });

    await PushNotifications.register();
    const token = await tokenPromise;
    registered = true;

    // Tell the backend about this device. Endpoint mirrors the web
    // /api/push/subscribe shape but takes a raw APNs/FCM token.
    try {
      await fetch('/api/push/native', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          platform,
          realtorId: opts?.realtorId ?? null,
          market: opts?.market ?? null,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });
    } catch {
      // Best-effort. Token is still valid; backend will see it next time.
    }

    return { ok: true, token, platform };
  } catch (error) {
    return { ok: false, reason: 'error', error };
  }
}
