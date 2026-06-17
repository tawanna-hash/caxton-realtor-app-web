// /admin/ads/media-kit
//
// Live, on-screen Media Kit. Single source of truth: lib/media-kit.ts.
// Mirrors what the downloadable PDF (/admin/ads/media-kit/pdf) prints
// — print rate matrix, brand packages, digital ad slots, eblasts,
// print deadlines, audience stats, and policy notes — so sales can
// pitch from either format and never go out of sync.

import Link from 'next/link';
import {
  APP_AD_SLOTS,
  PACKAGES,
  EBLASTS,
  PRINT_DEADLINES,
  RATE_MATRIX,
  FREQ_LABELS,
  FREQ_TERMS,
  AUDIENCE_STATS,
  PUB_SUBSCRIBERS,
  POLICY_NOTES,
  MARKET_MULTIPLIERS,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
  type AppAdSlot,
  type Package,
  type EBlast,
} from '@/lib/media-kit';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Media Kit — Admin',
};

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  account: 'Account',
  newsletter: 'Newsletter',
  app: 'App-wide',
};

function fmtUSD(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return '$' + n.toLocaleString('en-US');
}

// ─── Sections ─────────────────────────────────────────────────────────────

function AudienceSection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Audience snapshot</h2>
      <p className="text-sm text-gray-700 mt-1">
        Network reach across all four RealtyLine + Newsline markets.
      </p>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        {AUDIENCE_STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-gray-50 ring-1 ring-gray-200 px-4 py-3"
          >
            <div className="text-2xl font-semibold text-gray-900">{s.value}</div>
            <div className="text-xs uppercase tracking-wide text-gray-700 mt-1">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-gray-900 mb-2">
          Subscribers by market
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PubStat label="RealtyLine Austin" sub={PUB_SUBSCRIBERS.realtyline} />
          <PubStat label="Newsline San Antonio" sub={PUB_SUBSCRIBERS.newsline} />
          <PubStat label="RealtyLine Houston" sub={PUB_SUBSCRIBERS['realtyline-houston']} />
          <PubStat label="RealtyLine Dallas / FTW" sub={PUB_SUBSCRIBERS['realtyline-dallas']} />
        </div>
      </div>
    </section>
  );
}

function PubStat({ label, sub }: { label: string; sub: number }) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-gray-200 px-4 py-3">
      <div className="text-base font-semibold text-gray-900">
        {sub.toLocaleString('en-US')}
      </div>
      <div className="text-xs text-gray-700 mt-1">{label}</div>
    </div>
  );
}

