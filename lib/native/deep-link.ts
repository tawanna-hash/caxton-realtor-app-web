// lib/native/deep-link.ts
//
// Capacitor deep-link listener.
//
// When the iOS app declares Associated Domains for `applinks:realtynewsnow.app`
// (App.entitlements) and the matching apple-app-site-association file is
// served at /.well-known/apple-app-site-association, iOS routes taps on
// https://realtynewsnow.app/* links from Mail / Messages / Safari directly
// into the app. Capacitor fires the `appUrlOpen` event with the full URL.
//
// Without this listener those taps would land in the WebView at the
// /auth/verify (or wherever) page on first open, which works for an already-
// running WebView session but fails when the app is cold-launched from a
// magic-link tap — the WebView's initial URL is `server.url` (the homepage),
// not the deep link. We bridge the gap by detecting the event and pushing
// the in-WebView router to the deep-link path.
//
// On web this entire module is a no-op (the dynamic import bails out).
//
// Usage: call `installDeepLinkListener()` once from a top-level client
// component (we wire it from AppShell). Idempotent — guarded by a module
// flag so React StrictMode double-mounts don't register twice.

import { isNative } from './runtime';

let installed = false;

export type DeepLinkRouter = (path: string, fullUrl: URL) => void;

/**
 * Install the Capacitor app-url-open listener. The router callback receives
 * the path-and-search portion of the incoming URL (e.g. "/auth/verify?token=…")
 * plus the parsed URL object in case the caller wants the host or hash.
 *
 * If the host of the incoming URL is not in our allowlist, the link is
 * ignored so a malicious third party can't drive the in-app router by
 * crafting a custom-scheme URL.
 */
export async function installDeepLinkListener(router: DeepLinkRouter): Promise<void> {
  if (!isNative()) return;
  if (installed) return;
  installed = true;

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appUrlOpen', (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        const host = url.hostname.toLowerCase();
        const allowed =
          host === 'realtynewsnow.app' ||
          host.endsWith('.realtynewsnow.app') ||
          host === 'myrealtyline.com' ||
          host.endsWith('.myrealtyline.com');
        if (!allowed) return;

        const path = (url.pathname || '/') + (url.search || '') + (url.hash || '');
        router(path, url);
      } catch {
        // Malformed URL — ignore.
      }
    });
  } catch {
    // @capacitor/app missing or registration failed — degrade silently.
    installed = false;
  }
}
