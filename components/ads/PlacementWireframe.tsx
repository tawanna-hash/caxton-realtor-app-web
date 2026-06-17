// components/ads/PlacementWireframe.tsx
//
// Shared CSS wireframes for visualizing where each ad slot appears in the
// Realty News Now app. Used by:
//   - /admin/ads/placements (admin team reference)
//   - /advertise/placements (public advertiser-facing inventory walk-through)
//
// Each wireframe component represents a host page (feed, article, calendar,
// account, newsletter, push lock screen, builders index, giveaways) and
// accepts an `active` slug. When the active slug matches a slot rendered
// in that wireframe, the placement gets a teal dashed outline + "Ad here"
// badge so the viewer can see at a glance where the ad appears in context.
//
// To add a new slot:
//   1. Add the slot to APP_AD_SLOTS in lib/media-kit.ts (source of truth)
//   2. Pick an existing wireframe and add a <Highlight active={active === '<slug>'}>
//      block at the position the slot will render, OR add a new wireframe
//      function for a new host page
//   3. Wire the slug -> wireframe in WIREFRAME_BY_SLUG below

import React from 'react';

// ─── Highlight wrapper ─────────────────────────────────────────────────────

function Highlight({
  active,
  label,
  children,
}: {
  active: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  if (active) {
    return (
      <div className="relative">
        <div className="absolute -inset-0.5 rounded border-2 border-dashed border-emerald-500 pointer-events-none" />
        <div className="absolute -top-2 left-2 z-10 rounded-sm bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">
          Ad{label ? ` \u2014 ${label}` : ''}
        </div>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

// ─── Wireframes ───────────────────────────────────────────────────────────

function FeedWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Realty News Now
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'feed_top_banner'}>
          <div className="h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Feed top banner
          </div>
        </Highlight>
      </div>
      <div className="flex-1 px-2 py-2 space-y-1.5">
        <div className="h-7 bg-white rounded border border-slate-200" />
        <Highlight active={active === 'feed_inline_card'}>
          <div className="h-7 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Feed inline card
          </div>
        </Highlight>
        <div className="h-7 bg-white rounded border border-slate-200" />
        <div className="h-7 bg-white rounded border border-slate-200" />
      </div>
      <div className="px-2 pb-1">
        <Highlight active={active === 'feed_sticky_bottom'}>
          <div className="h-5 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Sticky bottom
          </div>
        </Highlight>
      </div>
      <div className="h-5 bg-white border-t border-slate-200 flex items-center justify-around text-slate-400">
        <span>Feed</span><span>Mag</span><span>Cal</span><span>Build</span><span>More</span>
      </div>
    </div>
  );
}

function ArticleWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col text-[8px] border border-slate-200 relative">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        ← Article
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'article_top_leaderboard'}>
          <div className="h-5 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Top leaderboard 728×90
          </div>
        </Highlight>
      </div>
      <div className="px-2 pt-1.5 text-[9px] font-bold text-slate-900 leading-tight">
        City leaders unveil plan to improve public transit
      </div>
      <div className="px-2 text-slate-500">By Jane Doe · 5 min read</div>
      <div className="flex-1 grid grid-cols-3 gap-1 px-2 py-2">
        <div className="col-span-2 space-y-1">
          <div className="h-3 bg-slate-100 rounded" />
          <div className="h-3 bg-slate-100 rounded" />
          <Highlight active={active === 'article_mid_inline'}>
            <div className="h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
              Mid inline 300×250
            </div>
          </Highlight>
          <div className="h-3 bg-slate-100 rounded" />
          <div className="h-3 bg-slate-100 rounded" />
          <Highlight active={active === 'article_bottom'}>
            <div className="h-5 bg-slate-200 rounded flex items-center justify-center text-slate-500">
              Article bottom
            </div>
          </Highlight>
        </div>
        <div>
          <Highlight active={active === 'article_sidebar_desktop'}>
            <div className="h-16 bg-slate-200 rounded flex items-center justify-center text-slate-500 text-center px-1">
              Sidebar 300×600
            </div>
          </Highlight>
        </div>
      </div>
      {active === 'article_interstitial' && (
        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
          <div className="w-3/4 h-3/4 bg-white rounded-lg border-2 border-dashed border-emerald-500 flex items-center justify-center text-slate-700 text-[9px] font-semibold">
            Interstitial overlay
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Calendar
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'calendar_top_banner'}>
          <div className="h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Calendar top banner
          </div>
        </Highlight>
      </div>
      <div className="flex-1 px-2 py-2 space-y-1.5">
        <div className="h-7 bg-white rounded border border-slate-200" />
        <Highlight active={active === 'calendar_event_sponsor'} label="Sponsored event">
          <div className="h-9 bg-amber-50 rounded border-2 border-amber-400 flex items-center justify-center text-amber-700">
            Sponsored event card
          </div>
        </Highlight>
        <div className="h-7 bg-white rounded border border-slate-200" />
        <div className="h-7 bg-white rounded border border-slate-200" />
      </div>
    </div>
  );
}

function AccountWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px] relative">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Account
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'account_splash'}>
          <div className="h-12 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Account page splash
          </div>
        </Highlight>
      </div>
      <div className="flex-1 px-2 py-2 space-y-1.5">
        <div className="h-5 bg-white rounded border border-slate-200" />
        <div className="h-5 bg-white rounded border border-slate-200" />
        <div className="h-5 bg-white rounded border border-slate-200" />
      </div>
      {active === 'splash_welcome' && (
        <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
          <div className="w-3/4 h-1/2 bg-white rounded-lg border-2 border-dashed border-emerald-500 flex items-center justify-center text-slate-700 text-[9px] font-semibold text-center px-2">
            First-launch welcome overlay
          </div>
        </div>
      )}
    </div>
  );
}

function NewsletterWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col text-[8px] border border-slate-200">
      <div className="h-5 bg-slate-100 border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        ✉ Newsletter
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'newsletter_banner'}>
          <div className="h-7 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Newsletter banner 600×200
          </div>
        </Highlight>
      </div>
      <div className="flex-1 px-2 py-2 space-y-1">
        <div className="h-3 bg-slate-100 rounded" />
        <div className="h-3 bg-slate-100 rounded" />
        <div className="h-3 bg-slate-100 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
      </div>
    </div>
  );
}

function PushWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-200 rounded-md overflow-hidden flex flex-col items-center justify-center text-[8px] px-2 py-3">
      <div className="text-slate-600 mb-2">Lock screen</div>
      <Highlight active={active === 'push_sponsorship'}>
        <div className="w-full bg-white rounded-md p-2 shadow-sm">
          <div className="font-semibold text-slate-900 text-[9px]">Realty News Now</div>
          <div className="text-slate-600 text-[8px] mt-0.5">Sponsored: Builder name — Find your dream home</div>
        </div>
      </Highlight>
    </div>
  );
}

function BuildersWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Builders
      </div>
      <div className="px-2 pt-2">
        <Highlight active={active === 'featured_builder_strip'}>
          <div className="h-7 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Featured builder strip 1200×200
          </div>
        </Highlight>
      </div>
      <div className="flex-1 px-2 py-2 grid grid-cols-2 gap-1">
        <div className="bg-white rounded border border-slate-200" />
        <div className="bg-white rounded border border-slate-200" />
        <div className="bg-white rounded border border-slate-200" />
        <div className="bg-white rounded border border-slate-200" />
      </div>
    </div>
  );
}

function GiveawaysWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Giveaways
      </div>
      <div className="flex-1 px-2 py-2">
        <Highlight active={active === 'giveaway_prize_sponsor'} label="Sponsored prize">
          <div className="h-full bg-amber-50 rounded border-2 border-amber-400 flex flex-col items-center justify-center text-amber-700 px-2 text-center">
            <div className="font-semibold">Sponsored prize</div>
            <div className="text-[7px] mt-1">Builder logo + prize details</div>
          </div>
        </Highlight>
      </div>
    </div>
  );
}

// ─── Slug → wireframe mapping ─────────────────────────────────────────────

const WIREFRAME_BY_SLUG: Record<string, (active: string) => React.ReactNode> = {
  feed_top_banner:           (a) => <FeedWireframe active={a} />,
  feed_inline_card:          (a) => <FeedWireframe active={a} />,
  feed_sticky_bottom:        (a) => <FeedWireframe active={a} />,
  article_top_leaderboard:   (a) => <ArticleWireframe active={a} />,
  article_mid_inline:        (a) => <ArticleWireframe active={a} />,
  article_bottom:            (a) => <ArticleWireframe active={a} />,
  article_sidebar_desktop:   (a) => <ArticleWireframe active={a} />,
  article_interstitial:      (a) => <ArticleWireframe active={a} />,
  calendar_top_banner:       (a) => <CalendarWireframe active={a} />,
  calendar_event_sponsor:    (a) => <CalendarWireframe active={a} />,
  account_splash:            (a) => <AccountWireframe active={a} />,
  splash_welcome:            (a) => <AccountWireframe active={a} />,
  newsletter_banner:         (a) => <NewsletterWireframe active={a} />,
  push_sponsorship:          (a) => <PushWireframe active={a} />,
  featured_builder_strip:    (a) => <BuildersWireframe active={a} />,
  giveaway_prize_sponsor:    (a) => <GiveawaysWireframe active={a} />,
};

// ─── Public API ───────────────────────────────────────────────────────────

export function PlacementWireframe({ slug }: { slug: string }) {
  const renderer = WIREFRAME_BY_SLUG[slug];
  if (!renderer) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
        Preview coming soon
      </div>
    );
  }
  return <>{renderer(slug)}</>;
}

export function hasWireframe(slug: string): boolean {
  return slug in WIREFRAME_BY_SLUG;
}
