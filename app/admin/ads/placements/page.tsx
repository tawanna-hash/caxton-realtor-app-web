// /admin/ads/placements
//
// Visual reference for every digital ad placement in the app. Each slot
// renders a small wireframe of the host page (article / feed / calendar /
// account / newsletter / push) with a teal dashed outline + label marking
// where the creative appears. Reads APP_AD_SLOTS from lib/media-kit.ts as
// the single source of truth — adding a new slot to that catalog will show
// up here automatically once a wireframe is wired up in PlacementWireframe.
//
// Purpose: gives the sales team and any internal stakeholder a one-page
// answer to "where does Article Top Leaderboard actually appear?" without
// digging through page source. Also used as a visual reference during ad
// inventory walk-throughs with prospective advertisers.
//
// Wireframe rendering lives in components/ads/PlacementWireframe.tsx so the
// same component can power /advertise/placements (public advertiser-facing
// version of this page).

import Link from 'next/link';
import { APP_AD_SLOTS, type AppAdSlot } from '@/lib/media-kit';
import { PlacementWireframe, hasWireframe } from '@/components/ads/PlacementWireframe';

import PageTitle from '@/components/ui/PageTitle';
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

// ─── Card ─────────────────────────────────────────────────────────────────

function PlacementCard({ slot }: { slot: AppAdSlot }) {
  const hostPage = HOST_PAGE_BY_SLUG[slot.slug] ?? ZONE_LABEL[slot.zone];
  const monthly = slot.monthlySingle ? `$${slot.monthlySingle}/mo` : null;
  const unit = slot.pricingUnit ?? 'week';
  const unitLabel = unit === 'per send' ? '/send' : unit === 'per push' ? '/push' : '/wk';

  return (
    <article className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Wireframe preview */}
      <div className="relative bg-gray-100 border-b border-gray-200 h-56 p-3">
        {hasWireframe(slot.slug) ? (
          <PlacementWireframe slug={slot.slug} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-500">
            No wireframe yet
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              {slot.tier} · {ZONE_LABEL[slot.zone]}
            </div>
            <h3 className="text-base font-semibold text-gray-900 leading-tight mt-0.5">
              {slot.name}
            </h3>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{slot.slug}</div>
          </div>
        </div>

        <div className="text-xs text-gray-700">
          <span className="font-semibold">${slot.weeklySingle}</span>
          <span className="text-gray-500">{unitLabel} single pub</span>
          {monthly && (
            <>
              <span className="text-gray-300 mx-1.5">·</span>
              <span className="text-gray-700">{monthly}</span>
            </>
          )}
        </div>

        <div className="text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Renders on:</span>{' '}
          <span>{hostPage}</span>
        </div>

        <div className="text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Specs:</span>{' '}
          <span>{slot.sizes}</span>
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed mt-auto pt-1">{slot.notes}</p>

        <div className="flex gap-2 pt-2 border-t border-gray-100 mt-1">
          <Link
            href={`/advertise/checkout/${slot.slug}?pub=realtyline`}
            target="_blank"
            className="text-[11px] font-medium text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline"
          >
            Open checkout →
          </Link>
          <Link
            href={`/admin/ads?tab=catalog&slug=${slot.slug}`}
            className="text-[11px] font-medium text-gray-600 hover:text-gray-900"
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
        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Admin · Ads
        </div>
        <PageTitle size="md">Placements</PageTitle>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-700 font-semibold mt-2">
          Print {'\u00b7'} Digital {'\u00b7'} Social {'\u00b7'} Mobile.{' '}
          <span className="text-gray-500 font-normal normal-case tracking-normal">
            One powerful marketing platform.
          </span>
        </p>
        <p className="text-sm text-gray-600 mt-2 max-w-3xl">
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

      <p className="mt-8 text-xs text-gray-500">
        {sorted.length} placements · source of truth: <code className="font-mono">lib/media-kit.ts</code>
      </p>
    </div>
  );
}
