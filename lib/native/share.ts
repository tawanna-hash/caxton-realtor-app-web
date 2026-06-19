// lib/native/share.ts
//
// Unified share API. Order of preference:
//   1. Native Capacitor Share plugin (iOS UIActivityViewController) when
//      running inside the app shell.
//   2. Web Share API (`navigator.share`) when available.
//   3. Clipboard copy of the URL with a small confirmation flag returned.

import { isNative } from './runtime';

export type ShareInput = {
  /** Optional dialog title (iOS shows this in the share sheet header). */
  title?: string;
  /** Body text. Many social targets prepend this to the URL. */
  text?: string;
  /** Canonical URL to share — required for most use cases. */
  url?: string;
  /** Dialog title shown on Android. Ignored on iOS / web. */
  dialogTitle?: string;
};

export type ShareResult =
  | { ok: true; method: 'native' | 'web' | 'clipboard' }
  | { ok: false; method: 'cancelled' | 'unsupported' | 'error'; error?: unknown };

export async function share(input: ShareInput): Promise<ShareResult> {
  // 1. Capacitor native
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      const can = await Share.canShare();
      if (can?.value) {
        await Share.share({
          title: input.title,
          text: input.text,
          url: input.url,
          dialogTitle: input.dialogTitle ?? input.title,
        });
        return { ok: true, method: 'native' };
      }
    } catch (error) {
      // User cancelled — Capacitor throws on cancel. Treat as cancelled.
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('cancel') || message.includes('abort')) {
        return { ok: false, method: 'cancelled' };
      }
      // Fall through to web path on unexpected error.
    }
  }

  // 2. Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: input.title, text: input.text, url: input.url });
      return { ok: true, method: 'web' };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('cancel') || message.includes('abort')) {
        return { ok: false, method: 'cancelled' };
      }
      // Fall through to clipboard.
    }
  }

  // 3. Clipboard fallback
  if (typeof navigator !== 'undefined' && navigator.clipboard && input.url) {
    try {
      await navigator.clipboard.writeText(input.url);
      return { ok: true, method: 'clipboard' };
    } catch (error) {
      return { ok: false, method: 'error', error };
    }
  }

  return { ok: false, method: 'unsupported' };
}
