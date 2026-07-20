'use client';

// app/admin/ads/media-kit/MediaKitClient.tsx
//
// Live, on-screen Media Kit. Single source of truth: lib/media-kit.ts.
// Publication tabs let sales pitch by market. Houston + Dallas render
// as disabled "Launching Soon" pills matching the public checkout.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import {
  APP_AD_SLOTS,
  PACKAGES,
  EBLASTS,
  PRINT_DEADLINES,
  RATE_MATRIX,
  FREQ_LABELS,
  FREQ_TERMS,
  AUDIENCE_STATS_BY_PUB,
  EXPANSION_PUBS,
  isLive,
  isLaunchingSoon,
  isEblastAvailableForPub,
  getSlotAvailablePubs,
  PUB_SUBSCRIBERS,
  POLICY_NOTES,
  MARKET_MULTIPLIERS,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
  type AppAdSlot,
  type Package,
  type EBlast,
  type MediaKitPub,
} from '@/lib/media-kit';

type PubTab = {
  id: 'austin' | 'san-antonio' | 'houston' | 'dallas';
  label: string;
  mediaKitPub: MediaKitPub;
  hasPrint: boolean;
};

const PUB_TABS: PubTab[] = [
  { id: 'austin',      label: 'RealtyLine Austin',      mediaKitPub: 'realtyline',         hasPrint: true  },
  { id: 'san-antonio', label: 'Newsline San Antonio',   mediaKitPub: 'newsline',           hasPrint: true  },
  { id: 'houston',     label: 'RealtyLine Houston',     mediaKitPub: 'realtyline-houston', hasPrint: false },
  { id: 'dallas',      label: 'RealtyLine Dallas/FTW',  mediaKitPub: 'realtyline-dallas',  hasPrint: false },
];

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

export default function MediaKitClient() {
  const [activePubId, setActivePubId] = useState<PubTab['id']>('austin');
  const activePub = PUB_TABS.find((p) => p.id === activePubId) ?? PUB_TABS[0]!;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4">
        <PageTitle size="md">Media Kit — 2026</PageTitle>
        <p className="text-sm text-gray-700 mt-1">
          Reference sheet for sales. Packages, ad rates, e-blasts, print
          deadlines, and contract policies. Rates match the Sign Wizard and
          the generated agreement PDF.
        </p>
      </div>

      <PubTabs active={activePubId} onChange={setActivePubId} />

      <div className="space-y-4 mt-6">
        <AudienceSection activePub={activePub} />
        <ExpansionSection />
        {activePub.hasPrint && <RateMatrixSection />}
        {activePub.hasPrint && <PackagesSection />}
        <DigitalSlotsSection activePub={activePub} />
        <EblastsSection activePub={activePub} />
        {activePub.hasPrint && <DeadlinesSection />}
        <PolicySection />
      </div>
    </div>
  );
}

