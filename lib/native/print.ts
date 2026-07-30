// lib/native/print.ts
//
// Print helper that works inside the Capacitor WebView.
//
// On native iOS with the AirPrint plugin (requires app rebuild):
//   Calls UIPrintInteractionController directly — one tap, native
//   print dialog, no browser redirect.
//
// On native iOS without the plugin (old app builds):
//   Falls back to opening the page in SFSafariViewController with
//   ?print=1, where the AutoPrint banner tells the user to use
//   Safari's Share → Print.
//
// On web (realtynewsnow.app):
//   window.print() works directly.

import { isNative } from './runtime';

export async function printCurrentPage(opts?: {
  url?: string;
  pub?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNative()) {
    // Try the native AirPrint plugin first (requires app rebuild).
    try {
      const AirPrint = (await import('./airprint')).default;
      await AirPrint.printWebView({
        jobName: 'Realty News Now Listing',
      });
      return; // Native dialog presented successfully
    } catch {
      // Plugin not available (old app build) — fall through to browser
    }

    // Fallback: open in SFSafariViewController with ?print=1
    const { Browser } = await import('@capacitor/browser');
    const baseUrl = opts?.url ?? window.location.href;
    const url = new URL(baseUrl, 'https://realtynewsnow.app');

    if (!url.protocol.startsWith('http')) {
      url.protocol = 'https:';
      url.host = 'realtynewsnow.app';
    }

    url.searchParams.set('print', '1');

    if (opts?.pub) {
      url.searchParams.set('pub', opts.pub);
    } else {
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
        url.searchParams.set('pub', 'realtyline');
      }
    }

    try {
      await Browser.open({ url: url.toString() });
    } catch {
      window.print();
    }
  } else {
    window.print();
  }
}
