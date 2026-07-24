'use client';

// components/builders/BuilderDetailFloater.tsx
//
// Floating pill for /builders/[slug]. Thin call site over the shared
// useDetailFloaterActions factory — see components/ui/floater/.
//
// Primary: Back · Share · Inventory.
// Overflow (More): Website · Download · Save.
//
// Analytics: the builder detail page fires canonical per-action events (no
// generic floater event) — builder_back_pill_clicked, builder_shared,
// builder_download_pill_clicked, builder_website_pill_clicked,
// builder_inventory_pill_clicked — preserved exactly here.

import FloaterPill from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';

type Props = {
  builderName: string;
  slug: string;
  // Builder's website URL (derived from the first non-PDF source_url across
  // their inventory rows). When present, a "Website" overflow row opens it.
  websiteUrl?: string | null;
};

export default function BuilderDetailFloater({
  builderName,
  slug,
  websiteUrl,
}: Props) {
  const shareTitle = `${builderName} — Realty News Now`;
  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://realtynewsnow.app/builders/${slug}`;

  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'builder',
      events: {
        back: 'builder_back_pill_clicked',
        shared: 'builder_shared',
        download: 'builder_download_pill_clicked',
        website: 'builder_website_pill_clicked',
        inventory: 'builder_inventory_pill_clicked',
        saved: 'builder_saved',
      },
      base: { builder_name: builderName, slug },
      backRoute: '/builders',
      share: { title: shareTitle, text: shareTitle },
      save: { id: `builder:${slug}`, title: shareTitle, url: shareUrl },
      external: websiteUrl
        ? {
            url: websiteUrl,
            label: 'Website',
            ariaLabel: 'Visit builder website',
          }
        : null,
      flyerPdfUrl: `https://realtynewsnow.app/api/builders/${slug}/pdf`,
      downloadLabel: 'Download',
      inventoryRoute: `/inventory?builder=${encodeURIComponent(builderName)}`,
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
