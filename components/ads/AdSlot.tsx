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
//   - For banner-shaped slugs (see ROTATING_SLUGS below) it fetches with
//     multi=1 and rotates through up to 5 active creatives. Each creative
//     dwells 6s and cross-fades over 2s into the next. If only one creative
//     is active, no rotation happens.
//   - Resolves publication from localStorage key `caxton_pub` (set by pub switcher)
//   - Renders nothing while loading. If no campaign, renders `fallback` (default: null).
//   - Fires `ad_impression` once per (slot, campaign_id) visible — so each
//     rotated creative gets its own impression.
//   - Fires `ad_click` on user click, then opens click_url in a new tab.
//   - Video creatives (media_type 'video') autoplay muted + inline, pause
//     when scrolled off-screen, and fire ad_video_start / ad_video_progress
//     (25/50/75) / ad_video_complete once per (slot, campaign). In a rotating
//     slot a video holds until it finishes, then the rotation continues.
//     prefers-reduced-motion users see the poster still instead.
//
// Tracking properties (PostHog):
//   ad_space_slug, campaign_id, advertiser, publication, rotation_index

import { useCallback, useEffect, useRef, useState } from 'react';
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
  media_type?: 'image' | 'video';
  video?: string | null;
  duration_seconds?: number | null;
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

// Banner-shaped slugs rotate. Any slug listed here fetches up to 5 active
// creatives and cross-fades between them on a 7-second interval. Add new
// banner slugs here as inventory grows.
const ROTATING_SLUGS = new Set([
  'feed_top_banner',
  'feed_sticky_bottom',
  'newsletter_banner',
  'article_top_leaderboard',
  'calendar_top_banner',
]);

// Timing: 6s dwell + 2s cross-fade.
// Tuned to feel like a deliberate banner rotation — enough hang time to
// read the creative, slow enough fade to avoid looking like a glitch.
const DWELL_MS = 6000;
const FADE_MS = 2000;
// Safety cap so a video that never fires `ended` (stalled network) can't
// freeze a rotating slot forever.
const VIDEO_MAX_HOLD_MS = 65_000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

type VideoCreativeProps = {
  ad: ActiveAd;
  width: number;
  height: number;
  loop: boolean;
  onEnded: () => void;
  onTrack: (event: string, extra?: Record<string, unknown>) => void;
};

function VideoCreative({ ad, width, height, loop, onEnded, onTrack }: VideoCreativeProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const fired = useRef<Set<string>>(new Set());

  // Play only while at least half visible; pause off-screen to save battery
  // and data on mobile.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id]);

  const once = (key: string, extra?: Record<string, unknown>) => {
    if (fired.current.has(key)) return;
    fired.current.add(key);
    onTrack(key.startsWith('p') ? 'ad_video_progress' : `ad_video_${key}`, extra);
  };

  return (
    <video
      ref={ref}
      key={ad.id}
      src={ad.video ?? undefined}
      poster={ad.image}
      width={width}
      height={height}
      muted
      playsInline
      autoPlay
      loop={loop}
      preload="metadata"
      aria-label={ad.alt}
      className="block h-auto w-full"
      onPlay={() => once('start')}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (!v.duration) return;
        const pct = (v.currentTime / v.duration) * 100;
        for (const q of [25, 50, 75]) if (pct >= q) once(`p${q}`, { percent: q });
        if (loop && pct >= 97) once('complete');
      }}
      onEnded={() => {
        once('complete');
        onEnded();
      }}
    />
  );
}

