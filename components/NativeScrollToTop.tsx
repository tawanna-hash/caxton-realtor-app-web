'use client';

// components/NativeScrollToTop.tsx
//
// iOS expectation: tapping the status bar smoothly scrolls the nearest
// scroll view back to the top. WKWebView honors `scrollsToTop = YES` on
// its inner UIScrollView, which Capacitor sets by default for the WebView
// itself — so window-level scroll already works on iOS.
//
// What this component covers is the case where the page content lives in
// an inner scroll container (e.g. an admin page that uses
// `overflow: auto` inside a flex layout). In that scenario, iOS doesn't
// know which container to scroll, so we listen for a synthesized
// status-bar tap that we hook by detecting a tap in the top safe-area
// strip while the window scroll is at zero.
//
// This is intentionally lightweight: a single touchend listener on the
// document, gated by `isNative()`. No-op on web.

import { useEffect } from 'react';
import { isNative } from '@/lib/native/runtime';

const TOP_STRIP_PX = 48; // ~status bar height including notch buffer

export default function NativeScrollToTop() {
  useEffect(() => {
    if (!isNative()) return;
    if (typeof document === 'undefined') return;

    const handler = (ev: TouchEvent) => {
      const touch = ev.changedTouches[0];
      if (!touch) return;
      if (touch.clientY > TOP_STRIP_PX) return;
      // Window scroll already handles the native gesture; we only act on
      // inner scroll roots when the window is already at the top.
      if (window.scrollY > 4) return;

      const target = document.querySelector<HTMLElement>('[data-scroll-root="true"]');
      if (target && target.scrollHeight > target.clientHeight && target.scrollTop > 4) {
        target.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    document.addEventListener('touchend', handler, { passive: true });
    return () => {
      document.removeEventListener('touchend', handler);
    };
  }, []);

  return null;
}
