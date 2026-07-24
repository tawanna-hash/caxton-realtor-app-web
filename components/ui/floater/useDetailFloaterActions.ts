'use client';

// components/ui/floater/useDetailFloaterActions.ts
//
// Factory hook that turns a small per-surface config into the action set for
// <FloaterPill> + its overflow sheet. This replaces four near-duplicate
// components (InventoryDetailFloater, CommunityDetailFloater,
// BuilderDetailFloater, BuilderDeveloperFloater) — each only differed in
// event names, a link or two, and which entity fields it had. All of that is
// now config.
//
// Layout: a small set of PRIMARY pills is always visible (Back, Share, and
// the surface's main CTA); everything else (Flyer, Website, Promos,
// Inventory) goes into an overflow sheet opened by a trailing "More" pill.
// Actions whose data is missing are simply omitted.
//
// Analytics: preserves the canonical event names the /admin/metrics dashboard
// reads via SQL (e.g. inventory_back_pill_clicked, communities_shared,
// builder_download_pill_clicked). `events.floater`, when set, is the generic
// per-action event (inventory_floater_clicked / communities_floater_clicked /
// builders_floater_clicked) fired with { action } on every action — matching
// the prior per-surface behaviour exactly.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FloaterAction } from '@/components/ui/FloaterPill';
import { trackEvent } from '@/app/posthog-provider';
import { share as nativeShare } from '@/lib/native/share';
import { openExternal } from '@/lib/native/external-link';
import { haptics } from '@/lib/native/haptics';
import {
  IconBack,
  IconDownload,
  IconExternal,
  IconHome,
  IconMore,
  IconPromo,
  IconShare,
} from './icons';

export type FloaterSurface = 'inventory' | 'community' | 'builder' | 'builderList';

export type FloaterEvents = {
  /** Generic event fired (with { action }) on every action. Optional. */
  floater?: string;
  back?: string;
  shared?: string;
  download?: string;
  website?: string;
  inventory?: string;
  promos?: string;
};

export type ActionKey =
  | 'back'
  | 'share'
  | 'external'
  | 'download'
  | 'inventory'
  | 'promos';

export type FloaterConfig = {
  surface: FloaterSurface;
  events: FloaterEvents;
  /** Base props merged into every analytics call (row_id, builder_name, ...). */
  base: Record<string, unknown>;
  backRoute: string;
  share: { title: string; text?: string };
  /** External site link (builder site / community website). */
  external?: { url: string; label: string; ariaLabel?: string } | null;
  /** PDF/openable URL for the Flyer/Download action. */
  flyerPdfUrl?: string | null;
  /** Label for the download action (default 'Flyer'). */
  downloadLabel?: string;
  /** Internal route for the Inventory action. */
  inventoryRoute?: string | null;
  /** Internal route for the Promos action. */
  promosRoute?: string | null;
  /** Override which actions are primary (the rest overflow). */
  primary?: ActionKey[];
};

const DEFAULT_PRIMARY: Record<FloaterSurface, ActionKey[]> = {
  inventory: ['back', 'share', 'external'],
  community: ['back', 'share', 'inventory'],
  builder: ['back', 'share', 'inventory'],
  builderList: ['back', 'share', 'inventory'],
};

// Order overflow rows appear in the sheet.
const OVERFLOW_ORDER: ActionKey[] = [
  'external',
  'download',
  'promos',
  'inventory',
];

function shareUrlFor(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}

