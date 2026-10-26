'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

/**
 * Google tag (gtag.js) for our two public domains, each with its own GA4 property:
 *   realtynewsnow.app        -> Realty News Now    (NEXT_PUBLIC_RNN_GA_ID,          default G-3S5FD2JSCQ)
 * Renders nothing on any other host (localhost, previews, the native shell on another origin).
 *
 * Page views are sent here on every route change (GA4's history-based page views are turned off in
 * the stream settings), so the address we report is always cleaned first:
 *   - pages whose URL carries a private token (signing, client portal, booking, auth, admin,
 *     unsubscribe, testimonial and event-submission links) are reported as "/<first-segment>/redacted";
 *   - every other page keeps only campaign query parameters (utm_*, gclid, fbclid, ...).
 */

const SITES: Record<string, string | undefined> = {
  'realtynewsnow.app': process.env.NEXT_PUBLIC_RNN_GA_ID || 'G-3S5FD2JSCQ',
};

const PRIVATE_PREFIXES = [
  '/sign/', '/deal-portal/', '/book/', '/auth/', '/admin',
  '/unsubscribe/', '/testimonial/', '/submit-event/',
];

const KEEP_PARAM = /^(utm_[a-z_]+|gclid|gbraid|wbraid|fbclid|msclkid)$/i;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function measurementIdForHost(host: string): string | null {
  return SITES[host.toLowerCase().replace(/^www\./, '')] || null;
}

function cleanPage() {
  const { origin, pathname, search } = window.location;
  for (const prefix of PRIVATE_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const path = `/${pathname.split('/')[1]}/redacted`;
      return { page_location: origin + path, page_path: path, page_title: 'Private page' };
    }
  }
  const kept = new URLSearchParams();
  new URLSearchParams(search).forEach((v, k) => { if (KEEP_PARAM.test(k)) kept.append(k, v); });
  const qs = kept.toString();
  return { page_location: origin + pathname + (qs ? `?${qs}` : ''), page_path: pathname, page_title: document.title };
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // gtag.js expects the Arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  return window.gtag;
}

let configuredId: string | null = null;
const noopSubscribe = () => () => {};

export default function SiteGA() {
  const pathname = usePathname();
  // Host is read on the client only (null during server render), so no hydration mismatch.
  const id = useSyncExternalStore(noopSubscribe, () => measurementIdForHost(window.location.hostname), () => null);

  useEffect(() => {
    if (!id) return;
    const gtag = ensureGtag();
    // Let the new route set document.title before we read it.
    const t = window.setTimeout(() => {
      const page = cleanPage();
      if (configuredId !== id) {
        gtag('js', new Date());
        configuredId = id;
      }
      // Re-configuring with the cleaned address makes later events (scrolls, clicks) use it too.
      gtag('config', id, { ...page, send_page_view: false });
      gtag('event', 'page_view', { ...page, send_to: id });
    }, 0);
    return () => window.clearTimeout(t);
  }, [id, pathname]);

  // Page views queue in dataLayer, so gtag.js can wait: load it on the first interaction,
  // or after 6 seconds for visitors who only read.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!id || ready) return;
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    const go = () => { cleanup(); setReady(true); };
    const timer = window.setTimeout(go, 6000);
    const cleanup = () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, go));
    };
    events.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
    return cleanup;
  }, [id, ready]);

  if (!id || !ready) return null;
  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />;
}

/**
 * Send a GA4 event to whichever site property is on the page. `done` (optional) runs once the hit is
 * sent, or after 1.5s at most, so callers can safely navigate away afterwards.
 */
export function trackGA(event: string, params: Record<string, unknown> = {}, done?: () => void) {
  let called = false;
  const finish = () => { if (!called) { called = true; done?.(); } };
  const id = typeof window !== 'undefined' ? measurementIdForHost(window.location.hostname) : null;
  if (!id) { finish(); return; }
  ensureGtag()('event', event, { ...params, send_to: id, event_callback: finish, event_timeout: 1500 });
  if (done) window.setTimeout(finish, 1600);
}
