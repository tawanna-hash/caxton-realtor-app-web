'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Floating pill for /inventory/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Pill (no Back, no More menu): Share · Builder Site · Inventory · Promos · Print.
//
// Per the re-spec: Back and the More overflow sheet (+ its Flyer/Promos
// contents) were removed; Inventory + Promos nav and a Print action were
// added. Print fires window.print() on the current listing page.
//
// "Request more information" lives as an inline box on the page itself
// (components/inventory/RequestInfoBox), not in the floater.
//
// Analytics: preserves the canonical events the /admin/metrics dashboard reads
// (inventory_shared) plus the generic inventory_floater_clicked (with action)
// for every pill.

import { useCallback, useEffect } from 'react';
import FloaterPill from '@/components/ui/FloaterPill';
import type { FloaterAction } from '@/components/ui/FloaterPill';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';
import { IconPrint } from '@/components/ui/floater/icons';
import { trackEvent } from '@/app/posthog-provider';
import { haptics } from '@/lib/native/haptics';
import { printCurrentPage, maybeAutoPrint } from '@/lib/native/print';

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
  shareTitle,
}: Props) {
  const { pillActions } = useDetailFloaterActions({
    surface: 'inventory',
    events: {
      floater: 'inventory_floater_clicked',
      shared: 'inventory_shared',
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
    // No flyer/download action — it was part of the removed More contents.
    // Inventory + Promos nav live in the pill directly (no More overflow).
    inventoryRoute: '/inventory',
    promosRoute: '/promotions',
    primary: ['share', 'external', 'inventory', 'promos'],
  });

  const onPrint = useCallback(() => {
    void haptics.light();
    trackEvent('inventory_floater_clicked', {
      row_id: rowId,
      builder_name: builderName,
      action: 'print',
    });
    void printCurrentPage();
  }, [rowId, builderName]);

  const printAction: FloaterAction = {
    key: 'print',
    label: 'Print',
    ariaLabel: 'Print this listing',
    onClick: onPrint,
    icon: IconPrint,
  };

  const actions = [...pillActions, printAction];

  // Auto-print when opened in system browser via ?print=1 (native app
  // opens this URL in Safari, which triggers the print dialog).
  useEffect(() => {
    maybeAutoPrint();
  }, []);

  return <FloaterPill actions={actions} bottomOffsetClass="bottom-[80px]" />;
}
