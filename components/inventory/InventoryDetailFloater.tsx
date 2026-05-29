'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Fixed floater pill rendered on the inventory detail page.
// Three actions, left to right:
//   1. Back        — browser back (router.back), with a graceful fallback to
//                    /inventory when there's no history (e.g. opened in a
//                    new tab from a shared link).
//   2. Visit site  — opens row.flyerPdfUrl or row.sourceUrl in a new tab.
//                    Hidden when neither is present.
//   3. Promotions  — navigates to /builder-promotions.
//
// Pinned to the bottom-center of the viewport, hovering above the
// site's bottom nav (which is ~64px tall + safe-area inset).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';

type Props = {
  rowId: number;
  builderName: string;
  externalUrl: string | null;
};

export default function InventoryDetailFloater({
  rowId,
  builderName,
  externalUrl,
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    trackEvent('inventory_floater_clicked', { row_id: rowId, action: 'back' });
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/inventory');
    }
  };

  const handleBuilder = () => {
    trackEvent('inventory_floater_clicked', {
      row_id: rowId,
      builder_name: builderName,
      action: 'visit_builder',
    });
  };

  const handlePromotions = () => {
    trackEvent('inventory_floater_clicked', { row_id: rowId, action: 'promotions' });
  };

  return (
    // Bottom-center; pb-safe-area + clears the app's ~64px bottom nav.
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
    >
      <div className="flex items-center gap-1 bg-gray-900/95 backdrop-blur-sm text-white rounded-full shadow-xl border border-white/10 px-1.5 py-1.5">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </button>

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBuilder}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            <span>Visit builder site</span>
          </a>
        )}

        <Link
          href="/builder-promotions"
          onClick={handlePromotions}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
          </svg>
          <span>Promotions</span>
        </Link>
      </div>
    </div>
  );
}
