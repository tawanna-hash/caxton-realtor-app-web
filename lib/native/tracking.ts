// lib/native/tracking.ts
//
// App Tracking Transparency (ATT) wiring stub.
//
// As of v1.0.3 we do NOT prompt for tracking — our analytics (PostHog with
// anonymous IDs and masked inputs) does not require ATT consent per Apple's
// guidelines. We keep the entry point and the Info.plist string declared so
// that:
//   1. App Review doesn't reject us for showing tracking-like behavior
//      without the prompt string.
//   2. The moment we add an ad SDK or share an IDFA, we can flip
//      `ENABLE_PROMPT = true` and the prompt fires on app cold-start.
//
// Apple requires the ATT prompt to be shown only after the app's UI is
// ready (i.e. not from didFinishLaunching). We schedule it on the next
// animation frame after the WebView signals "ready" via the lifecycle
// resume event so iOS doesn't suppress it.
//
// Note: there is no first-party Capacitor plugin for ATT in our deps.
// When/if we enable this, install `@capacitor-community/app-tracking-
// transparency` and uncomment the dynamic import below.

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
