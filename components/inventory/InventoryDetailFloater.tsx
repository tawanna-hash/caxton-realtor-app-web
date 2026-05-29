'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Inventory detail page floater. Uses the shared <FloaterPill> so size + look
// stay consistent with the events floater and any future floaters.
//
// Actions, left to right:
//   1. Back        — router.back() with /inventory fallback
//   2. Builder Site— opens externalUrl in a new tab (omitted when null)
//   3. Promos      — /builder-promotions

import { useRouter } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';

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

  const actions: FloaterAction[] = [
    {
      key: 'back',
      label: 'Back',
      ariaLabel: 'Back',
      onClick: handleBack,
      icon: <path d="m15 18-6-6 6-6" />,
    },
  ];

  if (externalUrl) {
    actions.push({
      key: 'builder',
      label: 'Builder Site',
      ariaLabel: 'Visit builder site',
      href: externalUrl,
      onClick: handleBuilder,
      icon: (
        <>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </>
      ),
    });
  }

  actions.push({
    key: 'promos',
    label: 'Promos',
    ariaLabel: 'Promotions',
    href: '/builder-promotions',
    onClick: handlePromotions,
    icon: (
      <>
        <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </>
    ),
  });

  return <FloaterPill actions={actions} bottomOffsetClass="bottom-[80px]" />;
}
