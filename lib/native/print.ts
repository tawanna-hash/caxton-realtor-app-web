// lib/native/print.ts
//
// Print helper that works inside the Capacitor WebView.
//
// On native iOS/Android, window.print() is a no-op inside the WKWebView,
// so we open the page in the system browser (SFSafariViewController) with
// ?print=1 appended. The global AutoPrint component detects that param,
// waits for window load, then calls window.print().
//
// On web (realtynewsnow.app), window.print() works directly.

import { isNative } from './runtime';

/**
 * Open the current page (or a specific URL) in the system browser for
 * printing. On native, SFSafariViewController opens with ?print=1 so
 * the AutoPrint component auto-triggers the print dialog. On web,
 * window.print() fires immediately.
 *
 * Optionally pass `pub` to set the ?pub= deep-link param so the page
 * doesn't need the caxton_pub cookie (which SFSafariViewController
 * doesn't share with the native app).
 */
export async function printCurrentPage(opts?: {
  url?: string;
  pub?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');

    // Use the explicit URL if provided, otherwise fall back to the current
    // page URL. We read both href and pathname because Capacitor WebView
    // with server.url sometimes returns unexpected values from href.
    const baseUrl = opts?.url ?? window.location.href;
    const url = new URL(baseUrl, 'https://realtynewsnow.app');

    // Ensure we have the full absolute URL.
    if (!url.protocol.startsWith('http')) {
      url.protocol = 'https:';
      url.host = 'realtynewsnow.app';
    }

    url.searchParams.set('print', '1');

    // Add pub param so the server doesn't need the cookie.
    if (opts?.pub) {
      url.searchParams.set('pub', opts.pub);
    } else {
      // Try to read the current pub from localStorage/cookie.
      try {
        const pub =
          localStorage.getItem('caxton_pub') ??
          document.cookie
            .split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('caxton_pub='))
            ?.split('=')[1];
        if (pub) url.searchParams.set('pub', pub);
      } catch {
        // If we can't read the pub, default to realtyline.
        url.searchParams.set('pub', 'realtyline');
      }
    }

    try {
      await Browser.open({ url: url.toString() });
    } catch {
      // Fallback: try window.print() anyway.
      window.print();
    }
  } else {
    window.print();
  }
}
