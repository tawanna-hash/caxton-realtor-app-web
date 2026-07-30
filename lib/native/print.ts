// lib/native/print.ts
//
// Print helper that works inside the Capacitor WebView.
//
// On native iOS/Android, window.print() is a no-op inside the WKWebView,
// so we open the page in the system browser (SFSafariViewController) with
// ?print=1 appended. The AutoPrint component shows an instruction banner
// telling the user to tap Safari's Share button → Print.
//
// On web (realtynewsnow.app), window.print() works directly.

import { isNative } from './runtime';

/**
 * Open the current page (or a specific URL) in the system browser for
 * printing. On native, SFSafariViewController opens with ?print=1.
 * On web, window.print() fires immediately.
 */
export async function printCurrentPage(opts?: {
  url?: string;
  pub?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNative()) {
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
