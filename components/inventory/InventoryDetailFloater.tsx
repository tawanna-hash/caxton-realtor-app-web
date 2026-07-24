'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Floating pill for /inventory/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Pill (no More menu): Back · Builder Site · Download · Share.
//
// Download (the listing's flyer PDF, when one exists) and Share live in the
// pill directly — flattened out of the former More overflow sheet. The More
// menu and its other contents (Promos) were removed per the list-page floater
// treatment.
//
// "Request more information" lives as an inline box on the page itself
// (components/inventory/RequestInfoBox), not in the floater.
//
// Analytics: preserves the canonical events the /admin/metrics dashboard reads
// (inventory_back_pill_clicked, inventory_shared, inventory_download_pill_clicked)
// plus the generic inventory_floater_clicked (with action) for every pill.

import FloaterPill from '@/components/ui/FloaterPill';
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
  const { pillActions } = useDetailFloaterActions({
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
    downloadLabel: 'Download',
    // Flatten Download + Share into the pill; no More overflow. Promos/Inventory
    // nav intentionally omitted so the overflow set is empty (no More button).
    primary: ['back', 'external', 'download', 'share'],
  });

  return <FloaterPill actions={pillActions} bottomOffsetClass="bottom-[80px]" />;
}
