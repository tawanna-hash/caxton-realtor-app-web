'use client';

// components/builders/BuilderDeveloperFloater.tsx
//
// Floating pill for the builder/developer LIST pages (/builders, /communities,
// /inventory). Thin call site over the shared useDetailFloaterActions factory
// — see components/ui/floater/.
//
// Primary: Back · Inventory · Promos.
// Overflow (More): Download Search Results · Share Search Results.
//
// "Results" actions reflect the InventoryBrowser's current filters: the
// browser syncs filter state to the URL (replaceState), so Download results
// appends window.location.search to the PDF endpoint (the PDF route parses
// the same params) and Share results shares the current (filtered) URL.
//
// No Save/Contact/Directions here — a list page has no single entity to save
// or route to. Analytics: fires the generic builders_floater_clicked (with
// action) on every action, matching the prior behaviour.

import { useCallback } from 'react';
import FloaterPill from '@/components/ui/FloaterPill';
import type { FloaterAction } from '@/components/ui/FloaterPill';
import FloaterOverflowSheet from '@/components/ui/floater/FloaterOverflowSheet';
import { useDetailFloaterActions } from '@/components/ui/floater/useDetailFloaterActions';
import { IconDownload, IconShare } from '@/components/ui/floater/icons';
import { trackEvent } from '@/app/posthog-provider';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';
import { haptics } from '@/lib/native/haptics';

type Props = {
  /** Path of the PDF this list page downloads, e.g. '/api/inventory/pdf'. */
  downloadHref: string;
  /** Fallback destination for Back when there's no history. */
  backHref?: string;
  /** Label surfaced in analytics for which list page rendered the floater. */
  page: 'builders' | 'communities' | 'inventory';
  shareTitle?: string;
};

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
  const fire = useCallback(
    (action: string, extra: Record<string, unknown> = {}) =>
      trackEvent('builders_floater_clicked', { page, action, ...extra }),
    [page],
  );

  // Download the PDF for the currently-filtered results. The browser keeps
  // the filter params in window.location.search; the PDF route parses the
  // same params, so this exports exactly what's on screen.
  const onDownloadResults = useCallback(() => {
    fire('download_results');
    const search = typeof window !== 'undefined' ? window.location.search : '';
    void openExternal(`${originForLink()}${downloadHref}${search}`);
  }, [fire, downloadHref]);

  // Share the current (filtered) URL. Same payload the primary Share pill
  // uses, surfaced explicitly in the More sheet as "Share results".
  const onShareResults = useCallback(async () => {
    void haptics.light();
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const res = await nativeShare({ title: shareTitle, url, dialogTitle: shareTitle });
    fire('share_results', { channel: res.ok ? res.method : 'cancelled' });
  }, [fire, shareTitle]);

  const resultsActions: FloaterAction[] = [
    {
      key: 'download-results',
      label: 'Download Search Results',
      ariaLabel: 'Download filtered results as PDF',
      onClick: onDownloadResults,
      icon: IconDownload,
    },
    {
      key: 'share-results',
      label: 'Share Search Results',
      ariaLabel: 'Share filtered results',
      onClick: onShareResults,
      icon: IconShare,
    },
  ];

  const { pillActions, overflow, overflowOpen, closeOverflow } =
    useDetailFloaterActions({
      surface: 'builderList',
      events: { floater: 'builders_floater_clicked' },
      base: { page },
      backRoute: backHref,
      share: { title: shareTitle },
      primary: ['back', 'inventory'],
      inventoryRoute: '/inventory',
      extraOverflow: resultsActions,
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