export function useDetailFloaterActions(config: FloaterConfig) {
  const router = useRouter();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const fire = useCallback(
    (action: string, extra: Record<string, unknown> = {}) => {
      if (config.events.floater) {
        trackEvent(config.events.floater, { ...config.base, action, ...extra });
      }
    },
    [config.events.floater, config.base],
  );

  // ---- handlers (defined once, reused by every surface) ----

  const onBack = useCallback(() => {
    fire('back');
    if (config.events.back) trackEvent(config.events.back, config.base);
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(config.backRoute);
    }
  }, [fire, config.events.back, config.base, config.backRoute, router]);

  const onShare = useCallback(async () => {
    void haptics.light();
    const res = await nativeShare({
      title: config.share.title,
      text: config.share.text,
      url: shareUrlFor(),
      dialogTitle: config.share.title,
    });
    const channel = res.ok ? res.method : 'cancelled';
    fire('share', { channel });
    if (config.events.shared) {
      trackEvent(config.events.shared, { ...config.base, channel });
    }
  }, [fire, config.events.shared, config.base, config.share]);

  const onExternal = useCallback(() => {
    if (!config.external) return;
    fire(config.surface === 'inventory' ? 'visit_builder' : 'website');
    if (config.events.website) trackEvent(config.events.website, config.base);
    void openExternal(config.external.url);
  }, [fire, config.events.website, config.base, config.external, config.surface]);

  const onDownload = useCallback(() => {
    if (!config.flyerPdfUrl) return;
    fire('download');
    if (config.events.download) trackEvent(config.events.download, config.base);
    void openExternal(config.flyerPdfUrl);
  }, [fire, config.events.download, config.base, config.flyerPdfUrl]);

  const onInventory = useCallback(() => {
    fire('inventory');
    if (config.events.inventory) trackEvent(config.events.inventory, config.base);
    if (config.inventoryRoute) router.push(config.inventoryRoute);
  }, [fire, config.events.inventory, config.base, config.inventoryRoute, router]);

  const onPromos = useCallback(() => {
    fire('promotions');
    if (config.events.promos) trackEvent(config.events.promos, config.base);
  }, [fire, config.events.promos, config.base]);

  const openOverflow = useCallback(() => {
    void haptics.light();
    fire('more');
    setOverflowOpen(true);
  }, [fire]);
  const closeOverflow = useCallback(() => setOverflowOpen(false), []);

  // ---- resolve action objects ----

  const build = useCallback((): Partial<Record<ActionKey, FloaterAction>> => {
    const map: Partial<Record<ActionKey, FloaterAction>> = {};
    map.back = {
      key: 'back',
      label: 'Back',
      ariaLabel: 'Back',
      onClick: onBack,
      icon: IconBack,
    };
    map.share = {
      key: 'share',
      label: 'Share',
      ariaLabel: 'Share',
      onClick: onShare,
      icon: IconShare,
    };
    if (config.external) {
      map.external = {
        key: 'site',
        label: config.external.label,
        ariaLabel: config.external.ariaLabel ?? config.external.label,
        href: config.external.url,
        onClick: onExternal,
        icon: IconExternal,
      };
    }
    if (config.flyerPdfUrl) {
      map.download = {
        key: 'download',
        label: config.downloadLabel ?? 'Flyer',
        ariaLabel: 'Download flyer',
        onClick: onDownload,
        icon: IconDownload,
      };
    }
    if (config.inventoryRoute) {
      map.inventory = {
        key: 'inventory',
        label: 'Inventory',
        ariaLabel: 'View inventory',
        onClick: onInventory,
        icon: IconHome,
      };
    }
    if (config.promosRoute) {
      map.promos = {
        key: 'promos',
        label: 'Promos',
        ariaLabel: 'Promotions',
        href: config.promosRoute,
        onClick: onPromos,
        icon: IconPromo,
      };
    }
    return map;
  }, [
    config,
    onBack,
    onShare,
    onExternal,
    onDownload,
    onInventory,
    onPromos,
  ]);

  const all = useMemo(() => build(), [build]);

  const primaryKeys = config.primary ?? DEFAULT_PRIMARY[config.surface];
  const primary = primaryKeys
    .map((k) => all[k])
    .filter((a): a is FloaterAction => !!a);

  const overflow = OVERFLOW_ORDER.filter((k) => !primaryKeys.includes(k))
    .map((k) => all[k])
    .filter((a): a is FloaterAction => !!a);

  const pillActions: FloaterAction[] =
    overflow.length > 0
      ? [
          ...primary,
          {
            key: 'more',
            label: 'More',
            ariaLabel: 'More actions',
            onClick: openOverflow,
            icon: IconMore,
          },
        ]
      : primary;

  return {
    primary,
    overflow,
    pillActions,
    overflowOpen,
    openOverflow,
    closeOverflow,
  };
}
