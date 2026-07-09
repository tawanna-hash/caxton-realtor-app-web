'use client';

// components/inventory/InventoryDetailFloater.tsx
//
// Inventory detail page floater. Uses the shared <FloaterPill> so size + look
// stay consistent with the events floater and any future floaters.
//
// Actions, left to right:
//   1. Back        — router.back() with /inventory fallback
//   2. Builder Site— opens externalUrl in a new tab (omitted when null)
//   3. Download    — opens flyerPdfUrl in the in-app browser (omitted when null)
//   4. Share       — native share sheet with the canonical detail URL
//   5. Promos      — /inventory?kind=promotion
//
// Analytics: every action dual-fires the canonical admin-metrics event
// name (inventory_back_pill_clicked, inventory_download_pill_clicked,
// inventory_shared) alongside the generic inventory_floater_clicked so
// existing dashboards keep working AND the surface × action pivot in
// /admin/metrics starts populating.

import { useRouter } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';

type Props = {
  rowId: number;
  builderName: string;
  externalUrl: string | null;
  // NEW — added in commit 2 so the floater can host Download + Share.
  flyerPdfUrl?: string | null;
  shareUrl?: string;
  shareTitle?: string;
};

export default function InventoryDetailFloater({
  rowId,
  builderName,
  externalUrl,
  flyerPdfUrl = null,
  shareUrl,
  shareTitle,
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    trackEvent('inventory_floater_clicked', { row_id: rowId, action: 'back' });
    // Canonical admin-metrics event.
    trackEvent('inventory_back_pill_clicked', { row_id: rowId });
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

  const handleDownload = () => {
    if (!flyerPdfUrl) return;
    trackEvent('inventory_floater_clicked', {
      row_id: rowId,
      builder_name: builderName,
      action: 'download',
    });
    // Canonical admin-metrics event.
    trackEvent('inventory_download_pill_clicked', {
      row_id: rowId,
      builder_name: builderName,
    });
    // Use the in-app browser (SFSafariViewController on iOS) so users
    // stay inside Realty News Now while viewing the PDF.
    void openExternal(flyerPdfUrl);
  };

  const handleShare = async () => {
    const url =
      shareUrl ??
      (typeof window !== 'undefined' ? window.location.href : '');
    const title = shareTitle ?? 'Inventory listing';
    const res = await nativeShare({
      title,
      text: title,
      url,
      dialogTitle: 'Share listing',
    });
    if (res.ok) {
      trackEvent('inventory_floater_clicked', {
        row_id: rowId,
        builder_name: builderName,
        action: 'share',
        channel: res.method,
      });
      // Canonical admin-metrics event — matches communities_shared /
      // builder_shared naming so the surface × channel pivot picks it up.
      trackEvent('inventory_shared', {
        row_id: rowId,
        builder_name: builderName,
        channel: res.method,
      });
    }
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

  if (flyerPdfUrl && flyerPdfUrl.toLowerCase().endsWith('.pdf')) {
    actions.push({
      key: 'download',
      label: 'Flyer',
      ariaLabel: 'Download flyer',
      onClick: handleDownload,
      icon: (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </>
      ),
    });
  }

  actions.push({
    key: 'share',
    label: 'Share',
    ariaLabel: 'Share',
    onClick: handleShare,
    icon: (
      <>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </>
    ),
  });

  actions.push({
    key: 'promos',
    label: 'Promos',
    ariaLabel: 'Promotions',
    href: '/inventory?kind=promotion',
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
