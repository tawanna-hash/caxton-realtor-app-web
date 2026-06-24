/**
 * Sign in with Apple — native (iOS) wrapper.
 *
 * Uses `@capacitor-community/apple-sign-in` when running inside the
 * Capacitor iOS shell. On web / Android / SSR this is a no-op that
 * resolves to `null` so callers can safely treat it as "not available".
 *
 * The native plugin presents Apple's system sheet, then resolves with an
 * Apple-signed identityToken (a JWT). We hand that token to our own
 * `/api/auth/apple` endpoint which verifies the signature against
 * Apple's JWKS and either signs in or creates a realtor.
 *
 * Apple only returns the user's name + email on the FIRST authorization,
 * so we forward whatever the plugin gives us; the server merges it with
 * any existing realtor record.
 */

import { isNative, nativePlatform } from './runtime';

export interface AppleSignInResult {
  /** Apple-signed JWT (the `id_token`). */
  identityToken: string;
  /** Apple `sub` claim — stable per-team user id. Sent for convenience. */
  user: string;
  /** Only present on FIRST authorization. */
  email: string | null;
  /** Only present on FIRST authorization. */
  givenName: string | null;
  /** Only present on FIRST authorization. */
  familyName: string | null;
}

/**
 * Returns true on iOS Capacitor builds where Sign in with Apple is
 * supported. The button should be hidden otherwise (per Apple HIG).
 */
export function isAppleSignInAvailable(): boolean {
  return isNative() && nativePlatform() === 'ios';
}

/**
 * Trigger the native Apple sign-in sheet. Returns null when:
 *   - we're not on iOS native
 *   - the user cancels the sheet
 *   - the plugin isn't installed (dev build before `pnpm add` + `cap sync`)
 *
 * Any other error is rethrown so the UI can surface it.
 */
export async function signInWithApple(): Promise<AppleSignInResult | null> {
  if (!isAppleSignInAvailable()) return null;

  // Dynamic import so the web bundle doesn't pull in the native plugin.
  let SignInWithApple: typeof import('@capacitor-community/apple-sign-in').SignInWithApple;
  try {
    ({ SignInWithApple } = await import('@capacitor-community/apple-sign-in'));
  } catch {
    // Plugin not yet installed in this build — treat as unavailable so the
    // app still loads. Surfaces as a button that does nothing; the user
    // would have to use email/password instead.
    if (typeof console !== 'undefined') {
      console.warn('[apple-sign-in] plugin not installed; skipping');
    }
    return null;
  }

  let resp;
  try {
    resp = await SignInWithApple.authorize({
      clientId: 'app.realtynewsnow',
      // Universal-Links redirect URI; required by the plugin even though
      // iOS native flow never actually redirects.
      redirectURI: 'https://realtynewsnow.app/auth/apple/callback',
      scopes: 'email name',
      // `state` + `nonce` are recommended; the server doesn't currently
      // enforce nonce binding but we send one for forward compatibility.
      state: 'caxton-' + Date.now().toString(36),
      nonce: cryptoNonce(),
    });
  } catch (err) {
    // The plugin throws on user-cancel. Treat 1001 (canceled) as null,
    // rethrow everything else.
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|1001/i.test(msg)) return null;
    throw err;
  }

  const r = resp.response;
  if (!r || !r.identityToken) return null;

  return {
    identityToken: r.identityToken,
    user: r.user ?? '',
    email: r.email ?? null,
    givenName: r.givenName ?? null,
    familyName: r.familyName ?? null,
  };
}

/** Cryptographically random nonce for the Apple sign-in request. */
function cryptoNonce(): string {
  try {
    const arr = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return Math.random().toString(36).slice(2);
  }
}
