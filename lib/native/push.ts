// lib/native/push.ts
//
// Native push registration helper. On iOS, requests notification permission,
// registers with APNs, and posts the resulting token to /api/push/native so
// the backend can store it alongside web push subscriptions. On web this is
// a no-op (web push goes through PushOptInButton.tsx + service worker).
//
// IMPORTANT: @capacitor/push-notifications is imported statically at the
// top of the module. The previous dynamic `await import()` version broke
// the production iOS bundle because esbuild stripped the binding when
// tree-shaking. We learned that lesson the hard way in commit 8e7df2c.

import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import { isNative, nativePlatform } from './runtime';

export type NativePushResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'denied' | 'unsupported' | 'error'; error?: unknown };

const LAST_TOKEN_KEY = 'caxton.native-push.token.v1';

let registered = false;
let actionHandlerInstalled = false;

function cacheToken(token: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function getCachedNativePushToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearCachedToken(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

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
    cacheToken(token);

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

// Install listeners exactly once per session so PushBootstrap can call
// this on every mount without duplicating handlers. The action handler
// routes a tap to data.url (or data.path) — whichever the server sets
// when sending the notification.
export async function installNativePushHandlers(): Promise<void> {
  if (!isNative()) return;
  if (actionHandlerInstalled) return;
  actionHandlerInstalled = true;

  try {
    // Tap-on-notification: the OS launched / foregrounded the app from a
    // notification. Navigate to the URL the server sent, if any.
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        try {
          const data = (action.notification?.data ?? {}) as Record<string, unknown>;
          const raw = data.url ?? data.path ?? data.deepLink ?? null;
          if (typeof raw !== 'string' || raw.length === 0) return;
          if (typeof window === 'undefined') return;

          // Accept absolute URLs we own (realtynewsnow.app) or any path.
          let target = raw;
          try {
            const u = new URL(raw, window.location.origin);
            // Only follow links inside our origin to avoid being used as
            // an open redirect from a malicious push payload.
            if (u.origin === window.location.origin) {
              target = u.pathname + u.search + u.hash;
            } else {
              // Cross-origin: ignore. Could log here if useful.
              return;
            }
          } catch {
            // Fall through with the raw value if it's a bare path.
            if (!raw.startsWith('/')) return;
          }

          // Use replace so the system Notification Center "Open" doesn't
          // stack history entries the user can't naturally back out of.
          // history.pushState would also work, but Next's client router
          // is the cleanest path.
          window.dispatchEvent(
            new CustomEvent('caxton:push-nav', { detail: { target } }),
          );
        } catch {
          /* swallow — push tap should never crash the app */
        }
      },
    );

    // Foreground delivery: the OS shows the notification automatically
    // on iOS only if we surface it ourselves. Emitting an event lets the
    // UI optionally show an in-app toast.
    await PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        if (typeof window === 'undefined') return;
        try {
          window.dispatchEvent(
            new CustomEvent('caxton:push-received', { detail: notification }),
          );
        } catch {
          /* ignore */
        }
      },
    );
  } catch {
    // Listeners are best-effort. If the plugin isn't initialized yet
    // (shouldn't happen in a Capacitor shell) we just skip them.
    actionHandlerInstalled = false;
  }
}

// Tell the backend this token should stop receiving pushes. Keeps the
// row around for analytics but flips revoked_at so the sender skips it.
export async function disableNativePush(): Promise<{ ok: boolean }> {
  if (!isNative()) return { ok: false };
  const token = getCachedNativePushToken();
  try {
    await fetch('/api/push/native/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        token,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
    });
    clearCachedToken();
    // Allow re-register after a disable.
    registered = false;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getNativePushPermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (!isNative()) return 'unsupported';
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}
