'use client';

// components/BiometricToggle.tsx
//
// Settings row that lets the user enable or disable the Face ID / Touch ID
// app lock. Mirrors the localStorage flag controlled by lib/native/biometric-gate.
// On enable we require a successful biometric prompt so we never opt the
// user in without proving the device actually supports it.
//
// Renders nothing when the device can't do biometrics (web, Android phone
// without fingerprint sensor, iPhone with Face ID disabled in Settings).
// The "More profile settings coming soon" placeholder line still shows on
// those devices so the panel doesn't look empty.

import { useEffect, useState } from 'react';
import { isNative } from '@/lib/native/runtime';
import {
  disableBiometricGate,
  enableBiometricGate,
  isBiometricGateEnabled,
} from '@/lib/native/biometric-gate';
import {
  authenticateBiometric,
  isBiometricAvailable,
  type BiometricAvailability,
} from '@/lib/native/biometric';
import { haptics } from '@/lib/native/haptics';

type Props = {
  accentColor?: string;
};

export default function BiometricToggle({ accentColor = '#301D5D' }: Props) {
  // Default to a sentinel that hides the row until we know more. On web we
  // never run the probe — the component just returns null below.
  const [avail, setAvail] = useState<BiometricAvailability | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      const a = await isBiometricAvailable();
      if (cancelled) return;
      setAvail(a);
      setEnabled(isBiometricGateEnabled());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!avail || !avail.available) return null;

  const label = avail.label ?? 'Face ID';

  const onToggle = async () => {
    setError(null);
    if (enabled) {
      // Turning off: require biometric confirmation so a thief who happens
      // to be holding the unlocked phone can't disable the gate.
      setBusy(true);
      const res = await authenticateBiometric({
        reason: `Confirm to turn off ${label}`,
        allowDeviceCredential: true,
      });
      setBusy(false);
      if (!res.ok) {
        if (res.reason !== 'cancelled') {
          setError(res.message || 'Could not verify identity.');
        }
        return;
      }
      disableBiometricGate();
      setEnabled(false);
      void haptics.light();
      return;
    }

    // Turning on: prove the OS prompt works before flipping the flag.
    setBusy(true);
    const res = await authenticateBiometric({
      reason: `Confirm to enable ${label}`,
      allowDeviceCredential: false,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.reason !== 'cancelled') {
        setError(res.message || 'Could not verify identity.');
      }
      return;
    }
    enableBiometricGate();
    setEnabled(true);
    void haptics.notify('success');
  };

  return (
    <section
      className="border border-gray-200 rounded-md p-4"
      aria-labelledby="biometric-toggle-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3
            id="biometric-toggle-heading"
            className="text-sm font-semibold text-gray-900 mb-1"
          >
            App Lock
          </h3>
          <p className="text-xs text-gray-500 font-light">
            Require {label} to open Realty News Now. Asks again after the app
            sits in the background for a few minutes.
          </p>
          {error && (
            <p className="mt-2 text-xs text-rose-600 font-light" role="status">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} app lock`}
          onClick={() => void onToggle()}
          disabled={busy}
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
