// app/(public)/advertise/placements/page.tsx
//
// Public, advertiser-facing visual walk-through of every digital ad slot
// in the app. Same wireframes as the internal /admin/ads/placements page,
// but with friendlier copy (no slug strings, no admin-only links) and a
// direct "Book this placement" CTA on each card.
//
// Reads APP_AD_SLOTS from lib/media-kit.ts (single source of truth) and
// renders each slot inside a CSS wireframe of its host page (feed / article
// / calendar / account / newsletter / push / builders / giveaways) with
// the placement highlighted in green so buyers can see exactly where the
// creative appears in context.
//
// Wireframe rendering lives in components/ads/PlacementWireframe.tsx, so
// adding a new slot to the catalog + wiring it into the wireframe map
// automatically surfaces it here.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, type AppAdSlot } from '@/lib/media-kit';
import { PlacementWireframe, hasWireframe } from '@/components/ads/PlacementWireframe';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Where ads appear — Realty News Now',
  description:
    'See every digital ad placement in the Realty News Now app — feed, article, calendar, account, newsletter and push — with a visual preview of exactly where your creative renders.',
};

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  account: 'Account',
  newsletter: 'Newsletter',
  app: 'App-wide',
};

// Friendly host-page description per slug — same intent as the admin page,
// but written for advertisers rather than the sales team.
const HOST_PAGE_BY_SLUG: Record<string, string> = {
  feed_top_banner:        'Top of the main feed',
  feed_inline_card:       'Inside the main feed, between stories',
  feed_sticky_bottom:     'Sticky bar at the bottom of every public page',
  featured_builder_strip: 'Builders directory + inventory pages',
  giveaway_prize_sponsor: 'Giveaways page',
  article_top_leaderboard:'Top of every article',
  article_mid_inline:     'Mid-article, between paragraphs',
  article_bottom:         'Bottom of every article',
  article_sidebar_desktop:'Article sidebar (desktop only)',
  article_interstitial:   'Full-screen between articles (every 4th tap)',
  calendar_top_banner:    'Top of the events calendar',
  calendar_event_sponsor: 'Promoted event card in the calendar',
  account_splash:         'Top of the account + profile screens',
  splash_welcome:         'First-launch welcome screen',
  newsletter_banner:      'Tuesday + Friday email newsletter',
  push_sponsorship:       'iOS / Android push notification',
};

const TIER_ORDER: Record<AppAdSlot['tier'], number> = { premium: 0, standard: 1 };

function priceLine(s: AppAdSlot): string {
  const unit = s.pricingUnit ?? 'week';
  const u = unit === 'per send' ? 'send' : unit === 'per push' ? 'push' : 'wk';
  const mo = s.monthlySingle ? ` · $${s.monthlySingle}/mo` : '';
  return `$${s.weeklySingle}/${u} single pub${mo}`;
}

function PlacementCard({ slot }: { slot: AppAdSlot }) {
  const hostPage = HOST_PAGE_BY_SLUG[slot.slug] ?? ZONE_LABEL[slot.zone];

  return (
    <article className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Wireframe preview */}
      <div className="relative bg-gray-100 border-b border-gray-200 h-56 p-3">
        {hasWireframe(slot.slug) ? (
          <PlacementWireframe slug={slot.slug} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-500">
            Preview coming soon
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold">
              {slot.tier} · {ZONE_LABEL[slot.zone]}
            </div>
            <h3 className="text-base font-semibold text-brand-700 leading-tight mt-0.5">
              {slot.name}
            </h3>
          </div>
          {slot.rotates && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              title="Rotates with up to 5 active campaigns. 6s dwell, 2s cross-fade."
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              Rotates
            </span>
          )}
        </div>
        {slot.rotates && (
          <div className="text-[11px] text-blue-700">
            Shared placement · up to 5 partners cycle · 6-second view + 2-second fade
          </div>
        )}

        <div className="text-xs text-gray-700">
          {priceLine(slot)}
        </div>

        <div className="text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Where it appears:</span>{' '}
          <span>{hostPage}</span>
        </div>

        <div className="text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Specs:</span>{' '}
          <span>{slot.sizes}</span>
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed mt-auto pt-1">
          {slot.notes}
        </p>

        <div className="pt-3 mt-1 border-t border-gray-100">
          <Link
            href={`/advertise/checkout/${slot.slug}?pub=realtyline`}
            className="inline-block w-full text-center bg-brand-700 text-white text-sm font-semibold py-2 rounded-md hover:bg-brand-700"
          >
            Book this placement →
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function PublicAdvertisePlacementsPage() {
  const sorted = [...APP_AD_SLOTS].sort((a, b) => {
    const ta = TIER_ORDER[a.tier] ?? 9;
    const tb = TIER_ORDER[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    return a.name.localeCompare(b.name);
  });

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise · Placements
        </p>
        <PageTitle size="md">
          See exactly where your ad appears.
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Every digital placement in Realty News Now, shown in context. Each
          card includes a wireframe of the host screen with the ad position
          highlighted in green — so you know precisely what you&apos;re booking
          before you check out.
        </p>
        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl mt-3">
          Slots marked <span className="inline-flex items-center gap-1 align-middle rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            Rotates
          </span> are shared placements: up to 5 active partners cycle through the same surface, with a 6-second view and a 2-second cross-fade between creatives.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            href="/advertise/digital"
            className="text-brand-700 underline font-semibold"
          >
            See live availability →
          </Link>
          <Link
            href="/advertise/inquire"
            className="text-gray-600 hover:text-gray-900"
          >
            Need a custom package? Talk to our team
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sorted.map((slot) => (
          <PlacementCard key={slot.slug} slot={slot} />
        ))}
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200 text-sm text-gray-600">
        <p>
          Pricing shown is for a single publication. Multi-market bundles
          (RealtyLine + Newsline) are priced at checkout — pick your markets
          and the system applies the bundle multiplier automatically.
        </p>
      </footer>
        </div>
    </main>
  );
}
