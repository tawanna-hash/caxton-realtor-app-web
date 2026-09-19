// lib/native/external-link.ts
//
// Unified external-link opener.
//
// On iOS, the default behaviour of `window.open(url, '_blank')` inside a
// Capacitor WebView is to launch Safari with no way back \u2014 the user has to
// hit the app switcher to return to Realty News Now. That breaks the "this
// is an app, not a website" feel we're going for and Apple specifically
// calls it out as a polish gap in their HIG.
//
// Capacitor's @capacitor/browser plugin solves it by opening an
// SFSafariViewController sheet *inside* the app. The user sees a familiar
// Safari-like page with a Done button, taps Done, and lands back in
// Realty News Now exactly where they left off.
//
// This helper:
//   - Uses @capacitor/browser on native (SFSafariViewController)
//   - Falls back to window.open(_blank, noopener) on the web
//   - Validates the URL is http(s) so we don't accidentally hand a
//     javascript: or file: URL to the system
//   - Returns a small result object so callers can analytics-track which
//     channel was used

import { Browser } from '@capacitor/browser';
import { isNative } from './runtime';
import { haptics } from './haptics';

export type OpenExternalResult =
  | { ok: true; method: 'in-app' | 'web' }
  | { ok: false; method: 'blocked' | 'unsupported' | 'error'; error?: unknown };

const BRAND_TINT = '#301D5D';

function isValidExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Open an external URL in the most native-feeling way possible for the
 * current runtime. Returns silently on cancellation \u2014 there's no error to
 * surface when the user just dismisses the sheet.
 *
 * Triggers a light selection haptic at the moment we hand off to the
 * system so the tap feels acknowledged even before the sheet animates in.
 */
export async function openExternal(url: string): Promise<OpenExternalResult> {
  if (!url) return { ok: false, method: 'blocked' };
  if (!isValidExternalUrl(url)) return { ok: false, method: 'blocked' };

  if (isNative()) {
    try {
      void haptics.selection();
      await Browser.open({
        url,
        // toolbarColor styles the Done bar on iOS \u2014 brand purple keeps the
        // sheet visually inside the app instead of looking like a hard
        // context switch.
        toolbarColor: BRAND_TINT,
        // presentationStyle: 'popover' would behave differently on iPad.
        // 'fullscreen' is the iOS default and what users expect.
        presentationStyle: 'fullscreen',
      });
      return { ok: true, method: 'in-app' };
    } catch (error) {
      return { ok: false, method: 'error', error };
    }
  }

  // Web fallback. noopener prevents the opened page from accessing
  // window.opener (a basic security hygiene step) and noreferrer hides the
  // Realty News Now URL from the destination's analytics if we want.
  try {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { ok: true, method: 'web' };
    }
    return { ok: false, method: 'unsupported' };
  } catch (error) {
    return { ok: false, method: 'error', error };
  }
}
