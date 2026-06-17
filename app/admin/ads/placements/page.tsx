// /admin/ads/placements
//
// Visual reference for every digital ad placement in the app. Each slot
// renders a small wireframe of the host page (article / feed / calendar /
// account / newsletter / push) with a teal dashed outline + label marking
// where the creative appears. Reads APP_AD_SLOTS from lib/media-kit.ts as
// the single source of truth — adding a new slot to that catalog will show
// up here automatically once the placement is added to the WIREFRAMES map.
//
// Purpose: gives the sales team and any internal stakeholder a one-page
// answer to "where does Article Top Leaderboard actually appear?" without
// digging through page source. Also used as a visual reference during ad
// inventory walk-throughs with prospective advertisers.

import Link from 'next/link';
import { APP_AD_SLOTS, type AppAdSlot } from '@/lib/media-kit';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Placements — Admin',
};

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  account: 'Account',
  newsletter: 'Newsletter',
  app: 'App-wide',
};

// Host-page description per slug. Most match their zone, but a few slots
// (featured_builder_strip on /builders, giveaway_prize_sponsor on /giveaways)
// have specific host pages that differ from the zone default.
const HOST_PAGE_BY_SLUG: Record<string, string> = {
  feed_top_banner:        '/feed',
  feed_inline_card:       '/feed',
  feed_sticky_bottom:     'Every public page (sticky)',
  featured_builder_strip: '/builders + /inventory',
  giveaway_prize_sponsor: '/giveaways',
  article_top_leaderboard:'/feed → any article',
  article_mid_inline:     '/feed → any article',
  article_bottom:         '/feed → any article',
  article_sidebar_desktop:'/feed → any article (desktop only)',
  article_interstitial:   '/feed → every 4th article tap',
  calendar_top_banner:    '/calendar',
  calendar_event_sponsor: '/calendar (sponsored event card)',
  account_splash:         '/account + /profile',
  splash_welcome:         'First-launch app welcome',
  newsletter_banner:      'Tuesday + Friday email',
  push_sponsorship:       'iOS / Android push notification',
};

// ─── Wireframe components ─────────────────────────────────────────────────
//
// Each wireframe represents a host page where ads can appear. Inside each
// host wireframe we render <Highlight slug={...}>...</Highlight> at the
// positions where that slot lives. The Highlight component renders the
// content with a teal dashed outline + "Ad here" badge IF the slug matches
// the active slot the card is highlighting; otherwise it renders the
// content as a normal grey box so the buyer can see how the slot relates
// to surrounding content.

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
          Ad{label ? ` — ${label}` : ''}
        </div>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

// ── Feed wireframe ──
function FeedWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
      {/* header */}
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        Realty News Now
      </div>
      {/* feed_top_banner */}
      <div className="px-2 pt-2">
        <Highlight active={active === 'feed_top_banner'}>
          <div className="h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Feed top banner
          </div>
        </Highlight>
      </div>
      {/* feed cards */}
      <div className="flex-1 px-2 py-2 space-y-1.5">
        <div className="h-7 bg-white rounded border border-slate-200" />
        {/* feed_inline_card position */}
        <Highlight active={active === 'feed_inline_card'}>
          <div className="h-7 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Feed inline card
          </div>
        </Highlight>
        <div className="h-7 bg-white rounded border border-slate-200" />
        <div className="h-7 bg-white rounded border border-slate-200" />
        {/* featured_builder_strip + giveaway_prize_sponsor live on /builders + /giveaways respectively — show a "see other zones" hint */}
        {(active === 'featured_builder_strip' || active === 'giveaway_prize_sponsor') && (
          <div className="h-7 bg-amber-50 border border-amber-300 rounded flex items-center justify-center text-amber-700 text-[8px] px-1 text-center">
            Renders on /builders + /giveaways
          </div>
        )}
      </div>
      {/* sticky bottom */}
      <div className="px-2 pb-1">
        <Highlight active={active === 'feed_sticky_bottom'}>
          <div className="h-5 bg-slate-200 rounded flex items-center justify-center text-slate-500">
            Sticky bottom
          </div>
        </Highlight>
      </div>
      {/* bottom nav */}
      <div className="h-5 bg-white border-t border-slate-200 flex items-center justify-around text-slate-400">
        <span>Feed</span><span>Mag</span><span>Cal</span><span>Build</span><span>More</span>
      </div>
    </div>
  );
}

