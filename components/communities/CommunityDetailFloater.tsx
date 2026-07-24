'use client';

// components/communities/CommunityDetailFloater.tsx
//
// Floating pill for /communities/[id]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Primary: Back · Share · Inventory.
// Overflow (More): Website · Flyer · Save · Contact · Directions.
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
  phone?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export default function CommunityDetailFloater({
  rowId,
  builderName,
  communityName,
  websiteUrl,
  flyerPdfUrl,
  shareTitle,
  phone,
  latitude,
  longitude,
}: Props) {
  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://realtynewsnow.app/communities/${rowId}`;

  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'community',
      events: {
        floater: 'communities_floater_clicked',
        back: 'communities_back_pill_clicked',
        shared: 'communities_shared',
        download: 'communities_download_pill_clicked',
        saved: 'communities_saved',
        contact: 'communities_contact_clicked',
        directions: 'communities_directions_clicked',
      },
      base: {
        row_id: rowId,
        builder_name: builderName,
        community_name: communityName,
      },
      backRoute: '/communities',
      share: { title: shareTitle },
      save: { id: `community:${rowId}`, title: shareTitle, url: shareUrl },
      external: websiteUrl
        ? { url: websiteUrl, label: 'Website', ariaLabel: 'Visit website' }
        : null,
      flyerPdfUrl,
      downloadLabel: 'Flyer',
      inventoryRoute: `/inventory?builder=${encodeURIComponent(builderName)}`,
      phone,
      latitude,
      longitude,
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
