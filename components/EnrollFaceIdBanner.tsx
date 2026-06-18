'use client';

// components/EnrollFaceIdBanner.tsx
//
// Dashboard banner shown after a fresh password sign-in to invite the user
// to register a passkey (Face ID / Touch ID / Windows Hello). The banner:
//
//   1. Reads the 'rnn_offer_passkey_enroll' sessionStorage flag set by the
//      password-login handler.
//   2. Confirms the browser actually supports WebAuthn.
//   3. Asks the API if the user already has a passkey; renders nothing if so.
//   4. On click, runs the registration ceremony inline (no settings detour).

import { useCallback, useEffect, useState } from 'react';
import {
  startRegistration,
} from '@simplewebauthn/browser';
import { getApiBase } from '@/lib/api-base';
import { trackEvent } from '@/app/posthog-provider';

const API = getApiBase();
const DISMISS_KEY = 'rnn_passkey_enroll_dismissed_at';
const OFFER_KEY = 'rnn_offer_passkey_enroll';
const DISMISS_WINDOW_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export default function EnrollFaceIdBanner() {
  const [show, show_set] = useState(false);
  const [busy, busy_set] = useState(false);
  const [status, status_set] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.PublicKeyCredential !== 'function') return;

    // Show the banner whenever the user has no passkey yet, regardless of
    // whether they signed in via password, magic link, or fresh signup.
    // The 14-day dismiss cooldown still applies.
    try {
      const dismissedAt = Number(
        localStorage.getItem(DISMISS_KEY) || '0',
      );
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_WINDOW_MS) {
        return;
      }
    } catch {}

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API + '/auth/webauthn/credentials', {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const hasExisting =
          Array.isArray(data?.credentials) && data.credentials.length > 0;
        if (!hasExisting) show_set(true);
      } catch {
        // Network failure — be quiet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback((permanent: boolean) => {
    show_set(false);
    try {
      sessionStorage.removeItem(OFFER_KEY);
      if (permanent) {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch {}
  }, []);

  const enroll = useCallback(async () => {
    busy_set(true);
    status_set(null);
    try {
      const beginRes = await fetch(API + '/auth/webauthn/register/begin', {
        method: 'POST',
        credentials: 'include',
      });
      if (!beginRes.ok) {
        const j = await beginRes.json().catch(() => ({}));
        throw new Error(j?.error || 'Setup failed');
      }
      const { options } = await beginRes.json();

      const attestation = await startRegistration(options);

      const finishRes = await fetch(API + '/auth/webauthn/register/finish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation }),
      });
      if (!finishRes.ok) {
        const j = await finishRes.json().catch(() => ({}));
        throw new Error(j?.error || 'Setup failed');
      }

      trackEvent('passkey_enroll_succeeded', { source: 'post_login_banner' });
      status_set('Face ID enabled for next sign-in.');
      // Banner auto-hides after a short success delay.
      setTimeout(() => dismiss(true), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup failed';
      if (/NotAllow|cancell|abort/i.test(msg)) {
        status_set(null);
      } else {
        status_set(msg);
      }
      trackEvent('passkey_enroll_failed', {
        source: 'post_login_banner',
        reason: msg.slice(0, 200),
      });
    } finally {
      busy_set(false);
    }
  }, [dismiss]);

  if (!show) return null;

  return (
    <div className="px-4 py-3 bg-[#021D40] text-white flex items-center justify-between gap-3 border-b border-[#03285a]">
      <div className="flex items-center gap-3 min-w-0">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Enable Face ID / Touch ID
          </p>
          <p className="text-xs text-white/70 font-light leading-tight">
            {status || 'Skip the password next time.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={enroll}
          disabled={busy}
          className="text-xs font-semibold uppercase tracking-wider bg-white text-[#021D40] px-3 py-2 rounded disabled:opacity-50"
        >
          {busy ? 'Setting up…' : 'Enable'}
        </button>
        <button
          type="button"
          onClick={() => dismiss(true)}
          aria-label="Dismiss"
          className="text-white/70 hover:text-white p-1"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
