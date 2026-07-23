'use client';

// components/builders/BuilderDeveloperFloater.tsx
//
// Shared floating action pill for the builder/developer LIST pages
// (/builders, /communities, /inventory). Mirrors the detail-page floaters
// (BuilderDetailFloater / CommunityDetailFloater) so every builder/developer
// page — list or detail — has the same Back / Download / Share / Inventory
// bar pinned to the bottom.
//
// Actions:
//   1. Back      — router.back() with a list-page fallback
//   2. Download  — opens the page's inventory/communities PDF (attachment)
//   3. Share     — native share sheet with the current URL
//   4. Inventory — jumps to /inventory

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { trackEvent } from '@/app/posthog-provider';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';

type Props = {
  /** Path of the PDF this list page downloads, e.g. '/api/inventory/pdf'. */
  downloadHref: string;
  /** Fallback destination for Back when there's no history. */
  backHref?: string;
  /** Label surfaced in analytics for which list page rendered the floater. */
  page: 'builders' | 'communities' | 'inventory';
  shareTitle?: string;
};

const IconBack = (
  <>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
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

function originForLink(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://realtynewsnow.app';
}

export default function BuilderDeveloperFloater({
  downloadHref,
  backHref = '/builders',
  page,
  shareTitle = 'Realty News Now',
}: Props) {
  const router = useRouter();
  const base = useMemo(() => ({ page }), [page]);

  const onBack = useCallback(() => {
    trackEvent('builders_floater_clicked', { ...base, action: 'back' });
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(backHref);
    }
  }, [router, backHref, base]);

  const onDownload = useCallback(() => {
    trackEvent('builders_floater_clicked', { ...base, action: 'download' });
    void openExternal(`${originForLink()}${downloadHref}`);
  }, [downloadHref, base]);

  const onShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const res = await nativeShare({ title: shareTitle, url });
    trackEvent('builders_floater_clicked', {
      ...base,
      action: 'share',
      channel: res.ok ? res.method : 'cancelled',
    });
  }, [shareTitle, base]);

  const onInventory = useCallback(() => {
    trackEvent('builders_floater_clicked', { ...base, action: 'inventory' });
    router.push('/inventory');
  }, [router, base]);

  const actions: FloaterAction[] = [
    { key: 'back', label: 'Back', icon: IconBack, onClick: onBack },
    { key: 'download', label: 'Download', icon: IconDownload, onClick: onDownload },
    { key: 'share', label: 'Share', icon: IconShare, onClick: onShare },
    { key: 'inventory', label: 'Inventory', icon: IconHome, onClick: onInventory },
  ];

  return <FloaterPill actions={actions} />;
}
