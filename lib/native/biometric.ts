// lib/native/biometric.ts
//
// Wrapper around @aparajita/capacitor-biometric-auth. Provides three calls:
//   - isBiometricAvailable(): checks for Face ID / Touch ID / passcode support.
//   - authenticateBiometric(reason): prompts the OS dialog and returns success.
//   - getBiometryKind(): human-readable type for UI copy ('Face ID', etc).
//
// All entry points are guarded so calling them on web is a quick no-op that
// reports unavailable rather than throwing.

import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { isNative, nativePlatform } from './runtime';

export type BiometryKind = 'face' | 'fingerprint' | 'iris' | 'none';

export type BiometricAvailability = {
  available: boolean;
  reason?: string;
  kind: BiometryKind;
  /** Human label for UI: 'Face ID', 'Touch ID', 'Biometrics', or null. */
  label: string | null;
};

function pluginAvailable(): boolean {
  return isNative();
}

function describeBiometry(typeCode: number | undefined): BiometricAvailability['kind'] {
  // iOS:    1 = touchId, 2 = faceId, 3 = opticId
  // Android: similar codes via plugin enum
  if (typeCode === 2) return 'face';
  if (typeCode === 3) return 'iris';
  if (typeCode === 1) return 'fingerprint';
  return 'none';
}

function describeLabel(kind: BiometryKind, platform: 'ios' | 'android' | 'web'): string | null {
  if (kind === 'face') return platform === 'ios' ? 'Face ID' : 'Face Unlock';
  if (kind === 'fingerprint') return platform === 'ios' ? 'Touch ID' : 'Fingerprint';
  if (kind === 'iris') return 'Optic ID';
  return null;
}

export async function isBiometricAvailable(): Promise<BiometricAvailability> {
  if (!pluginAvailable()) {
    return { available: false, reason: 'web-runtime', kind: 'none', label: null };
  }
  try {
    const info = await BiometricAuth.checkBiometry();
    const kind = describeBiometry(info?.biometryType as number | undefined);
    return {
      available: !!info?.isAvailable,
      reason: info?.reason || (info?.isAvailable ? 'ok' : 'unavailable'),
      kind,
      label: describeLabel(kind, nativePlatform()),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : 'check-failed',
      kind: 'none',
      label: null,
    };
  }
}

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unavailable' | 'locked'; message?: string };

export async function authenticateBiometric(opts: {
  reason?: string;
  cancelTitle?: string;
  allowDeviceCredential?: boolean;
}): Promise<AuthResult> {
  if (!pluginAvailable()) return { ok: false, reason: 'unavailable' };
  try {
    await BiometricAuth.authenticate({
      reason: opts.reason ?? 'Sign in to Realty News Now',
      cancelTitle: opts.cancelTitle ?? 'Cancel',
      allowDeviceCredential: opts.allowDeviceCredential ?? false,
      iosFallbackTitle: 'Use Passcode',
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('cancel') || lower.includes('userfallback')) {
      return { ok: false, reason: 'cancelled', message };
    }
    if (lower.includes('lock')) return { ok: false, reason: 'locked', message };
    if (lower.includes('available')) return { ok: false, reason: 'unavailable', message };
    return { ok: false, reason: 'failed', message };
  }
}
