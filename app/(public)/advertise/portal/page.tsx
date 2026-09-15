// app/(public)/advertise/portal/page.tsx
//
// App & Web Placements landing — public-facing hub for digital placements
// and e-Blast ordering.
//
// Includes an "Already booked with us?" callout pointing existing advertisers to
// /portal (the magic-link advertiser portal where they see their files,
// agreements, invoices, and the new order history page).

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import TrackPageView from '@/components/analytics/TrackPageView';
import { APP_AD_SLOTS, EBLASTS } from '@/lib/media-kit';

export const metadata = {
  title: 'App & Web Placements \u2014 Realty News Now',
  description:
    'Buy ad placements directly on Realty News Now. 16 digital ad formats from $125/week, pick your market and dates, no sales call required \u2014 go live in as few as 2 business days.',
};

// Lowest weekly price across the catalog \u2014 used as the "From $125" pill.
function lowestWeekly(): number {
  const prices = APP_AD_SLOTS.map((s) => s.weeklySingle).filter((n) => n > 0);
  return prices.length > 0 ? Math.min(...prices) : 125;
}

// Highest weekly price (single-market) \u2014 used in "$125\u2013$X" copy on the card.
function highestWeekly(): number {
  const prices = APP_AD_SLOTS.map((s) => s.weeklySingle).filter((n) => n > 0);
  return prices.length > 0 ? Math.max(...prices) : 500;
}

export default function SelfServicePortalPage() {
  const minPrice = lowestWeekly();
  const maxPrice = highestWeekly();
  const eblastStartingPrice = Math.min(
    ...EBLASTS.flatMap((pkg) => [
      pkg.priceByPub?.realtyline ?? pkg.price,
      pkg.priceByPub?.newsline ?? pkg.price,
    ]),
  );

  return (
    <>
      <TrackPageView event="advertise_portal_page_viewed" />
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-700 font-semibold mb-3">
            Two ways to work with us
          </p>
          <PageTitle size="md">Choose your path</PageTitle>
          <p className="text-base md:text-lg text-gray-700 font-light leading-relaxed max-w-2xl mx-auto mt-3">
            Whether you want to buy an ad in minutes or build a custom
            multi-market campaign, we&apos;ve got you covered.
          </p>
        </header>

        {/* Product paths */}
        <section className="grid gap-5 md:grid-cols-2 mb-12">
          {/* App and web placements card */}
          <article className="relative rounded-md overflow-hidden bg-gradient-to-br from-[#301D5D] via-[#301D5D] to-[#5a0e5f] text-white p-7 md:p-8 shadow-lg">
            {/* From-$X chip */}
            <span className="absolute top-5 right-5 inline-flex items-center rounded-md bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">
              From ${minPrice}
            </span>

            {/* Cart icon */}
            <div className="w-12 h-12 rounded-md bg-white/10 flex items-center justify-center mb-6">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              App &amp; Web Placements
            </h2>
            <p className="text-violet-100/90 text-sm md:text-base font-light leading-relaxed mb-6">
              Buy ad placements directly, choose your market + go live in as
              few as 2 business days. No sales call required.
            </p>

            <ul className="space-y-2.5 mb-7 text-sm md:text-[15px]">
              {[
                'Instant checkout \u2014 no call needed',
                `${APP_AD_SLOTS.length} ad formats from $${minPrice}\u2013$${maxPrice.toLocaleString()}/wk`,
                'Pick your market + preferred dates',
                'Bundle and save',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500/90 flex items-center justify-center mt-0.5">
                    <svg viewBox="0 0 20 20" className="w-3 h-3 text-white" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="m8.227 13.227-3.182-3.182 1.414-1.414 1.768 1.768 5.293-5.293 1.414 1.414-6.707 6.707Z"
                      />
                    </svg>
                  </span>
                  <span className="text-violet-50">{line}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/advertise/placements"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 active:scale-[0.98] md:text-base"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Browse Products
              <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                <path fill="currentColor" d="M10.293 4.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 1 1 0-2h9.586l-3.293-3.293a1 1 0 0 1 0-1.414Z" />
              </svg>
            </Link>
          </article>

          <article className="relative overflow-hidden rounded-md bg-gradient-to-br from-[#301D5D] via-[#301D5D] to-[#5a0e5f] p-7 text-white shadow-lg md:p-8">
            <span className="absolute right-5 top-5 inline-flex items-center rounded-md bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">
              From ${eblastStartingPrice.toLocaleString()}
            </span>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-white">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
              e-Blast Ordering
            </h2>
            <p className="mb-6 text-sm font-light leading-relaxed text-violet-100/90 md:text-base">
              Reach RealtyLine Austin, Newsline San Antonio, or both audiences
              with a dedicated email campaign.
            </p>
            <ul className="mb-7 space-y-2.5 text-sm md:text-[15px]">
              {[
                'Choose your audience and package',
                'Request preferred send dates',
                'Upload creative now or provide it later',
                'Pay securely by card or eligible bank account',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/90">
                    <svg viewBox="0 0 20 20" className="h-3 w-3 text-white" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="m8.227 13.227-3.182-3.182 1.414-1.414 1.768 1.768 5.293-5.293 1.414 1.414-6.707 6.707Z"
                      />
                    </svg>
                  </span>
                  <span className="text-violet-50">{line}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/advertise/eblast"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 active:scale-[0.98] md:text-base"
            >
              Order an e-Blast
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path fill="currentColor" d="M10.293 4.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 1 1 0-2h9.586l-3.293-3.293a1 1 0 0 1 0-1.414Z" />
              </svg>
            </Link>
          </article>

        </section>

        {/* How it works \u2014 three-step compressed timeline */}
        <section className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-4 text-center">
            How self-service works
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Browse products',
                body: 'See every ad slot with a wireframe of exactly where it appears in the app or newsletter.',
              },
              {
                step: '2',
                title: 'Pick market + dates',
                body: 'Choose one or more markets (Austin, San Antonio, Houston, Dallas), set your run dates, upload your creative.',
              },
              {
                step: '3',
                title: 'Go live in 2 days',
                body: 'Pay by card, our team reviews creative, and your ad goes live within 2 business days.',
              },
            ].map((it) => (
              <div
                key={it.step}
                className="rounded-md border border-gray-200 bg-white p-5"
              >
                <div className="w-7 h-7 rounded-full bg-brand-700 text-white text-sm font-semibold flex items-center justify-center mb-3">
                  {it.step}
                </div>
                <h4 className="text-base font-semibold text-gray-900 mb-1.5">
                  {it.title}
                </h4>
                <p className="text-sm text-gray-600 font-light leading-relaxed">
                  {it.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Existing advertiser sign-in callout */}
        <section className="rounded-md border border-gray-200 bg-white p-6 md:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-1">
              Already booked with us?
            </p>
            <p className="text-base text-gray-900 font-medium">
              Sign in to your partner portal to view orders, files, invoices,
              and active agreements.
            </p>
          </div>
          <a
            href="/portal"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-brand-700 px-5 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-700 hover:text-white"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Open partner portal
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <path fill="currentColor" d="M10.293 4.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 1 1 0-2h9.586l-3.293-3.293a1 1 0 0 1 0-1.414Z" />
            </svg>
          </a>
        </section>
      </div>
    </main>
    </>
  );
}