function RateMatrixSection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Print rate matrix</h2>
      <p className="text-sm text-gray-700 mt-1">
        Monthly print rates by size and frequency commitment. Rates locked when
        an agreement is signed in advance.
      </p>
      <div className="overflow-x-auto mt-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 font-medium">Size</th>
              {FREQ_LABELS.map((f, i) => (
                <th key={f} className="px-3 py-2 font-medium">
                  {f}
                  <span className="block text-xs text-gray-700 font-normal">
                    {FREQ_TERMS[i]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {Object.entries(RATE_MATRIX).map(([size, prices]) => (
              <tr key={size}>
                <td className="px-3 py-2 font-medium text-gray-900">{size}</td>
                {prices.map((p, i) => (
                  <td key={i} className="px-3 py-2 text-gray-900">
                    {fmtUSD(p)}
                    <span className="text-xs text-gray-700">/mo</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PackagesSection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Brand packages</h2>
      <p className="text-sm text-gray-700 mt-1">
        Five tiers from one-month to 12-month + premium. Discounts deepen with
        the agreement length.
      </p>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PACKAGES.map((p) => (
          <PackageCard key={p.id} pkg={p} />
        ))}
      </div>
    </section>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  return (
    <div
      className={
        'rounded-lg ring-1 p-4 ' +
        (pkg.premium
          ? 'bg-[#021D40] text-white ring-[#021D40]'
          : pkg.popular
            ? 'bg-orange-50 ring-orange-200'
            : 'bg-gray-50 ring-gray-200')
      }
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className={
              'text-base font-semibold ' +
              (pkg.premium ? 'text-white' : 'text-gray-900')
            }
          >
            {pkg.name}
          </div>
          <div
            className={
              'text-xs mt-0.5 ' + (pkg.premium ? 'text-white/80' : 'text-gray-700')
            }
          >
            {pkg.term}
          </div>
        </div>
        {pkg.popular && (
          <span className="rounded-full bg-orange-600 text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
            Most popular
          </span>
        )}
        {pkg.premium && (
          <span className="rounded-full bg-white text-[#021D40] text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
            Premium
          </span>
        )}
      </div>
      <p
        className={
          'text-sm mt-2 ' + (pkg.premium ? 'text-white/90' : 'text-gray-700')
        }
      >
        {pkg.tagline}
      </p>

      {pkg.sizes.length > 0 && (
        <div className="mt-3 space-y-1">
          {pkg.sizes.map((s) => (
            <div
              key={s.size}
              className={
                'flex items-baseline justify-between text-sm py-1 border-b ' +
                (pkg.premium ? 'border-white/20' : 'border-gray-200')
              }
            >
              <span
                className={
                  'font-medium ' + (pkg.premium ? 'text-white' : 'text-gray-900')
                }
              >
                {s.size}
                <span
                  className={
                    'block text-xs font-normal ' +
                    (pkg.premium ? 'text-white/70' : 'text-gray-700')
                  }
                >
                  {s.dim}
                </span>
              </span>
              <span
                className={
                  'tabular-nums font-semibold ' +
                  (pkg.premium ? 'text-white' : 'text-gray-900')
                }
              >
                {fmtUSD(s.price)}
                <span
                  className={
                    'text-xs font-normal ' +
                    (pkg.premium ? 'text-white/70' : 'text-gray-700')
                  }
                >
                  /mo
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <ul
        className={
          'mt-3 space-y-1 text-sm ' +
          (pkg.premium ? 'text-white/90' : 'text-gray-700')
        }
      >
        {pkg.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>{'\u2713'}</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DigitalSlotsSection() {
  const slots = APP_AD_SLOTS;
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Digital ad slots
          </h2>
          <p className="text-sm text-gray-700 mt-1">
            {slots.length} placements across the app. Weekly + monthly rates
            shown for 1 market; multi-market multipliers below.
          </p>
        </div>
        <Link
          href="/admin/ads/placements"
          className="text-sm text-blue-700 hover:underline"
        >
          View wireframes {'\u2192'}
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 font-medium">Slot</th>
              <th className="px-3 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium text-right">Weekly (1 mkt)</th>
              <th className="px-3 py-2 font-medium text-right">Monthly (1 mkt)</th>
              <th className="px-3 py-2 font-medium">Sizes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {slots.map((s) => (
              <tr key={s.slug}>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-gray-900">{s.name}</div>
                  <div className="text-xs text-gray-700 mt-0.5">{s.notes}</div>
                </td>
                <td className="px-3 py-2 align-top text-gray-900">
                  {ZONE_LABEL[s.zone]}
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ' +
                      (s.tier === 'premium'
                        ? 'bg-amber-50 text-amber-900 ring-amber-200'
                        : 'bg-gray-50 text-gray-700 ring-gray-200')
                    }
                  >
                    {s.tier}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-right tabular-nums text-gray-900">
                  {fmtUSD(s.weeklySingle)}
                  {s.pricingUnit && (
                    <span className="block text-[10px] text-gray-700 font-normal">
                      {s.pricingUnit}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right tabular-nums text-gray-900">
                  {fmtUSD(s.monthlySingle)}
                </td>
                <td className="px-3 py-2 align-top text-gray-700 text-xs">
                  {s.sizes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium text-gray-900 mb-2">
          Multi-market bundle multipliers
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([1, 2, 3, 4] as const).map((n) => (
            <div
              key={n}
              className="rounded-lg bg-gray-50 ring-1 ring-gray-200 px-4 py-3"
            >
              <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                {MARKET_MULTIPLIERS[n].toFixed(1)}
                {'\u00D7'}
              </div>
              <div className="text-xs text-gray-700 mt-1">
                {n} market{n === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExampleBundle />
    </section>
  );
}

function ExampleBundle() {
  // Featured Builder Strip is index 0 (premium tier showcase).
  const slot = APP_AD_SLOTS[0];
  const rows = ([1, 2, 3, 4] as const).map((n) => ({
    n,
    weekly: weeklyRateForMarkets(slot, n),
    monthly: monthlyRateForMarkets(slot, n),
  }));
  return (
    <div className="mt-4 rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4">
      <div className="text-sm font-medium text-gray-900">
        Example: {slot.name}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        {rows.map((r) => (
          <div key={r.n} className="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <div className="text-xs text-gray-700 uppercase tracking-wide">
              {r.n} mkt{r.n === 1 ? '' : 's'}
            </div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums mt-1">
              {fmtUSD(r.weekly)}
              <span className="text-xs text-gray-700 font-normal">/wk</span>
            </div>
            <div className="text-xs text-gray-700 tabular-nums">
              {fmtUSD(r.monthly)}/mo
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EblastsSection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">e-Blast packages</h2>
      <p className="text-sm text-gray-700 mt-1">
        Per-market pricing. Austin (Pkg 1 + 2) is flat-rate; Newsline / Houston
        / Dallas are CPM-priced at the rates shown.
      </p>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {EBLASTS.map((b) => (
          <EblastCard key={b.name} blast={b} />
        ))}
      </div>
    </section>
  );
}

function EblastCard({ blast }: { blast: EBlast }) {
  const rows: Array<{ label: string; price: number; sends: number }> = [];
  const allPubs: Array<['realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas', string]> = [
    ['realtyline', 'Austin (RealtyLine)'],
    ['newsline', 'Newsline San Antonio'],
    ['realtyline-houston', 'Houston'],
    ['realtyline-dallas', 'Dallas / FTW'],
  ];
  for (const [pub, label] of allPubs) {
    if (blast.availablePubs && !blast.availablePubs.includes(pub)) continue;
    rows.push({
      label,
      price: blast.priceByPub?.[pub] ?? blast.price,
      sends: blast.sendsByPub?.[pub] ?? blast.sends,
    });
  }
  return (
    <div className="rounded-lg bg-gray-50 ring-1 ring-gray-200 p-4">
      <div className="text-base font-semibold text-gray-900">{blast.name}</div>
      <ul className="mt-2 space-y-1 text-sm text-gray-700">
        {blast.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>{'\u2713'}</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between text-sm border-b border-gray-200 py-1.5"
          >
            <span className="text-gray-900">
              {r.label}
              <span className="text-xs text-gray-700 ml-1">
                ({r.sends} send{r.sends === 1 ? '' : 's'})
              </span>
            </span>
            <span className="font-semibold tabular-nums text-gray-900">
              {fmtUSD(r.price)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeadlinesSection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">
        2026 print deadlines
      </h2>
      <p className="text-sm text-gray-700 mt-1">
        Camera-ready artwork due by the deadline; issues mail on the listed
        date.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Ad deadline</th>
              <th className="px-3 py-2 font-medium">Mail date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {PRINT_DEADLINES.map((d) => (
              <tr key={d.month}>
                <td className="px-3 py-2 font-medium text-gray-900">{d.month}</td>
                <td className="px-3 py-2 text-gray-900">{d.deadline}</td>
                <td className="px-3 py-2 text-gray-900">{d.mail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PolicySection() {
  return (
    <section className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Policy notes</h2>
      <div className="mt-4 space-y-3">
        {POLICY_NOTES.map((n) => (
          <div
            key={n.title}
            className="rounded-lg border-l-4 bg-gray-50 ring-1 ring-gray-200 p-4"
            style={{ borderLeftColor: n.color }}
          >
            <div className="text-sm font-semibold text-gray-900">{n.title}</div>
            <p className="text-sm text-gray-700 mt-1">{n.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function MediaKitPage() {
  return (
    <div className="p-6 bg-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide">
            <Link href="/admin/ads" className="hover:underline">
              Ads
            </Link>
            <span className="mx-2" aria-hidden>
              {'\u203A'}
            </span>
            Media Kit
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">
            2026 Media Kit
          </h1>
          <p className="text-sm uppercase tracking-[0.18em] text-gray-700 font-semibold mt-2">
            Print {'\u00b7'} Digital {'\u00b7'} Social {'\u00b7'} Mobile.{' '}
            <span className="text-gray-500 font-normal normal-case tracking-normal">
              One powerful marketing platform.
            </span>
          </p>
          <p className="text-sm text-gray-700 mt-2 max-w-2xl">
            One source of truth for print rates, digital placements, e-blasts,
            and policy. Numbers shown match the PDF media kit and the checkout
            quote engine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ads"
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Back to hub
          </Link>
          <a
            href="/admin/ads/media-kit/pdf"
            className="rounded-md bg-[#021D40] px-4 py-2 text-white text-sm font-medium hover:bg-[#03285a]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download PDF
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <AudienceSection />
        <RateMatrixSection />
        <PackagesSection />
        <DigitalSlotsSection />
        <EblastsSection />
        <DeadlinesSection />
        <PolicySection />
      </div>
    </div>
  );
}
