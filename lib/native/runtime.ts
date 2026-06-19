// lib/native/runtime.ts
//
// Tiny runtime detector for the Capacitor native wrapper.
// `isNative()` returns true only when the bundle is running inside the
// iOS app shell. Everywhere else (mobile web, desktop web, SSR, tests)
// it returns false so we cleanly fall back to the existing web paths.

import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'ios' || p === 'android') return p;
    return 'web';
  } catch {
    return 'web';
  }
}
