// components/MagazineGA.tsx
//
// Injects the GA4 gtag.js loader keyed to a publication-specific
// Measurement ID. Renders nothing when the publication has no ID
// configured in /admin/magazines/settings.
//
// Also exports a tiny `trackMagazinePageFlip` helper for the reader to
// call when a user flips to a new page. The helper is a no-op when
// gtag isn't on the page (e.g. ad-blocked browsers, or when no ID is
// configured).

'use client';

import Script from 'next/script';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export interface MagazineGAProps {
  /** GA4 Measurement ID like 'G-XXXXXXXXXX'. When null/empty, renders nothing. */
  measurementId: string | null | undefined;
  /** Optional debug flag — passes `debug_mode: true` so events show up in GA DebugView. */
  debug?: boolean;
}

export function MagazineGA({ measurementId, debug = false }: MagazineGAProps) {
  if (!measurementId) return null;
  // Two scripts: the loader (strategy=afterInteractive so it doesn't
  // block first paint) and a small inline init that configures the
  // property. Next.js's <Script> handles deduping across page navs.
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}'${debug ? ", { debug_mode: true }" : ''});
        `}
      </Script>
    </>
  );
}

/**
 * Fire a custom GA4 event when the reader advances to a new magazine
 * page. Safe to call from any client component — it's a no-op when
 * gtag isn't loaded (e.g. no Measurement ID configured, or ad blocker).
 */
export function trackMagazinePageFlip(args: {
  magazineId: number;
  pageNumber: number;
  publication?: string | null;
}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }
  window.gtag('event', 'magazine_page_flip', {
    magazine_id: args.magazineId,
    page_number: args.pageNumber,
    publication: args.publication ?? undefined,
  });
}
