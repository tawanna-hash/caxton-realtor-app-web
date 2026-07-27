import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import TrackPageView from '@/components/analytics/TrackPageView';
import {
  APP_AD_SLOTS,
  PACKAGES,
  EBLASTS,
  PUB_SUBSCRIBERS,
  AUDIENCE_STATS,
} from '@/lib/media-kit';

export const metadata = {
  title: 'Advertise with Us — Realty News Now',
  description:
    'Print, digital, social, and mobile advertising across RealtyLine and Newsline — 130K+ Texas real estate professionals across Austin, San Antonio, Houston, and Dallas/Fort Worth.',
};

// Derived figures from the media kit. Source of truth: lib/media-kit.ts.
const DIGITAL_SLOT_COUNT = APP_AD_SLOTS.length;
const DIGITAL_STARTING_PRICE = Math.min(
  ...APP_AD_SLOTS.map((s) => s.weeklySingle),
);
const PRINT_STARTING_PRICE = Math.min(
  ...PACKAGES.flatMap((p) => p.sizes.map((s) => s.price)),
);
const EBLAST_STARTING_PRICE = Math.min(
  ...EBLASTS.flatMap((b) =>
    Object.values(b.priceByPub ?? { _: b.price }).filter(
      (v): v is number => typeof v === 'number',
    ),
  ),
);
const TOTAL_NETWORK_SUBS = PUB_SUBSCRIBERS.both;

