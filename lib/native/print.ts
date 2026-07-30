// lib/native/print.ts
//
// Print helper that works inside the Capacitor WebView.
//
// On native iOS/Android, window.print() is a no-op inside the WKWebView,
// so we open the current page in the system browser (Safari) with a
// ?print=1 query param. The page detects that param on mount and
// auto-triggers window.print() — so the user gets the native print
// dialog without any extra taps.
//
// On web (realtynewsnow.app), window.print() works directly.

import { isNative } from './runtime';

export async function printCurrentPage(): Promise<void> {
  if (typeof window === 'undefined') return;

  if (isNative()) {
    // Open in system browser with ?print=1 so the page auto-prints on load.
    const { Browser } = await import('@capacitor/browser');
    const url = new URL(window.location.href);
    url.searchParams.set('print', '1');
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

/**
 * Call from a client component's useEffect when ?print=1 is in the URL.
 * Returns true if print was triggered so the component can skip
 * unnecessary work.
 */
export function maybeAutoPrint(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('print') !== '1') return false;

  // Small delay to let images/layout settle before the print dialog opens.
  setTimeout(() => {
    window.print();
  }, 500);

  return true;
}
