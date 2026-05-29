'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Fixed floater pill rendered on the inventory detail page. Matches the
// existing event-detail floater aesthetic (components/events/EventDetail.tsx):
//   - bg-black/85 + backdrop-blur, rounded-md (not a full pill)
//   - Each action is a stacked icon + uppercase label, ~60px min-width
//   - Pinned bottom-center, above the BottomNav
//
// Actions, left to right:
//   1. Back        — router.back() with a fallback to /inventory when
//                    there is no history (shared/direct links).
//   2. Builder     — opens the builder's site (sourceUrl or flyerPdfUrl)
//                    in a new tab. Hidden when neither is present.
//   3. Promotions  — navigates to /builder-promotions.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';

type Props = {
  rowId: number;
  builderName: string;
  externalUrl: string | null;
};

const BTN_CLS =
  'flex flex-col items-center justify-center min-w-[60px] px-2 py-1.5 rounded-md ' +
  'transition-colors text-white/85 hover:text-white active:bg-white/10 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

const LABEL_CLS = 'text-[10px] uppercase tracking-wider mt-0.5 font-medium';

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
    // bottom: ~80px above the viewport edge clears the app's BottomNav
    // (~64px) and respects the iOS safe area. pointer-events-none on the
    // wrapper so dead space around the pill doesn't block underlying clicks.
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
    >
      <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-2 py-1.5 shadow-lg">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className={BTN_CLS}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className={LABEL_CLS}>Back</span>
        </button>

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBuilder}
            aria-label="Visit builder site"
            className={BTN_CLS}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span className={LABEL_CLS}>Builder</span>
          </a>
        )}

        <Link
          href="/builder-promotions"
          onClick={handlePromotions}
          aria-label="Promotions"
          className={BTN_CLS}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <span className={LABEL_CLS}>Promotions</span>
        </Link>
      </div>
    </div>
  );
}
