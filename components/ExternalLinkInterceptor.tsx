'use client';

// components/ExternalLinkInterceptor.tsx
//
// Single document-level click interceptor that catches every <a> tap and,
// when the link points to an external origin (or has target="_blank"),
// routes the navigation through `openExternal()` so iOS opens it inside an
// SFSafariViewController (brand purple toolbar) instead of kicking the user
// out to Safari and losing the app context.
//
// Rationale: the codebase has ~25 callsites scattered across admin/portal/
// public that use `<a target="_blank" href="…">`. Editing each one would
// produce a giant diff and miss future links. A single delegated listener
// at the document root covers all of them and is automatically applied to
// any new link added later.
//
// Behavior:
//   - Same-origin links (realtynewsnow.app, *.realtynewsnow.app,
//     myrealtyline.com, *.myrealtyline.com, or any path-relative href) are
//     left alone — Next.js / browser handle them.
//   - External http(s) links open via Capacitor Browser on iOS, window.open
//     on web (which falls back to opening in the same tab if the OS blocks
//     the popup — acceptable for web).
//   - tel:, mailto:, sms:, geo:, and other non-http(s) schemes are left to
//     iOS's default handler.
//   - Modifier keys (cmd/ctrl/shift/alt) and middle-click on web bypass
//     the interceptor so users can still open in new tabs.
//   - download attribute is left alone (don't hijack file downloads).
//
// Mounted once from app/layout.tsx alongside the other native bootstraps.

import { useEffect } from 'react';
import { openExternal } from '@/lib/native/external-link';

const SAME_ORIGIN_HOSTS = new Set<string>([
  'realtynewsnow.app',
  'www.realtynewsnow.app',
  'realtynewsnow.com',
  'www.realtynewsnow.com',
  'myrealtyline.com',
  'www.myrealtyline.com',
]);

function isSameOriginHost(host: string): boolean {
  const h = host.toLowerCase();
  if (SAME_ORIGIN_HOSTS.has(h)) return true;
  if (h.endsWith('.realtynewsnow.app')) return true;
  if (h.endsWith('.myrealtyline.com')) return true;
  return false;
}

export default function ExternalLinkInterceptor() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handler = (ev: MouseEvent) => {
      // Respect user's intent to open in a new tab/window on web.
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (ev.button !== 0) return; // left-click only

      // Walk up from the event target to find the nearest <a>.
      let node = ev.target as HTMLElement | null;
      let anchor: HTMLAnchorElement | null = null;
      while (node && node !== document.body) {
        if (node.tagName === 'A') {
          anchor = node as HTMLAnchorElement;
          break;
        }
        node = node.parentElement;
      }
      if (!anchor) return;

      // Don't hijack downloads or anchors with explicit data-internal opt-out.
      if (anchor.hasAttribute('download')) return;
      if (anchor.dataset.internal === 'true') return;
      if (anchor.dataset.externalIgnore === 'true') return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // In-page anchors and javascript: URLs — leave alone.
      if (href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;

      // Path-relative links are same-origin by definition.
      if (href.startsWith('/') && !href.startsWith('//')) return;

      // Parse against current location so relative URLs resolve correctly.
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      // tel:, mailto:, sms:, etc. — let the OS handle them.
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

      // Same-origin → let normal navigation happen.
      if (isSameOriginHost(url.hostname)) return;

      // External link — intercept and route through our native opener.
      ev.preventDefault();
      ev.stopPropagation();
      void openExternal(url.toString());
    };

    // Use capture phase so we beat any per-component handlers that might
    // call stopPropagation.
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
    };
  }, []);

  return null;
}
