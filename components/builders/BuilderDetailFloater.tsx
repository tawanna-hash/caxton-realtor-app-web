'use client';

// components/builders/BuilderDetailFloater.tsx
//
// Floater pill for the /builders/[slug] detail page. Uses the shared
// <FloaterPill> so size + look stay consistent with the inventory and
// events floaters.
//
// Actions, left to right:
//   1. Back      — router.back() with /builders fallback
//   2. Download  — opens /api/builders/[slug]/pdf in the in-app browser
//   3. Share     — native share sheet with the canonical detail URL
//
// Analytics: fires the canonical admin-metrics event names
// (builder_back_pill_clicked, builder_download_pill_clicked,
// builder_shared) that the /admin/metrics surface × action pivot expects.

import { useRouter } from 'next/navigation';
import { trackEvent } from '@/app/posthog-provider';
import FloaterPill, { type FloaterAction } from '@/components/ui/FloaterPill';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';

type Props = {
  builderName: string;
  slug: string;
};

export default function BuilderDetailFloater({ builderName, slug }: Props) {
  const router = useRouter();

  const handleBack = () => {
    trackEvent('builder_back_pill_clicked', { builder_name: builderName, slug });
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/builders');
    }
  };

  const handleDownload = () => {
    trackEvent('builder_download_pill_clicked', {
      builder_name: builderName,
      slug,
    });
    // In-app browser (SFSafariViewController on iOS) keeps users inside
    // Realty News Now while the PDF renders.
    void openExternal(`https://realtynewsnow.app/api/builders/${slug}/pdf`);
  };

  const handleShare = async () => {
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://realtynewsnow.app/builders/${slug}`;
    const title = `${builderName} — Realty News Now`;
    const res = await nativeShare({
      title,
      text: title,
      url,
      dialogTitle: 'Share builder',
    });
    if (res.ok) {
      trackEvent('builder_shared', {
        builder_name: builderName,
        slug,
        channel: res.method,
      });
    }
  };

  const actions: FloaterAction[] = [
    {
      key: 'back',
      label: 'Back',
      ariaLabel: 'Back',
      onClick: handleBack,
      icon: <path d="m15 18-6-6 6-6" />,
    },
    {
      key: 'download',
      label: 'Listings',
      ariaLabel: 'Download listings PDF',
      onClick: handleDownload,
      icon: (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </>
      ),
    },
    {
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
    },
  ];

  return <FloaterPill actions={actions} bottomOffsetClass="bottom-[80px]" />;
}
