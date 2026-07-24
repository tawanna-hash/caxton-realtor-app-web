'use client';

// components/builders/BuilderDeveloperFloater.tsx
//
// Floating pill for the builder/developer LIST pages (/builders, /communities,
// /inventory). Thin call site over the shared useDetailFloaterActions factory
// — see components/ui/floater/.
//
// Primary: Back · Share · Inventory.
// Overflow (More): Inventory Download.
//
// No Save/Contact/Directions here — a list page has no single entity to save
// or route to. Analytics: fires the generic builders_floater_clicked (with
// action) on every action, matching the prior behaviour.

import FloaterPill from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';

type Props = {
  /** Path of the PDF this list page downloads, e.g. '/api/inventory/pdf'. */
  downloadHref: string;
  /** Fallback destination for Back when there's no history. */
  backHref?: string;
  /** Label surfaced in analytics for which list page rendered the floater. */
  page: 'builders' | 'communities' | 'inventory';
  shareTitle?: string;
};

function originForLink(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://realtynewsnow.app';
}

export default function BuilderDeveloperFloater({
  downloadHref,
  backHref = '/builders',
  page,
  shareTitle = 'Realty News Now',
}: Props) {
  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'builderList',
      events: { floater: 'builders_floater_clicked' },
      base: { page },
      backRoute: backHref,
      share: { title: shareTitle },
      flyerPdfUrl: `${originForLink()}${downloadHref}`,
      downloadLabel: 'Download',
      inventoryRoute: '/inventory',
    });

  return (
    <>
      <FloaterPill actions={pillActions} />
      <FloaterOverflowSheet
        open={overflowOpen}
        actions={overflow}
        onClose={closeOverflow}
      />
    </>
  );
}
