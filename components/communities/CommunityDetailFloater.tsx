'use client';

// components/communities/CommunityDetailFloater.tsx
//
// Floating pill for /communities/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Primary: Back · Share · Inventory.
// Overflow (More): Website · Flyer · Promos.
//
// Analytics: preserves communities_back_pill_clicked, communities_shared,
// communities_download_pill_clicked plus the generic
// communities_floater_clicked (with action).

import FloaterPill from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';

type Props = {
  rowId: number;
  builderName: string;
  communityName: string | null;
  websiteUrl: string | null;
  flyerPdfUrl: string | null;
  shareTitle: string;
};

export default function CommunityDetailFloater({
  rowId,
  builderName,
  communityName,
  websiteUrl,
  flyerPdfUrl,
  shareTitle,
}: Props) {
  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'community',
      events: {
        floater: 'communities_floater_clicked',
        back: 'communities_back_pill_clicked',
        shared: 'communities_shared',
        download: 'communities_download_pill_clicked',
      },
      base: {
        row_id: rowId,
        builder_name: builderName,
        community_name: communityName,
      },
      backRoute: '/communities',
      share: { title: shareTitle },
      external: websiteUrl
        ? { url: websiteUrl, label: 'Website', ariaLabel: 'Visit website' }
        : null,
      flyerPdfUrl,
      downloadLabel: 'Flyer',
      inventoryRoute: `/inventory?builder=${encodeURIComponent(builderName)}`,
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
