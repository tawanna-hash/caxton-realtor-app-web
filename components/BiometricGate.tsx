'use client';

// components/BiometricGate.tsx
//
// Full-screen Face ID / Touch ID lock that overlays the app whenever:
//   1. We're running natively on iOS/Android, AND
//   2. The user has opted in (isBiometricGateEnabled() === true), AND
//   3. The app just cold-launched, OR
//      the app resumed from background after >5 minutes.
//
// While the gate is up the rest of the UI is rendered but covered by an
// opaque panel. Tapping "Unlock" reprompts the OS biometric dialog.
// Tapping "Sign out" clears the session cookie and reloads — useful when
// the wrong person has the phone and we never want to leak the previous
// user's content.
//
// The session cookie is still the source of truth for authentication.
// This is purely a UI gate that protects content while the cookie is
// valid. We deliberately do NOT decrypt or re-issue any credentials.

import { useCallback, useEffect, useRef, useState } from 'react';
import { App, type AppState } from '@capacitor/app';
import { isNative } from '@/lib/native/runtime';
import { isBiometricGateEnabled, disableBiometricGate } from '@/lib/native/biometric-gate';
import {
  authenticateBiometric,
  isBiometricAvailable,
  type BiometricAvailability,
} from '@/lib/native/biometric';

const RESUME_LOCK_MS = 5 * 60 * 1000; // 5 minutes

type Phase = 'idle' | 'locked' | 'authenticating' | 'unlocked';

export default function BiometricGate() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState<BiometricAvailability | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const lastActiveAt = useRef<number>(0);

  // Seed the timestamp once on mount (avoids impure ref initializer).
  useEffect(() => {
    lastActiveAt.current = Date.now();
  }, []);

  const runUnlock = useCallback(async () => {
    setPhase('authenticating');
    setError(null);
    const label = available?.label ?? 'Face ID';
    const res = await authenticateBiometric({
      reason: `Unlock Realty News Now with ${label}`,
      allowDeviceCredential: true,
    });
    if (res.ok) {
      setPhase('unlocked');
      return;
    }
    setPhase('locked');
    if (res.reason === 'cancelled') {
      setError('Authentication cancelled.');
    } else if (res.reason === 'locked') {
      setError('Biometrics locked. Use your passcode to continue.');
    } else if (res.reason === 'unavailable') {
      // Biometrics removed — fail open so we don't lock the user out.
      disableBiometricGate();
      setEnabled(false);
      setPhase('unlocked');
    } else {
      setError(res.message || 'Could not verify identity. Try again.');
    }
  }, [available]);

  // Decide on mount whether to lock the app.
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      const on = isBiometricGateEnabled();
      if (!on) {
        if (!cancelled) setEnabled(false);
        return;
      }
      const avail = await isBiometricAvailable();
      if (cancelled) return;
      setAvailable(avail);
      setEnabled(true);
      // Cold launch -> always lock when enabled + available.
      if (avail.available) {
        setPhase('locked');
      } else {
        // User opted in earlier but biometrics no longer available
        // (Face ID disabled in Settings, etc). Don't strand them —
        // unlock the UI and clear the flag so we don't spin forever.
        disableBiometricGate();
        setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-lock when app resumes from background after >5 min.
  useEffect(() => {
    if (!isNative() || !enabled) return;
    let detach: (() => void) | undefined;
    (async () => {
      try {
        const handle = await App.addListener('appStateChange', (state: AppState) => {
          if (state.isActive) {
            const away = Date.now() - lastActiveAt.current;
            if (away >= RESUME_LOCK_MS) {
              setPhase('locked');
              setError(null);
            }
            lastActiveAt.current = Date.now();
          } else {
            lastActiveAt.current = Date.now();
          }
        });
        detach = () => {
          handle.remove();
        };
      } catch {
        /* App plugin missing — non-fatal */
      }
    })();
    return () => {
      if (detach) detach();
    };
  }, [enabled]);

  // Auto-prompt as soon as we enter the locked phase. setPhase inside
  // runUnlock is intentional — we're synchronizing UI to the OS biometric
  // dialog, an external system, not deriving state.
  useEffect(() => {
    if (phase !== 'locked') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kicks off the OS biometric dialog
    void runUnlock();
  }, [phase, runUnlock]);

  const onSignOut = useCallback(() => {
    try {
      document.cookie = 'caxton_session=; Path=/; Max-Age=0; SameSite=Lax';
    } catch {}
    try {
      window.localStorage.removeItem('caxton_session_user');
    } catch {}
    disableBiometricGate();
    try {
      window.location.replace('/dashboard');
    } catch {
      window.location.reload();
    }
  }, []);

  if (!enabled || phase === 'idle' || phase === 'unlocked') return null;

  const label = available?.label ?? 'Face ID';
  const busy = phase === 'authenticating';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex flex-col items-center px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-6" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-800">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M9 9v1M15 9v1M9 14c1 1 2 1.5 3 1.5s2-.5 3-1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 font-medium mb-2">Realty News Now</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Locked</h1>
        <p className="text-sm text-gray-500 font-light mb-8">
          Use {label} to unlock the app.
        </p>
        <button
          type="button"
          onClick={() => void runUnlock()}
          disabled={busy}
          className="w-full max-w-xs py-3.5 text-base font-medium uppercase tracking-wider text-white bg-gray-900 disabled:opacity-50 rounded-md mb-3"
        >
          {busy ? 'Verifying…' : `Unlock with ${label}`}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-sm text-gray-500 underline underline-offset-4 mt-2"
        >
          Sign out
        </button>
        {error && (
          <p className="mt-6 text-xs text-rose-600 font-light" role="status">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
