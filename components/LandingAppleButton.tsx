'use client';

/**
 * Native-only Sign in with Apple button rendered on the marketing landing
 * page. Hidden on web — only Capacitor iOS builds see it. Mirrors the
 * Apple-sign-in handler from the dashboard AuthGate so a brand-new iOS
 * user can tap straight from the landing page into the system sheet
 * without ever touching the multi-step signup form.
 *
 * On success: hits /api/auth/apple, lets the session cookie land, and
 * hard-redirects to /dashboard so the dashboard's auth bootstrap picks
 * up the signed-in realtor.
 */

import { useState, useSyncExternalStore } from 'react';
import { isAppleSignInAvailable, signInWithApple } from '@/lib/native/apple-sign-in';
import { haptics } from '@/lib/native/haptics';

// Subscribe-free external store — the availability flag never changes during
// the lifetime of a page (you can't switch between web and native Capacitor
// without a reload), so subscribe is a no-op.
const subscribe = () => () => {};
const getSnapshot = () => isAppleSignInAvailable();
const getServerSnapshot = () => false;

export default function LandingAppleButton() {
  const available = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  async function handleAppleSignIn() {
    setError(null);
    setLoading(true);
    void haptics.light();
    try {
      const result = await signInWithApple();
      if (!result) {
        // User canceled or plugin unavailable — silent.
        setLoading(false);
        return;
      }
      const res = await fetch('/api/auth/apple', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: result.identityToken,
          email: result.email,
          givenName: result.givenName,
          familyName: result.familyName,
          rawNonce: result.rawNonce,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 404 + error: 'account_not_found' — no realtor is linked to this
        // Apple ID yet. Send the user to the dashboard auth flow with a
        // ?signup=1 hint so the AuthGate opens the signup form.
        if (res.status === 404 && data?.error === 'account_not_found') {
          void haptics.notify('warning');
          window.location.href = '/dashboard?auth=signup&reason=no_apple_account';
          return;
        }
        throw new Error(data.message || data.error || 'Apple sign-in failed');
      }
      void haptics.notify('success');
      // Hard navigation so the new caxton_session_v2 cookie is included on
      // the next request and the dashboard server component sees us as
      // signed in.
      window.location.href = '/dashboard';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Apple sign-in failed';
      void haptics.notify('error');
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center my-2" aria-hidden="true">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="px-3 text-xs uppercase tracking-wider text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <button
        onClick={handleAppleSignIn}
        disabled={loading}
        aria-label="Sign in with Apple"
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-black px-6 py-3 text-base font-medium text-white shadow-sm disabled:opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.02-2.7 2.2-3.99 2.3-4.06-1.26-1.84-3.21-2.09-3.9-2.12-1.66-.17-3.24.97-4.08.97-.85 0-2.15-.95-3.54-.92-1.82.03-3.5 1.06-4.44 2.69-1.89 3.28-.48 8.13 1.36 10.79.9 1.3 1.97 2.76 3.36 2.7 1.35-.05 1.86-.87 3.49-.87 1.62 0 2.08.87 3.51.84 1.45-.02 2.37-1.32 3.26-2.63 1.02-1.51 1.45-2.97 1.47-3.05-.03-.01-2.82-1.08-2.85-4.29zm-2.69-7.86c.75-.9 1.25-2.16 1.11-3.41-1.07.04-2.37.71-3.14 1.61-.7.79-1.31 2.07-1.14 3.29 1.19.09 2.41-.6 3.17-1.49z" /></svg>
        <span>{loading ? 'Signing in…' : 'Sign in with Apple'}</span>
      </button>
      {error && (
        <p className="text-sm text-red-600 text-center mt-1" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
