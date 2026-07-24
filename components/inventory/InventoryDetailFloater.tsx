'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Floating pill for /inventory/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Primary: Back · Share · Builder Site (when a site URL exists).
// Overflow (More): Flyer · Promos · Save · Contact · Directions (when geo).
//
// Contact routes to the RNN office line (lib/contacts) — listings carry no
// per-home sales phone. Swap CONTACT_TEL or wire a per-listing phone if one
// becomes available.
//
// Analytics: preserves the canonical events the /admin/metrics dashboard reads
// (inventory_back_pill_clicked, inventory_shared, inventory_download_pill_clicked)
// plus the generic inventory_floater_clicked (with action) for every pill.

import FloaterPill from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';
import { CONTACT_TEL } from '@/lib/contacts';

type Props = {
  rowId: number;
  builderName: string;
  externalUrl: string | null;
  flyerPdfUrl: string | null;
  shareTitle: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export default function InventoryDetailFloater({
  rowId,
  builderName,
  externalUrl,
  flyerPdfUrl,
  shareTitle,
  latitude,
  longitude,
}: Props) {
  const isPdf = !!flyerPdfUrl && flyerPdfUrl.toLowerCase().endsWith('.pdf');
  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://realtynewsnow.app/inventory/${rowId}`;

  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'inventory',
      events: {
        floater: 'inventory_floater_clicked',
        back: 'inventory_back_pill_clicked',
        shared: 'inventory_shared',
        download: 'inventory_download_pill_clicked',
        saved: 'inventory_saved',
        contact: 'inventory_contact_clicked',
        directions: 'inventory_directions_clicked',
      },
      base: { row_id: rowId, builder_name: builderName },
      backRoute: '/inventory',
      share: { title: shareTitle, text: shareTitle },
      save: { id: `inventory:${rowId}`, title: shareTitle, url: shareUrl },
      external: externalUrl
        ? {
            url: externalUrl,
            label: 'Builder Site',
            ariaLabel: 'Visit builder site',
          }
        : null,
      flyerPdfUrl: isPdf ? flyerPdfUrl : null,
      promosRoute: '/inventory?kind=promotion',
      phone: CONTACT_TEL,
      latitude,
      longitude,
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
