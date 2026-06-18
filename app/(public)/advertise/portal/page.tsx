// app/(public)/advertise/portal/page.tsx
//
// Self-Service Portal landing — public-facing hub.
//   Single path: Self-Service (Browse Products) → /advertise/placements
//
// Below the hub we surface the bundle-savings ladder (1.7× / 2.4× / 3×) so
// advertisers see the multi-market savings story before clicking through,
// per advertise_digital_audit.md Direction A. We also include a small
// "Already booked with us?" callout pointing existing advertisers to
// /portal (the magic-link advertiser portal where they see their files,
// agreements, invoices, and the new order history page).
//
// Reuses MARKET_MULTIPLIERS from lib/media-kit.ts so the ladder shown to
// buyers is always exactly what checkout applies. No new pricing logic.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { APP_AD_SLOTS, MARKET_MULTIPLIERS, weeklyRateForMarkets } from '@/lib/media-kit';

export const metadata = {
  title: 'Self-Service Portal \u2014 Realty News Now',
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

// Bundle ladder market labels. The ladder math is cumulative (e.g. 1.7x = a
// bundle of two markets), so each label represents the incremental market
// added at that tier. Houston + DFW are coming soon - shown italic.
const MARKET_LABELS: Record<1 | 2 | 3 | 4, { name: string; comingSoon: boolean }> = {
  1: { name: 'RealtyLine Austin', comingSoon: false },
  2: { name: 'Newsline San Antonio', comingSoon: false },
  3: { name: 'RealtyLine Houston', comingSoon: true },
  4: { name: 'RealtyLine Dallas/Ft. Worth', comingSoon: true },
};

// Pick a representative slot for the bundle-savings ladder. We use the
// median-priced standard slot so the savings math reads as realistic.
function representativeSlot() {
  const sorted = [...APP_AD_SLOTS]
    .filter((s) => s.weeklySingle > 0 && s.tier === 'standard')
    .sort((a, b) => a.weeklySingle - b.weeklySingle);
  return sorted[Math.floor(sorted.length / 2)] ?? APP_AD_SLOTS[0];
}

export default function SelfServicePortalPage() {
  const minPrice = lowestWeekly();
  const maxPrice = highestWeekly();
  const sample = representativeSlot();
  const baseRate = sample.weeklySingle;

  // Bundle ladder rows derived from MARKET_MULTIPLIERS so what we show is
  // exactly what checkout charges. Savings = (markets * 1.0) \u2212 multiplier,
  // expressed as a percent off "buying each market separately".
  const ladder = ([1, 2, 3, 4] as const).map((markets) => {
    const total = weeklyRateForMarkets(sample, markets);
    const separately = baseRate * markets;
    const savingsPct = markets === 1 ? 0 : Math.round(((separately - total) / separately) * 100);
    return { markets, total, separately, savingsPct };
  });

  return (
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

        {/* Two-path hub */}
        <section className="grid gap-5 md:grid-cols-2 mb-12">
          {/* Self-service card */}
          <article className="relative rounded-md overflow-hidden bg-gradient-to-br from-[#3d0740] via-[#3d0740] to-[#5a0e5f] text-white p-7 md:p-8 shadow-lg">
            {/* From-$X chip */}
            <span className="absolute top-5 right-5 inline-flex items-center px-3 py-1 rounded-full bg-violet-200/90 text-violet-900 text-xs font-semibold">
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
              Self-Service Portal
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
              className="inline-flex items-center gap-2 bg-violet-200 hover:bg-violet-100 active:scale-[0.98] transition text-[#3d0740] font-semibold px-5 py-3 rounded-full text-sm md:text-base"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Browse Products
              <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                <path fill="currentColor" d="M10.293 4.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 1 1 0-2h9.586l-3.293-3.293a1 1 0 0 1 0-1.414Z" />
              </svg>
            </Link>
          </article>

        </section>

        {/* Bundle savings ladder \u2014 directly tied to MARKET_MULTIPLIERS */}
        <section className="mb-12 rounded-md border border-emerald-200 bg-emerald-50/60 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-800 font-semibold mb-1.5">
                Bundle &amp; save
              </p>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight text-gray-900">
                Buy more markets, pay less per market
              </h3>
              <p className="text-sm text-gray-700 font-light mt-1.5 max-w-2xl">
                Every placement scales down per market the more markets you
                buy. Below is a real example using our {sample.name}{' '}
                slot (${baseRate}/wk single market).
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ladder.map((row) => {
              // No card is pre-highlighted — buyer chooses their own bundle size.
              const isWinner = false;
              return (
                <div
                  key={row.markets}
                  className={[
                    'rounded-md p-4 border',
                    isWinner
                      ? 'border-emerald-500 bg-white shadow-md'
                      : 'border-emerald-200 bg-white',
                  ].join(' ')}
                >
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium leading-tight min-h-[2.2em]">
                    {MARKET_LABELS[row.markets].name}
                    {MARKET_LABELS[row.markets].comingSoon && (
                      <>
                        {' '}
                        <em className="not-italic text-gray-400 normal-case tracking-normal">(coming soon)</em>
                      </>
                    )}
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 tabular-nums">
                    ${row.total.toLocaleString()}
                    <span className="text-sm font-normal text-gray-500">/wk</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {row.savingsPct > 0 ? (
                      <>
                        <span className="font-semibold text-emerald-700">
                          {row.savingsPct}% off
                        </span>
                        <span className="text-gray-400"> vs ${row.separately.toLocaleString()}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">Base rate</span>
                    )}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">
                    {MARKET_MULTIPLIERS[row.markets].toFixed(1)}{'\u00d7'} base
                  </p>
                </div>
              );
            })}
          </div>
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
                <div className="w-7 h-7 rounded-full bg-[#021D40] text-white text-sm font-semibold flex items-center justify-center mb-3">
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
              Sign in to your advertiser portal to view orders, files, invoices,
              and active agreements.
            </p>
          </div>
          <Link
            href="/portal"
            className="shrink-0 inline-flex items-center gap-2 border border-[#021D40] text-[#021D40] hover:bg-[#021D40] hover:text-white transition font-semibold px-5 py-2.5 rounded-full text-sm"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Open advertiser portal
            <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
              <path fill="currentColor" d="M10.293 4.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 1 1 0-2h9.586l-3.293-3.293a1 1 0 0 1 0-1.414Z" />
            </svg>
          </Link>
        </section>
      </div>
    </main>
  );
}