export function AdSlot({ slug, className = '', fallback = null, variant = 'default' }: Props) {
  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [fading, setFading] = useState(false);
  const firedImpressions = useRef<Set<string>>(new Set());
  const { pub } = usePublication();

  const rotating = ROTATING_SLUGS.has(slug);

  // Reset on pub/slug change so a fresh creative for the new pub fires its
  // own impression.
  useEffect(() => {
    let cancelled = false;
    firedImpressions.current = new Set();

    (async () => {
      // Defer state flip so we don't trigger a synchronous cascading render
      // inside this effect (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      setLoaded(false);
      setIndex(0);
      try {
        const url = rotating
          ? `/api/ads/active?slot=${encodeURIComponent(slug)}&pub=${pub}&multi=1&limit=5`
          : `/api/ads/active?slot=${encodeURIComponent(slug)}&pub=${pub}`;
        const res = await fetch(url, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as
          | { ad?: ActiveAd | null; ads?: ActiveAd[] }
          | null;
        if (cancelled) return;
        if (rotating) {
          setAds(Array.isArray(body?.ads) ? (body!.ads as ActiveAd[]) : []);
        } else {
          setAds(body?.ad ? [body.ad as ActiveAd] : []);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setAds([]);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, pub, rotating]);

  const reducedMotion = usePrefersReducedMotion();

  // Rotation — only when more than one creative is active. Images dwell
  // DWELL_MS; a playing video holds the slot until it ends (capped).
  const total = ads.length;
  const advance = useCallback(() => {
    if (!rotating || total < 2) return;
    setFading(true);
    setTimeout(() => {
      setIndex((i) => (i + 1) % total);
      setFading(false);
    }, FADE_MS);
  }, [rotating, total]);
  const currentIsVideo = ads[index]?.media_type === 'video' && !!ads[index]?.video && !reducedMotion;
  useEffect(() => {
    if (!rotating || ads.length < 2) return;
    const id = setTimeout(advance, currentIsVideo ? VIDEO_MAX_HOLD_MS : DWELL_MS);
    return () => clearTimeout(id);
  }, [rotating, ads.length, index, currentIsVideo, advance]);

  // Fire impression once per (slot, campaign_id) — covers initial render and
  // every subsequent rotated creative.
  const currentAd = ads[index];
  useEffect(() => {
    if (!currentAd) return;
    const key = `${currentAd.slot}:${currentAd.id}`;
    if (firedImpressions.current.has(key)) return;
    firedImpressions.current.add(key);
    trackEvent('ad_impression', {
      ad_space_slug: currentAd.slot,
      campaign_id: currentAd.id,
      advertiser: currentAd.advertiser,
      publication: pub,
      rotation_index: index,
      rotation_total: ads.length,
    });
  }, [currentAd, pub, index, ads.length]);

  if (!loaded) return null;
  if (!currentAd) return <>{fallback}</>;

  const ad = currentAd;

  const handleClick = () => {
    trackEvent('ad_click', {
      ad_space_slug: ad.slot,
      campaign_id: ad.id,
      advertiser: ad.advertiser,
      publication: pub,
      rotation_index: index,
      rotation_total: ads.length,
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

  // Keep disclosure consistent across every app placement. Splitting the
  // visible text preserves the existing resistance to cosmetic ad-blocker
  // filters that key on a single literal "advertising" text node.
  const partnerLabel = (
    <p
      aria-label="Advertising partner"
      className="mb-2 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-gray-500"
    >
      <span aria-hidden="true">{'Advertising'}</span>
      <span aria-hidden="true">{'\u00a0Partner'}</span>
    </p>
  );

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
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      {currentIsVideo ? (
        <VideoCreative
          ad={ad}
          width={w}
          height={h}
          loop={!rotating || ads.length < 2}
          onEnded={advance}
          onTrack={(event, extra) =>
            trackEvent(event, {
              ad_space_slug: ad.slot,
              campaign_id: ad.id,
              advertiser: ad.advertiser,
              publication: pub,
              rotation_index: index,
              rotation_total: ads.length,
              ...extra,
            })
          }
        />
      ) : (
        <Image
          src={ad.image}
          alt={ad.alt}
          width={w}
          height={h}
          className="h-auto w-full"
          unoptimized
        />
      )}
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
        {partnerLabel}
        {creative}
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full max-w-3xl ${className}`}>
      {partnerLabel}
      <div
        className="relative overflow-hidden rounded-md border border-gray-200 bg-white"
      >
        {/* Disclosure badge — split text so blocker cosmetic filters that
            match the literal word "Ad" don't hide the whole container. */}
        <span
          aria-label="Promoted"
          className="absolute right-2 top-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white"
        >
          <span aria-hidden="true">{'A' + 'd'}</span>
        </span>
        {creative}
      </div>
    </div>
  );
}