function PubTabs({ active, onChange }: { active: PubTab['id']; onChange: (id: PubTab['id']) => void }) {
  return (
    <div role="tablist" aria-label="Select publication" className="flex flex-wrap gap-x-1 gap-y-2 border-b border-gray-200">
      {PUB_TABS.map((t) => {
        const isActive = t.id === active;
        const soon = isLaunchingSoon(t.mediaKitPub);
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-disabled={soon}
            disabled={soon}
            onClick={() => !soon && onChange(t.id)}
            className={
              'inline-flex items-center gap-2 -mb-px px-3 py-2 text-sm border-b-2 transition-colors ' +
              (isActive
                ? 'border-brand-700 text-brand-800 font-semibold'
                : soon
                  ? 'border-transparent text-gray-400 cursor-not-allowed'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300')
            }
            title={soon ? `${t.label} is launching soon` : undefined}
          >
            <span>{t.label}</span>
            {soon && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800">
                Launching Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AudienceSection({ activePub }: { activePub: PubTab }) {
  const pubStats = AUDIENCE_STATS_BY_PUB.find((p) => p.pub === activePub.mediaKitPub);
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">Print & Email Snapshot</div>
        <h2 className="text-lg font-semibold text-gray-900 mt-1">Our Reach by the Numbers</h2>
        <p className="text-sm text-gray-700 mt-1">Verified human engagement — Apple MPP and bot activity filtered from all open-rate reporting since June 2024.</p>
      </div>
      {pubStats ? (
        <div className="rounded-md bg-gray-50 ring-1 ring-gray-200 p-5">
          <div className="text-base font-semibold text-gray-900 mb-3">{pubStats.name}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {pubStats.stats.map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-semibold text-brand-700 leading-tight">{s.value}</div>
                <div className="text-xs text-gray-700 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-5 text-sm text-amber-900">
          Audience stats for {activePub.label} will be published closer to launch.
        </div>
      )}
      <div className="mt-6">
        <div className="text-sm font-medium text-gray-900 mb-2">Subscribers by market</div>
        <div className="grid grid-cols-2 gap-3">
          <PubStat label="RealtyLine Austin" sub={PUB_SUBSCRIBERS.realtyline} />
          <PubStat label="Newsline San Antonio" sub={PUB_SUBSCRIBERS.newsline} />
        </div>
      </div>
    </section>
  );
}

function PubStat({ label, sub }: { label: string; sub: number }) {
  return (
    <div className="rounded-md bg-white ring-1 ring-gray-200 px-4 py-3">
      <div className="text-base font-semibold text-gray-900">{sub.toLocaleString('en-US')}</div>
      <div className="text-xs text-gray-700 mt-1">{label}</div>
    </div>
  );
}

function ExpansionSection() {
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">Growing the Network</div>
        <h2 className="text-lg font-semibold text-gray-900 mt-1">Expanding Across Texas</h2>
        <p className="text-sm text-gray-700 mt-1">Reach real estate professionals wherever business happens.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {EXPANSION_PUBS.map((p) => (
          <div key={p.name} className="rounded-md bg-gray-50 ring-1 ring-gray-200 p-4 flex flex-col">
            <div className="text-base font-semibold text-gray-900">{p.name}</div>
            <div className="text-xs text-gray-700 mt-1">{p.channels}</div>
            <div className="mt-auto pt-3">
              <span className={'inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' + (p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
                {p.status === 'active' ? 'Active' : 'Launching Soon'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RateMatrixSection() {
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Print rate matrix</h2>
      <p className="text-sm text-gray-700 mt-1">Monthly print rates by size and frequency commitment. Rates locked when an agreement is signed in advance.</p>
      <div className="overflow-x-auto mt-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-700">
              <th className="px-3 py-2 font-medium">Size</th>
              {FREQ_LABELS.map((f, i) => (
                <th key={f} className="px-3 py-2 font-medium">
                  {f}
                  <span className="block text-xs text-gray-700 font-normal">{FREQ_TERMS[i]}</span>
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
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Brand packages</h2>
      <p className="text-sm text-gray-700 mt-1">Five tiers from one-month to 12-month + premium. Discounts deepen with the agreement length.</p>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PACKAGES.map((p) => (<PackageCard key={p.id} pkg={p} />))}
      </div>
    </section>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  return (
    <div className={'rounded-md ring-1 p-4 ' + (pkg.premium ? 'bg-brand-700 text-white ring-brand-700' : pkg.popular ? 'bg-orange-50 ring-orange-200' : 'bg-gray-50 ring-gray-200')}>
      <div className="flex items-start justify-between">
        <div>
          <div className={'text-xs font-semibold uppercase tracking-wider ' + (pkg.premium ? 'text-white/80' : 'text-gray-700')}>{pkg.tagline}</div>
          <div className={'text-lg font-semibold mt-1 ' + (pkg.premium ? 'text-white' : 'text-gray-900')}>{pkg.name}</div>
        </div>
        {pkg.popular && !pkg.premium && (
          <span className="inline-block rounded bg-orange-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-900">Most Popular</span>
        )}
      </div>
      <ul className={'mt-3 space-y-1 text-sm ' + (pkg.premium ? 'text-white/90' : 'text-gray-700')}>
        {pkg.features.map((b) => (
          <li key={b} className="flex gap-2">
            <span aria-hidden>{'\u2713'}</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DigitalSlotsSection({ activePub }: { activePub: PubTab }) {
  const slots = useMemo(
    () => APP_AD_SLOTS.filter((s) => getSlotAvailablePubs(s).includes(activePub.mediaKitPub)),
    [activePub.mediaKitPub],
  );
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Digital ad slots</h2>
          <p className="text-sm text-gray-700 mt-1">
            {slots.length} placement{slots.length === 1 ? '' : 's'} available on {activePub.label}. Weekly + monthly rates shown for 1 market; multi-market multipliers below.
          </p>
        </div>
        <Link href="/admin/ads/placements" className="text-sm text-blue-700 hover:underline">View wireframes {'\u2192'}</Link>
      </div>
      {slots.length === 0 ? (
        <div className="mt-4 rounded-md bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900">No digital placements are configured for {activePub.label} yet.</div>
      ) : (
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
                  <td className="px-3 py-2 align-top text-gray-900">{ZONE_LABEL[s.zone]}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ' + (s.tier === 'premium' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-gray-50 text-gray-700 ring-gray-200')}>
                      {s.tier}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-gray-900">
                    {fmtUSD(s.weeklySingle)}
                    {s.pricingUnit && (<span className="block text-[10px] text-gray-700 font-normal">{s.pricingUnit}</span>)}
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-gray-900">{fmtUSD(s.monthlySingle)}</td>
                  <td className="px-3 py-2 align-top text-gray-700 text-xs">{s.sizes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5">
        <div className="text-sm font-medium text-gray-900 mb-2">Multi-market bundle multipliers</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([1, 2, 3, 4] as const).map((n) => (
            <div key={n} className="rounded-md bg-gray-50 ring-1 ring-gray-200 px-4 py-3">
              <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                {MARKET_MULTIPLIERS[n].toFixed(1)}{'\u00D7'}
              </div>
              <div className="text-xs text-gray-700 mt-1">{n} market{n === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </div>
      {slots.length > 0 && <ExampleBundle firstSlot={slots[0]!} />}
    </section>
  );
}

function ExampleBundle({ firstSlot }: { firstSlot: AppAdSlot }) {
  const rows = ([1, 2, 3, 4] as const).map((n) => ({
    n,
    weekly: weeklyRateForMarkets(firstSlot, n),
    monthly: monthlyRateForMarkets(firstSlot, n),
  }));
  return (
    <div className="mt-4 rounded-md bg-gray-50 ring-1 ring-gray-200 p-4">
      <div className="text-sm font-medium text-gray-900">Example: {firstSlot.name}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        {rows.map((r) => (
          <div key={r.n} className="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <div className="text-xs text-gray-700 uppercase tracking-wide">{r.n} mkt{r.n === 1 ? '' : 's'}</div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums mt-1">
              {fmtUSD(r.weekly)}
              <span className="text-xs text-gray-700 font-normal">/wk</span>
            </div>
            <div className="text-xs text-gray-700 tabular-nums">{fmtUSD(r.monthly)}/mo</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EblastsSection({ activePub }: { activePub: PubTab }) {
  const blasts = useMemo(
    () => EBLASTS.filter((b) => isEblastAvailableForPub(b, activePub.mediaKitPub)),
    [activePub.mediaKitPub],
  );
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">e-Blast packages</h2>
      <p className="text-sm text-gray-700 mt-1">Pricing shown for {activePub.label}. Austin (Pkg 1 + 2) is flat-rate; Newsline / Houston / Dallas are CPM-priced.</p>
      {blasts.length === 0 ? (
        <div className="mt-4 rounded-md bg-amber-50 ring-1 ring-amber-200 p-4 text-sm text-amber-900">No e-blast packages are available on {activePub.label} yet.</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {blasts.map((b) => (<EblastCard key={b.name} blast={b} activePub={activePub} />))}
        </div>
      )}
    </section>
  );
}

function EblastCard({ blast, activePub }: { blast: EBlast; activePub: PubTab }) {
  const pub = activePub.mediaKitPub;
  if (!isLive(pub)) return null;
  const price = blast.priceByPub?.[pub] ?? blast.price;
  const sends = blast.sendsByPub?.[pub] ?? blast.sends;
  const features = blast.featuresByPub?.[pub] ?? blast.features;
  return (
    <div className="rounded-md bg-gray-50 ring-1 ring-gray-200 p-4">
      <div className="text-base font-semibold text-gray-900">{blast.name}</div>
      <ul className="mt-2 space-y-1 text-sm text-gray-700">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden>{'\u2713'}</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between text-sm border-t border-gray-200 pt-3">
        <span className="text-gray-900">
          {activePub.label}
          <span className="text-xs text-gray-700 ml-1">({sends} send{sends === 1 ? '' : 's'})</span>
        </span>
        <span className="font-semibold tabular-nums text-gray-900">{fmtUSD(price)}</span>
      </div>
    </div>
  );
}

function DeadlinesSection() {
  return (
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">2026 print deadlines</h2>
      <p className="text-sm text-gray-700 mt-1">Camera-ready artwork due by the deadline; issues mail on the listed date.</p>
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
                <td className="px-3 py-2 text-gray-900">{d.adDeadline}</td>
                <td className="px-3 py-2 text-gray-900">{d.mailDate}</td>
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
    <section className="rounded-md bg-white ring-1 ring-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Policy</h2>
      <div className="mt-4 space-y-3">
        {POLICY_NOTES.map((n) => (
          <div key={n.title} className="rounded-md ring-1 p-4" style={{ borderColor: n.color, boxShadow: `inset 4px 0 0 0 ${n.color}` }}>
            <div className="text-sm font-semibold text-gray-900">{n.title}</div>
            <p className="text-sm text-gray-700 mt-1">{n.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
