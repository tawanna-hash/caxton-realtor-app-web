'use client';

// components/communities/CommunityDetailFloater.tsx
//
// iOS-parity floating pill for /communities/[id]. Mirrors
// InventoryDetailFloater + BuilderDetailFloater. Emits generic
// communities_floater_clicked (with action) plus canonical events
// admin/metrics expects: communities_back_pill_clicked,
// communities_download_pill_clicked, communities_shared.

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { trackEvent } from '@/app/posthog-provider';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';

type Props = {
  rowId: number;
  builderName: string;
  communityName: string | null;
  websiteUrl: string | null;
  flyerPdfUrl: string | null;
  shareTitle: string;
};

// Inline 16x16 SVG children — FloaterPill wraps in <svg viewBox="0 0 24 24">.
const IconBack = (
  <>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </>
);
const IconExternal = (
  <>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </>
);
const IconDownload = (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>
);
const IconShare = (
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </>
);
const IconHome = (
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-6H10v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" />
  </>
);

export default function CommunityDetailFloater({
  rowId,
  builderName,
  communityName,
  websiteUrl,
  flyerPdfUrl,
  shareTitle,
}: Props) {
  const router = useRouter();

  const baseProps = useMemo(
    () => ({
      row_id: rowId,
      builder_name: builderName,
      community_name: communityName,
    }),
    [rowId, builderName, communityName],
  );

  const onBack = useCallback(() => {
    trackEvent('communities_floater_clicked', { ...baseProps, action: 'back' });
    trackEvent('communities_back_pill_clicked', baseProps);
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/communities');
    }
  }, [router, baseProps]);

  const onWebsite = useCallback(() => {
    if (!websiteUrl) return;
    trackEvent('communities_floater_clicked', {
      ...baseProps,
      action: 'website',
    });
    openExternal(websiteUrl);
  }, [websiteUrl, baseProps]);

  const onDownload = useCallback(() => {
    if (!flyerPdfUrl) return;
    trackEvent('communities_floater_clicked', {
      ...baseProps,
      action: 'download',
    });
    trackEvent('communities_download_pill_clicked', baseProps);
    openExternal(flyerPdfUrl);
  }, [flyerPdfUrl, baseProps]);

  const onShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const result = await nativeShare({
      title: shareTitle,
      url,
    });
    const channel = result.ok ? result.method : 'cancelled';
    trackEvent('communities_floater_clicked', {
      ...baseProps,
      action: 'share',
      channel,
    });
    trackEvent('communities_shared', {
      ...baseProps,
      channel,
    });
  }, [shareTitle, baseProps]);

  const onInventory = useCallback(() => {
    trackEvent('communities_floater_clicked', {
      ...baseProps,
      action: 'inventory',
    });
    router.push(
      `/inventory?builder=${encodeURIComponent(builderName)}`,
    );
  }, [router, builderName, baseProps]);

  const actions: FloaterAction[] = [
    { key: 'back', label: 'Back', icon: IconBack, onClick: onBack },
    ...(websiteUrl
      ? [{ key: 'website', label: 'Website', icon: IconExternal, onClick: onWebsite }]
      : []),
    ...(flyerPdfUrl
      ? [{ key: 'download', label: 'Download', icon: IconDownload, onClick: onDownload }]
      : []),
    { key: 'share', label: 'Share', icon: IconShare, onClick: onShare },
    { key: 'inventory', label: 'Inventory', icon: IconHome, onClick: onInventory },
  ];

  return <FloaterPill actions={actions} />;
}
