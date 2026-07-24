'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Floating pill for /inventory/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Primary: Back · Share · Builder Site (when a site URL exists).
// Overflow (More): Flyer · Promos · Inventory.
//
// "Request more information" lives as an inline box on the page itself
// (components/inventory/RequestInfoBox), not in the floater.
//
// Analytics: preserves the canonical events the /admin/metrics dashboard reads
// (inventory_back_pill_clicked, inventory_shared, inventory_download_pill_clicked)
// plus the generic inventory_floater_clicked (with action) for every pill.

import FloaterPill from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';

type Props = {
  rowId: number;
  builderName: string;
  externalUrl: string | null;
  flyerPdfUrl: string | null;
  shareTitle: string;
};

export default function InventoryDetailFloater({
  rowId,
  builderName,
  externalUrl,
  flyerPdfUrl,
  shareTitle,
}: Props) {
  const isPdf = !!flyerPdfUrl && flyerPdfUrl.toLowerCase().endsWith('.pdf');
  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'inventory',
      events: {
        floater: 'inventory_floater_clicked',
        back: 'inventory_back_pill_clicked',
        shared: 'inventory_shared',
        download: 'inventory_download_pill_clicked',
      },
      base: { row_id: rowId, builder_name: builderName },
      backRoute: '/inventory',
      share: { title: shareTitle, text: shareTitle },
      external: externalUrl
        ? {
            url: externalUrl,
            label: 'Builder Site',
            ariaLabel: 'Visit builder site',
          }
        : null,
      flyerPdfUrl: isPdf ? flyerPdfUrl : null,
      promosRoute: '/inventory?kind=promotion',
    });

  return (
    <>
      <FloaterPill actions={pillActions} bottomOffsetClass="bottom-[80px]" />
      <FloaterOverflowSheet
        open={overflowOpen}
        actions={overflow}
        onClose={closeOverflow}
      />
    </>
  );
}
