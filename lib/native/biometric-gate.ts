// lib/native/biometric-gate.ts
//
// Lightweight "lock screen" for the iOS app. When the user opts in:
//   - We store a flag in localStorage indicating biometrics gate the app.
//   - On every cold launch (and resume-from-background after >5min) we
//     prompt Face ID / Touch ID before revealing app content.
//   - On failure or cancel we keep the gate up and offer a "Sign out"
//     fallback so a thief who can't unlock can still hand the phone back.
//
// We do NOT use biometrics to re-issue session cookies on this iteration.
// The session cookie is still the authority. The gate just controls
// whether the UI is visible while the cookie is valid.

const FLAG_KEY = 'caxton.biometricGate.v1';

export function isBiometricGateEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableBiometricGate(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function disableBiometricGate(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}