// ── Article wireframe ──
function ArticleWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col text-[8px] border border-slate-200">
      <div className="h-5 bg-white border-b border-slate-200 flex items-center px-2 font-semibold text-slate-700">
        ← Article
      </div>
      <div className="px-2 pt-2">
        {/* top leaderboard */}
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
          {/* mid inline */}
          <Highlight active={active === 'article_mid_inline'}>
            <div className="h-6 bg-slate-200 rounded flex items-center justify-center text-slate-500">
              Mid inline 300×250
            </div>
          </Highlight>
          <div className="h-3 bg-slate-100 rounded" />
          <div className="h-3 bg-slate-100 rounded" />
          {/* article bottom */}
          <Highlight active={active === 'article_bottom'}>
            <div className="h-5 bg-slate-200 rounded flex items-center justify-center text-slate-500">
              Article bottom
            </div>
          </Highlight>
        </div>
        {/* sidebar */}
        <div>
          <Highlight active={active === 'article_sidebar_desktop'}>
            <div className="h-16 bg-slate-200 rounded flex items-center justify-center text-slate-500 text-center px-1">
              Sidebar 300×600
            </div>
          </Highlight>
        </div>
      </div>
      {/* interstitial — full overlay */}
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

// ── Calendar wireframe ──
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

// ── Account / Splash wireframe ──
function AccountWireframe({ active }: { active: string }) {
  return (
    <div className="w-full h-full bg-slate-50 rounded-md overflow-hidden flex flex-col text-[8px]">
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
      {/* splash welcome — first-launch overlay */}
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

// ── Newsletter wireframe ──
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

// ── Push wireframe ──
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

// ── Builders / Inventory wireframe (for featured_builder_strip) ──
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

// ── Giveaways wireframe (for giveaway_prize_sponsor) ──
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

// ─── Slot → wireframe mapping ─────────────────────────────────────────────
//
// Each slug points to the wireframe that best illustrates where the ad
// appears. Some slots live on dedicated pages (giveaway_prize_sponsor on
// /giveaways, featured_builder_strip on /builders), so those route to the
// matching wireframe rather than the generic feed wireframe.

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

// ─── Card ─────────────────────────────────────────────────────────────────

function PlacementCard({ slot }: { slot: AppAdSlot }) {
  const wireframeFn = WIREFRAME_BY_SLUG[slot.slug];
  const hostPage = HOST_PAGE_BY_SLUG[slot.slug] ?? ZONE_LABEL[slot.zone];
  const monthly = slot.monthlySingle ? `$${slot.monthlySingle}/mo` : null;
  const unit = slot.pricingUnit ?? 'week';
  const unitLabel = unit === 'per send' ? '/send' : unit === 'per push' ? '/push' : '/wk';

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Wireframe preview */}
      <div className="relative bg-slate-100 border-b border-slate-200 h-56 p-3">
        {wireframeFn ? (
          wireframeFn(slot.slug)
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            No wireframe yet
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              {slot.tier} · {ZONE_LABEL[slot.zone]}
            </div>
            <h3 className="text-base font-semibold text-slate-900 leading-tight mt-0.5">
              {slot.name}
            </h3>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{slot.slug}</div>
          </div>
        </div>

        <div className="text-xs text-slate-700">
          <span className="font-semibold">${slot.weeklySingle}</span>
          <span className="text-slate-500">{unitLabel} single pub</span>
          {monthly && (
            <>
              <span className="text-slate-300 mx-1.5">·</span>
              <span className="text-slate-700">{monthly}</span>
            </>
          )}
        </div>

        <div className="text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Renders on:</span>{' '}
          <span>{hostPage}</span>
        </div>

        <div className="text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Specs:</span>{' '}
          <span>{slot.sizes}</span>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed mt-auto pt-1">{slot.notes}</p>

        <div className="flex gap-2 pt-2 border-t border-slate-100 mt-1">
          <Link
            href={`/advertise/checkout/${slot.slug}?pub=realtyline`}
            target="_blank"
            className="text-[11px] font-medium text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline"
          >
            Open checkout →
          </Link>
          <Link
            href={`/admin/ads?tab=catalog&slug=${slot.slug}`}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
          >
            View in catalog
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<AppAdSlot['tier'], number> = { premium: 0, standard: 1 };

export default function AdminAdsPlacementsPage() {
  const sorted = [...APP_AD_SLOTS].sort((a, b) => {
    const ta = TIER_ORDER[a.tier] ?? 9;
    const tb = TIER_ORDER[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          Admin · Ads
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mt-1">Placements</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-3xl">
          Visual reference for every digital ad slot in the app. Each card shows
          a wireframe of the host page with the placement highlighted in green.
          Use this to walk advertisers through inventory or to verify a slot
          renders where you expect after a code change.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sorted.map((slot) => (
          <PlacementCard key={slot.slug} slot={slot} />
        ))}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        {sorted.length} placements · source of truth: <code className="font-mono">lib/media-kit.ts</code>
      </p>
    </div>
  );
}
