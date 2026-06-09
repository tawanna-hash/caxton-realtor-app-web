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

type Pub = 'realtyline' | 'newsline';

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

function readPub(): Pub {
  if (typeof window === 'undefined') return 'realtyline';
  const saved = window.localStorage.getItem('caxton_pub');
  return saved === 'newsline' ? 'newsline' : 'realtyline';
}

type Props = {
  slug: string;
  className?: string;
  /** Rendered when no campaign is active for this slot. Defaults to null. */
  fallback?: React.ReactNode;
  /**
   * Override container styling. Default is a centered block with rounded
   * border. Pass `bare` to render only the creative without any wrapper.
   */
  variant?: 'default' | 'bare';
};

export function AdSlot({ slug, className = '', fallback = null, variant = 'default' }: Props) {
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  const impressionFired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const pub = readPub();

    (async () => {
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
  }, [slug]);

  // Fire impression exactly once per slot mount, after the creative is in the DOM.
  useEffect(() => {
    if (!ad || impressionFired.current) return;
    impressionFired.current = true;
    trackEvent('ad_impression', {
      ad_space_slug: ad.slot,
      campaign_id: ad.id,
      advertiser: ad.advertiser,
      publication: readPub(),
    });
  }, [ad]);

  if (!loaded) return null;
  if (!ad) return <>{fallback}</>;

  const handleClick = () => {
    trackEvent('ad_click', {
      ad_space_slug: ad.slot,
      campaign_id: ad.id,
      advertiser: ad.advertiser,
      publication: readPub(),
    });
  };

  const w = ad.width ?? 728;
  const h = ad.height ?? 90;

  // BUG-10: when the click destination is a mailto: link (house ads soliciting
  // inquiries) surface a small envelope badge so users understand the tap
  // opens their mail client, not a third-party site.
  const isMailto = ad.href.startsWith('mailto:');

  const creative = (
    <a
      href={ad.href}
      target={isMailto ? undefined : '_blank'}
      rel="noopener sponsored"
      onClick={handleClick}
      aria-label={
        isMailto
          ? `${ad.advertiser} — opens email inquiry`
          : `Sponsored: ${ad.advertiser}`
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
      {isMailto && (
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
      <span className="absolute right-2 top-2 z-10 rounded-sm bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white">
        Ad
      </span>
      {creative}
    </div>
  );
}
