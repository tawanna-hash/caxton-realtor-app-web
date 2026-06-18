'use client';

// components/ads/AdSlot.tsx
//
// Shared component for rendering an active ad creative for a given ad_space slug.
//
// Usage:
//   <AdSlot slug="feed_sticky_bottom" />
//   <AdSlot slug="featured_builder_strip" className="my-6" />
//   <AdSlot slug="giveaway_prize_sponsor" fallback={null} />
//
// Behavior:
//   - Fetches /api/ads/active?slot=<slug>&pub=<realtyline|newsline> on mount
//   - Resolves publication from localStorage key `caxton_pub` (set by pub switcher)
//   - Renders nothing while loading. If no campaign, renders `fallback` (default: null).
//   - Fires `ad_impression` exactly once per slot when the creative renders.
//   - Fires `ad_click` on user click, then opens click_url in a new tab.
//
// Tracking properties (PostHog):
//   ad_space_slug, campaign_id, advertiser, publication

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { trackEvent } from '@/app/posthog-provider';
import { usePublication } from '@/lib/use-publication';

type ActiveAd = {
  id: string;
  slot: string;
  advertiser: string;
  image: string;
  width: number | null;
  height: number | null;
  href: string;
  alt: string;
};

type Props = {
  slug: string;
  className?: string;
  /** Rendered when no campaign is active for this slot. Defaults to null. */
  fallback?: React.ReactNode;
  /**
   * Override container styling. Default is a centered block with rounded-md
   * border. Pass `bare` to render only the creative without any wrapper.
   */
  variant?: 'default' | 'bare';
};

export function AdSlot({ slug, className = '', fallback = null, variant = 'default' }: Props) {
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const impressionFired = useRef(false);
  const { pub } = usePublication();

  useEffect(() => {
    let cancelled = false;
    // Reset impression latch so a fresh creative for the new pub fires its
    // own impression. Ref mutation is fine here (not state).
    impressionFired.current = false;

    (async () => {
      // Defer the loading-state flip so we don't trigger a synchronous
      // cascading render inside this effect (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      setLoaded(false);
      try {
        const res = await fetch(`/api/ads/active?slot=${encodeURIComponent(slug)}&pub=${pub}`, {
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as { ad: ActiveAd | null } | null;
        if (cancelled) return;
        setAd(body?.ad ?? null);
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setAd(null);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, pub]);

  // Fire impression exactly once per slot mount, after the creative is in the DOM.
  useEffect(() => {
    if (!ad || impressionFired.current) return;
    impressionFired.current = true;
    trackEvent('ad_impression', {
      ad_space_slug: ad.slot,
      campaign_id: ad.id,
      advertiser: ad.advertiser,
      publication: pub,
    });
  }, [ad, pub]);

  if (!loaded) return null;
  if (!ad) return <>{fallback}</>;

  const handleClick = () => {
    trackEvent('ad_click', {
      ad_space_slug: ad.slot,
      campaign_id: ad.id,
      advertiser: ad.advertiser,
      publication: pub,
    });
  };

  const w = ad.width ?? 728;
  const h = ad.height ?? 90;

  // Defensive normalization: strip the stray space after the scheme that
  // legacy admin-saved rows have (e.g. 'mailto: ads@...'). Browsers refuse
  // to dispatch malformed URIs, so the Inquire button silently does nothing.
  // The server-side schema + DB cleanup also fix this, but this guarantees
  // a working link even if a stale row reaches the client.
  const safeHref = ad.href.trim().replace(/^(mailto|tel|https?):\s+/i, '$1:');

  // BUG-10: surface a small envelope badge on house-ad inquiry creatives so
  // users understand the tap leads to a contact path (form or mail client),
  // not a third-party site. Covers both legacy mailto: links and the new
  // on-site /advertise/inquire form (Gmail web ignores mailto: dispatch).
  const isMailto = safeHref.startsWith('mailto:');
  const isInquireForm = /\/advertise\/inquire(\?|$|#)/i.test(safeHref);
  const showInquireBadge = isMailto || isInquireForm;

  // Note: intentionally omitting rel="sponsored" here — ad blockers (uBlock,
  // AdGuard, Brave Shields) use it as a hide selector. The link is still
  // marked rel="noopener" and the FTC disclosure is delivered via the
  // accessible label below.
  const creative = (
    <a
      href={safeHref}
      target={isMailto ? undefined : '_blank'}
      rel="noopener"
      onClick={handleClick}
      aria-label={
        showInquireBadge
          ? `${ad.advertiser} — opens advertising inquiry`
          : `Advertising partner: ${ad.advertiser}`
      }
      className="relative block"
    >
      <Image
        src={ad.image}
        alt={ad.alt}
        width={w}
        height={h}
        className="h-auto w-full"
        unoptimized
      />
      {showInquireBadge && (
        <span
          aria-hidden="true"
          className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-800 shadow-sm"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          Inquire
        </span>
      )}
    </a>
  );

  if (variant === 'bare') {
    // Cap creative to its natural size and center so wide desktop containers
    // don't stretch a 728x90 banner to 1248px wide (which scales height
    // proportionally and visually buries adjacent content).
    return (
      <div className={`mx-auto ${className}`} style={{ maxWidth: w }}>
        {creative}
      </div>
    );
  }

  return (
    <div
      className={`relative mx-auto w-full max-w-3xl overflow-hidden rounded-md border border-gray-200 bg-white ${className}`}
    >
      {/* Disclosure badge — split text so blocker cosmetic filters that
          match the literal word "Ad" don't hide the whole container. */}
      <span
        aria-label="Promoted"
        className="absolute right-2 top-2 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white"
      >
        <span aria-hidden="true">{'A' + 'd'}</span>
      </span>
      {creative}
    </div>
  );
}
