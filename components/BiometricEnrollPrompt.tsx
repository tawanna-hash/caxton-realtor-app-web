'use client';

// components/BiometricEnrollPrompt.tsx
//
// Inline modal shown once after a successful sign-in (Apple, password, or
// signup auto-sign-in) inviting the user to enable Face ID / Touch ID for
// next launch. Driven entirely by localStorage:
//   - caxton.biometricGate.v1   = "1" when the gate is enabled
//   - caxton.biometricGate.prompted.v1 = "1" once we've asked
//
// We never re-ask after the user dismisses. They can still enable later
// from their profile menu (BiometricToggle).

import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native/runtime';
import { enableBiometricGate, isBiometricGateEnabled } from '@/lib/native/biometric-gate';
import {
  isBiometricAvailable,
  authenticateBiometric,
  type BiometricAvailability,
} from '@/lib/native/biometric';
import { haptics } from '@/lib/native/haptics';

const PROMPTED_KEY = 'caxton.biometricGate.prompted.v1';

function alreadyPrompted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(PROMPTED_KEY) === '1';
  } catch {
    return true;
  }
}

function markPrompted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default function BiometricEnrollPrompt() {
  const [open, setOpen] = useState(false);
  const [avail, setAvail] = useState<BiometricAvailability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    const tryOpen = async () => {
      if (isBiometricGateEnabled()) return;
      if (alreadyPrompted()) return;
      const a = await isBiometricAvailable();
      if (!a.available) return;
      setAvail(a);
      setOpen(true);
    };
    // Listen for the auth-success signal dispatched by AuthGate handlers.
    const onAuthSuccess = () => { void tryOpen(); };
    window.addEventListener('caxton:authSuccess', onAuthSuccess);
    return () => {
      window.removeEventListener('caxton:authSuccess', onAuthSuccess);
    };
  }, []);

  if (!open || !avail) return null;

  const label = avail.label ?? 'Face ID';

  const onEnable = async () => {
    setBusy(true);
    const res = await authenticateBiometric({
      reason: `Confirm to enable ${label}`,
      allowDeviceCredential: false,
    });
    setBusy(false);
    if (res.ok) {
      enableBiometricGate();
      markPrompted();
      void haptics.notify('success');
      setOpen(false);
    } else if (res.reason === 'cancelled') {
      // User cancelled — don't mark prompted, give them another chance later.
      setOpen(false);
    } else {
      markPrompted();
      setOpen(false);
    }
  };

  const onSkip = () => {
    markPrompted();
    void haptics.light();
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Enable ${label}`}
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onSkip}
    >
      <div
        className="w-full max-w-sm bg-white rounded-xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4" aria-hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-800">
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="M9 9v1M15 9v1M9 14c1 1 2 1.5 3 1.5s2-.5 3-1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Enable {label}?</h2>
          <p className="text-sm text-gray-500 font-light mb-6">
            Unlock Realty News Now with {label} the next time you open the app.
          </p>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="w-full py-3 text-sm font-medium uppercase tracking-wider text-white bg-gray-900 rounded-md disabled:opacity-50 mb-2"
          >
            {busy ? 'Verifying…' : `Enable ${label}`}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-sm text-gray-500 font-light"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