export default function AdvertisePage() {
  return (
    <>
      <TrackPageView event="advertise_page_viewed" />
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise
        </p>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Print {'\u00b7'} Digital {'\u00b7'} Social {'\u00b7'} Mobile.{' '}
          <span className="text-gray-500 font-normal normal-case tracking-normal">
            One powerful marketing platform.
          </span>
        </p>
        <PageTitle size="md">
          Connect with our audience wherever they are, every day.
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Whether they{'\u2019'}re reading our print edition, browsing our
          digital replica, engaging on social media, or accessing content
          through our mobile web app, your brand stays visible across every
          touchpoint. Our integrated media platform delivers consistent
          exposure and meaningful engagement, ensuring your message reaches
          readers when, where, and how they prefer to consume information.
        </p>
      </header>

      <section className="mb-12 rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50 p-6 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-700 font-semibold mb-2">
              New {'·'} Self-service portal
            </p>
            <h2
              className="font-serif text-2xl text-gray-900 mb-1"
            >
              Buy a placement in two minutes.
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed max-w-xl">
              Digital ad formats from ${DIGITAL_STARTING_PRICE}/week, pick your
              market and dates, instant checkout {'—'} no sales call required.
            </p>
          </div>
          <Link
            href="/advertise/portal"
            className="shrink-0 inline-flex items-center gap-2 rounded-md bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 transition"
          >
            Open self-service portal
            <span aria-hidden>{'\u2192'}</span>
          </Link>
        </div>
      </section>

      {/* ── Audience ────────────────────────────────────────────────────── */}
      <section className="mb-12">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Our combined audience
        </p>
        <h2
          className="font-serif text-2xl md:text-3xl text-gray-900 leading-tight mb-3"
        >
          {TOTAL_NETWORK_SUBS.toLocaleString('en-US')} engaged real estate
          subscribers across four Texas markets.
        </h2>
        <p className="text-base text-gray-700 leading-relaxed font-light mb-6 max-w-3xl">
          Active REALTORS{'\u00ae'}, brokers, builders, lenders, title
          professionals, and industry partners across Austin, San Antonio,
          Houston, and Dallas / Fort Worth {'\u2014'} the largest dedicated
          real-estate publishing network in Texas.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-gray-200 px-4 py-5 rounded-md">
            <p className="text-3xl font-semibold text-brand-700 tracking-tight">
              {(PUB_SUBSCRIBERS.realtyline / 1000).toFixed(0)}K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              RealtyLine
              <br />
              Austin
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5 rounded-md">
            <p className="text-3xl font-semibold text-brand-700 tracking-tight">
              {(PUB_SUBSCRIBERS.newsline / 1000).toFixed(0)}K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              Newsline
              <br />
              San Antonio
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5 rounded-md">
            <p className="text-3xl font-semibold text-brand-700 tracking-tight">
              {(PUB_SUBSCRIBERS['realtyline-houston'] / 1000).toFixed(0)}K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              RealtyLine
              <br />
              Houston
            </p>
          </div>
          <div className="border border-gray-200 px-4 py-5 rounded-md">
            <p className="text-3xl font-semibold text-brand-700 tracking-tight">
              {(PUB_SUBSCRIBERS['realtyline-dallas'] / 1000).toFixed(0)}K
            </p>
            <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
              RealtyLine
              <br />
              Dallas / FTW
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AUDIENCE_STATS.map((s) => (
            <div
              key={s.label}
              className="border border-gray-100 px-4 py-3 bg-gray-50 rounded-md"
            >
              <p className="text-xl font-semibold text-gray-900">{s.value}</p>
              <p className="text-xs uppercase tracking-wider text-gray-500 mt-0.5">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Four channels ─────────────────────────────────────────────────── */}
      <section className="mb-12">

        <div className="space-y-6">
          {/* PRINT */}
          <div className="border border-gray-200 p-6 md:p-7 rounded-md">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                >
                  Print magazine
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                Packages from ${PRINT_STARTING_PRICE}/month
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              Monthly RealtyLine and Newsline San Antonio editions, directly
              mailed each month to subscribers.
            </p>


            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Full Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  10{'\u2033'} {'\u00d7'} 11.0833{'\u2033'}
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Half Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  10{'\u2033'} {'\u00d7'} 5.25{'\u2033'} horizontal
                  <br />
                  4.8333{'\u2033'} {'\u00d7'} 11.0833{'\u2033'} vertical
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Quarter Page
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  4.8333{'\u2033'} {'\u00d7'} 5.25{'\u2033'}
                </p>
              </div>
            </div>

            {/* Brand packages preview — live from media kit */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs uppercase tracking-wider text-gray-700 font-semibold mb-3">
                Brand packages
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                {PACKAGES.map((p) => {
                  const starting = Math.min(...p.sizes.map((s) => s.price));
                  return (
                    <div
                      key={p.id}
                      className={
                        'border px-3 py-2.5 ' +
                        (p.premium
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : p.popular
                            ? 'border-orange-200 bg-orange-50'
                            : 'border-gray-100')
                      }
                    >
                      <p
                        className={
                          'text-xs font-semibold ' +
                          (p.premium ? 'text-white' : 'text-gray-900')
                        }
                      >
                        {p.name}
                      </p>
                      <p
                        className={
                          'text-[10px] ' +
                          (p.premium ? 'text-white/80' : 'text-gray-500')
                        }
                      >
                        {p.term}
                      </p>
                      <p
                        className={
                          'text-sm font-semibold tabular-nums mt-1 ' +
                          (p.premium ? 'text-white' : 'text-gray-900')
                        }
                      >
                        from ${starting}
                        <span
                          className={
                            'text-[10px] font-normal ' +
                            (p.premium ? 'text-white/70' : 'text-gray-500')
                          }
                        >
                          /mo
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <details className="mt-6 border-t border-gray-100 pt-5 group">
              <summary className="text-xs font-semibold uppercase tracking-wider text-gray-900 cursor-pointer list-none flex items-center justify-between">
                <span>What every print partnership includes</span>
                <span className="text-gray-400 group-open:rotate-180 transition-transform">
                  {'\u25be'}
                </span>
              </summary>
              <p className="text-sm text-gray-700 leading-relaxed font-light mt-4 mb-5">
                Our packages are built around exposure plus engagement{' '}
                {'\u2014'} we don&apos;t just place an ad and walk away. Every
                partner gets a mix of these editorial and audience perks
                alongside their paid placements:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Featured advertiser article
                  </p>
                  <p className="text-gray-700 font-light leading-relaxed">
                    Our editorial team interviews you or your team and
                    publishes a feature piece on your people, products, or
                    services.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Event coverage
                  </p>
                  <p className="text-gray-700 font-light leading-relaxed">
                    We send a photographer to your events and capture live
                    Facebook coverage {'\u2014'} turning a single event into
                    ongoing marketing assets.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Press release distribution
                  </p>
                  <p className="text-gray-700 font-light leading-relaxed">
                    Submit press releases to be reviewed and run in print and
                    digital issues alongside our editorial coverage.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Unlimited event calendar
                  </p>
                  <p className="text-gray-700 font-light leading-relaxed">
                    Add as many of your events as you want to our public event
                    calendar {'\u2014'} open houses, CE classes, mixers,
                    anything you&apos;re hosting.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Builder inventory inclusion
                  </p>
                  <p className="text-gray-700 font-light leading-relaxed">
                    Builders and developers can have current inventory
                    featured in our weekly e-Blast to subscribers actively
                    shopping the market.
                  </p>
                </div>
              </div>
            </details>
          </div>

          {/* SOCIAL */}
          <div className="border border-gray-200 p-6 md:p-7 rounded-md">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                >
                  Social
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                Included with print packages
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed">
              Reach beyond our subscriber list through our highly engaged
              Facebook, Instagram, and LinkedIn audiences. Featured social
              shares, event-day coverage, and Facebook LIVE included in every
              print partnership.
            </p>
          </div>

          {/* E-BLASTS */}
          <div className="border border-gray-200 p-6 md:p-7 rounded-md">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                >
                  E-Blasts
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                From ${EBLAST_STARTING_PRICE}
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              Dedicated email sends to the subscriber list of your choice.
              Austin runs flat-rate; Newsline, Houston, and Dallas / FTW are
              CPM-priced for transparency.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Dedicated e-Blast
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Exclusive email to the preferred market subscriber list.
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  e-Blast Top Banner
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  600{'\u00d7'}200, top of every weekly e-Blast send.
                </p>
              </div>
            </div>
          </div>

          {/* MOBILE */}
          <div className="border border-gray-200 p-6 md:p-7 rounded-md">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <h3
                  className="font-serif text-xl text-gray-900 mt-1"
                >
                  Mobile web app
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-light italic shrink-0">
                From ${DIGITAL_STARTING_PRICE}/week
              </p>
            </div>
            <p className="text-sm text-gray-700 font-light leading-relaxed mb-4">
              {DIGITAL_SLOT_COUNT} premium placements across
              realtynewsnow.app {'\u2014'} feed banners, article leaderboards,
              sidebars, splash, push, and more. Self-serve checkout with live
              availability.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Web banners
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  728{'\u00d7'}90, 300{'\u00d7'}250, 300{'\u00d7'}600 {'\u00b7'}{' '}
                  article top, sidebar, mid-inline, bottom
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Feed cards
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  1080{'\u00d7'}600 native, every 6th feed card, marked
                  SPONSORED
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Splash / welcome
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  1080{'\u00d7'}1920 fullscreen, first session of the day
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Push notification sponsor
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Max 1 sponsored push per week {'\u00b7'} 256{'\u00d7'}256
                  icon
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Mobile sticky banner
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  320{'\u00d7'}50 / 320{'\u00d7'}100 persistent at bottom
                </p>
              </div>
              <div className="border border-gray-100 px-4 py-3 rounded-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-900">
                  Calendar event sponsor
                </p>
                <p className="text-xs text-gray-700 font-light mt-1">
                  Native pinned event card on /calendar with {'\u201c'}
                  Presented by{'\u201d'} tag
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <Link
                href="/advertise/placements"
                className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                See where every placement appears {'\u2192'}
              </Link>
              <Link
                href="/advertise/digital"
                className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                Browse all {DIGITAL_SLOT_COUNT} placements with live pricing{' '}
                {'\u2192'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-gray-200 my-12" />

      <section className="bg-gray-50 border-l-4 border-brand-700 px-6 py-6 md:px-8 md:py-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Request a media kit
        </p>
        <p className="text-base text-gray-700 leading-relaxed font-light mb-6">
          Tell us which publication, what your business does, and what
          you&apos;re hoping to accomplish. We&apos;ll send the current rates
          and a recommendation on which package fits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700 mb-2">
              RealtyLine {'\u2014'} Austin
            </p>
            <a
              href="mailto:hello@myrealtyline.com?subject=Media%20Kit%20Request%20%E2%80%94%20RealtyLine"
              className="text-base font-medium text-brand-700 underline underline-offset-2"
            >
              hello@myrealtyline.com
            </a>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700 mb-2">
              Newsline San Antonio {'\u2014'} San Antonio
            </p>
            <a
              href="mailto:hello@newslinesa.com?subject=Media%20Kit%20Request%20%E2%80%94%20Newsline"
              className="text-base font-medium text-brand-700 underline underline-offset-2"
            >
              hello@newslinesa.com
            </a>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 font-light">
          Not sure which publication fits? Email either address above and
          we&apos;ll route you to the right team.
        </p>
      </footer>
        </div>
    </main>
    </>
  );
}
