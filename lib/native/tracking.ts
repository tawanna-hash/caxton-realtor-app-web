// lib/native/tracking.ts
//
// App Tracking Transparency (ATT) wiring stub — DISABLED as of 1.0.2.
//
// STATE: no-op. `ENABLE_PROMPT` is false, no plugin is installed, and
// `NSUserTrackingUsageDescription` is intentionally NOT declared in
// Info.plist. This file exists so a future release can wire ATT quickly
// once tracking is actually needed.
//
// !! DO NOT ENABLE WITHOUT READING ios/DISTRIBUTION_CHECKLIST.md — section
// !! "ATT re-enablement rules". Enabling this without also restoring the
// !! Info.plist key AND updating the App Privacy questionnaire will get
// !! the build rejected by App Store Connect's automated scanner.
//
// When you do enable ATT:
//   1. Install `@capacitor-community/app-tracking-transparency` as a
//      dependency.
//   2. Replace the dynamic import below with a STATIC top-level import
//      (standing rule: Capacitor plugin imports must be static).
//   3. Restore `NSUserTrackingUsageDescription` in Info.plist with a
//      user-facing purpose string.
//   4. Update App Privacy answers in App Store Connect.
//   5. Set `ENABLE_PROMPT = true`.
//
// Apple requires the ATT prompt to be shown only after the app's UI is
// ready (not from didFinishLaunching). Schedule it on the next animation
// frame after the lifecycle resume event so iOS doesn't suppress it.

import { isNative } from './runtime';

const ENABLE_PROMPT = false;

export async function requestTrackingPermissionIfNeeded(): Promise<void> {
  if (!ENABLE_PROMPT) return;
  if (!isNative()) return;

  try {
    // const { AppTrackingTransparency } = await import('@capacitor-community/app-tracking-transparency');
    // const status = await AppTrackingTransparency.getStatus();
    // if (status.status === 'notDetermined') {
    //   await AppTrackingTransparency.requestPermission();
    // }
  } catch {
    // ignore
  }
}
