'use client';

// app/admin/media-kit/MediaKitClient.tsx
//
// 2026 Media Kit reference page. Pulls all data from lib/media-kit.ts so
// rates here always match what the Sign Wizard / agreement PDF use.

import { useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  PACKAGES,
  EBLASTS,
  PRINT_DEADLINES,
  RATE_MATRIX,
  FREQ_LABELS,
  FREQ_TERMS,
  BRAND_12_PLUS_RATE,
  AUDIENCE_STATS,
  POLICY_NOTES,
  APP_AD_SLOTS,
  APP_AD_AUDIENCE_NOTE,
  getSlotAvailablePubs,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
  MARKET_MULTIPLIERS,
  PUB_SUBSCRIBERS,
  eblastPriceForPub,
  eblastSendsForPub,
  eblastFeaturesForPub,
  isEblastAvailableForPub,
  type Package,
  type EBlast,
  type AppAdSlot,
  type MediaKitPub,
  type MarketCount,
} from '@/lib/media-kit';

// Publication tabs. The Media Kit page is a single source of truth for every
// publication; tabs scope which sections are visible:
//   - RealtyLine Austin & Newsline San Antonio -> Print + Digital + Email (all sections)
//   - RealtyLine Houston & Dallas  -> Digital + Email only (no print packages,
//     rate matrix, or print deadlines)
// Houston/Dallas inherit the same digital + e-blast rate card as Austin
// (Phase 2 PR D).
type PubTab = {
  id: 'austin' | 'newsline' | 'houston' | 'dallas';
  label: string;
  /** Matching MediaKitPub used by getSlotAvailablePubs(). */
  mediaKitPub: MediaKitPub;
  /** True when this publication actually runs a print magazine. */
  hasPrint: boolean;
  /** Short channel-mix descriptor shown under each tab label. */
  channels: string;
};

const PUB_TABS: PubTab[] = [
  { id: 'austin',   label: 'RealtyLine Austin',  mediaKitPub: 'realtyline',         hasPrint: true,  channels: 'Print, Digital, Email' },
  { id: 'newsline', label: 'Newsline San Antonio',           mediaKitPub: 'newsline',           hasPrint: true,  channels: 'Print, Digital, Email' },
  { id: 'houston',  label: 'RealtyLine Houston', mediaKitPub: 'realtyline-houston', hasPrint: false, channels: 'Digital, Email' },
  { id: 'dallas',   label: 'RealtyLine Dallas/FTW',  mediaKitPub: 'realtyline-dallas',  hasPrint: false, channels: 'Digital, Email' },
];

const ACCENT = '#dc2626';
const PREMIUM = '#3D0740';
const NAVY = '#021D40';
const GOLD = '#c2410c';

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  newsletter: 'Newsletter',
  account: 'Account',
  app: 'App',
};

const fmt = (n: number) => '$' + n.toLocaleString();

// ── Section heading (red bar + Georgia serif title) ───────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-7 rounded-md flex-shrink-0" style={{ background: ACCENT }} />
      <h2 className="text-xl text-gray-900 m-0">
        {children}
      </h2>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
      {children}
    </div>
  );
}

// ── Package card ───────────────────────────────────────────────────────────

function PackageCard({ pkg }: { pkg: Package }) {
  const isPopular = !!pkg.popular;
  const isPremium = !!pkg.premium;
  const topBorder = isPopular ? `border-t-4` : '';
  const topBorderStyle = isPopular ? { borderTopColor: ACCENT } : undefined;

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-md flex flex-col shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all ${topBorder}`}
      style={topBorderStyle}
    >
      {(isPopular || isPremium) && (
        <span
          className="absolute -top-3 right-4 text-white text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm"
          style={{ background: isPopular ? ACCENT : PREMIUM }}
        >
          ★ {isPopular ? 'Most Popular' : 'Premium'}
        </span>
      )}

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[17px] font-bold text-gray-900">{pkg.name}</div>
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
            {pkg.term}
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-4">{pkg.tagline}</div>

        <div className="border-t border-gray-200 mb-4" />

        <div className="mb-4 flex-1">
          <Eyebrow>Included Features</Eyebrow>
          <ul className="list-none m-0 p-0 space-y-1">
            {pkg.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12.5px] text-gray-800">
                <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 mb-4" />

        <div>
          <Eyebrow>Ad Sizes &amp; Monthly Rates</Eyebrow>
          <div className="rounded-md border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    className="px-2.5 py-2 text-left text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Size
                  </th>
                  <th
                    className="px-2.5 py-2 text-left text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2 hidden md:table-cell"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Dimensions
                  </th>
                  <th
                    className="px-2.5 py-2 text-right text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Rate/Month
                  </th>
                </tr>
              </thead>
              <tbody>
                {pkg.sizes.map((s, i) => (
                  <tr key={s.size} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2.5 py-2 font-medium text-xs text-gray-900">{s.size}</td>
                    <td className="px-2.5 py-2 text-gray-500 text-[11px] hidden md:table-cell">{s.dim}</td>
                    <td
                      className="px-2.5 py-2 text-right font-bold text-[13px]"
                      style={{ color: ACCENT }}
                    >
                      {fmt(s.price)}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ad slots table ─────────────────────────────────────────────────────

// Tier headers used for the Weekly / Monthly rate columns. The first tier (1
// market) is highlighted because it represents the active publication tab; the
// other three are bundle upsells the rep can offer to extend reach.
const MARKET_TIERS: Array<{ markets: MarketCount; label: string; sub: string }> = [
  { markets: 1, label: '1 market',  sub: 'this pub'           },
  { markets: 2, label: '2 markets', sub: '+1 (1.7x)'          },
  { markets: 3, label: '3 markets', sub: '+2 (2.4x)'          },
  { markets: 4, label: 'All 4',     sub: 'full network (3x)'  },
];

function RateTierCell({
  value,
  active,
  emphasize,
  pricingUnit,
}: {
  value: number | null;
  active: boolean;
  emphasize: boolean;
  pricingUnit?: string | null;
}) {
  if (value === null) {
    return (
      <td className="px-2 py-2.5 text-right text-[11px] text-gray-400 italic align-top whitespace-nowrap">
        {pricingUnit ?? '—'}
      </td>
    );
  }
  const base = 'px-2 py-2.5 text-right text-[13px] font-bold align-top whitespace-nowrap';
  const color = emphasize ? { color: ACCENT } : undefined;
  const activeBg = active ? 'bg-amber-50' : '';
  return (
    <td className={`${base} ${activeBg}`} style={color}>
      {fmt(value)}
    </td>
  );
}

function AppSlotRow({ slot, striped }: { slot: AppAdSlot; striped: boolean }) {
  const isPremium = slot.tier === 'premium';
  const hasMonthly = slot.monthlySingle !== null;

  return (
    <tr className={striped ? 'bg-gray-50' : 'bg-white'}>
      <td className="px-3 py-2.5 align-top">
        <div className="text-[13px] font-semibold text-gray-900">{slot.name}</div>
        <div className="text-[11px] text-gray-500 font-mono mt-0.5">{slot.slug}</div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
          {ZONE_LABEL[slot.zone]}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top">
        <span
          className="text-[11px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md text-white"
          style={{ background: isPremium ? PREMIUM : NAVY }}
        >
          {slot.tier}
        </span>
      </td>

      {/* Weekly rate columns: 1 / 2 / 3 / 4 markets */}
      {MARKET_TIERS.map((t) => (
        <RateTierCell
          key={`wk-${t.markets}`}
          value={weeklyRateForMarkets(slot, t.markets)}
          active={t.markets === 1}
          emphasize={false}
        />
      ))}

      {/* Monthly rate columns: 1 / 2 / 3 / 4 markets */}
      {MARKET_TIERS.map((t) => (
        <RateTierCell
          key={`mo-${t.markets}`}
          value={hasMonthly ? monthlyRateForMarkets(slot, t.markets) : null}
          active={t.markets === 1}
          emphasize={true}
          pricingUnit={slot.pricingUnit}
        />
      ))}

      <td className="px-3 py-2.5 align-top text-[11.5px] text-gray-600">{slot.sizes}</td>
      <td className="px-3 py-2.5 align-top text-[12px] text-gray-700">{slot.notes}</td>
    </tr>
  );
}

function AppSlotsTable({ slots, activePubLabel }: { slots: AppAdSlot[]; activePubLabel: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {/* Top header row: group labels */}
            <tr>
              <th rowSpan={2} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-bold text-gray-600 bg-gray-50 border-b-2" style={{ borderBottomColor: ACCENT }}>Placement</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-bold text-gray-600 bg-gray-50 border-b-2" style={{ borderBottomColor: ACCENT }}>Zone</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-bold text-gray-600 bg-gray-50 border-b-2" style={{ borderBottomColor: ACCENT }}>Tier</th>
              <th colSpan={4} className="px-2 py-2 text-center text-[11px] uppercase tracking-wide font-bold text-gray-700 bg-gray-100 border-b border-gray-200">
                Weekly rate by market count
              </th>
              <th colSpan={4} className="px-2 py-2 text-center text-[11px] uppercase tracking-wide font-bold bg-gray-100 border-b border-gray-200" style={{ color: ACCENT }}>
                Monthly rate by market count
              </th>
              <th rowSpan={2} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-bold text-gray-600 bg-gray-50 border-b-2" style={{ borderBottomColor: ACCENT }}>Sizes</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-bold text-gray-600 bg-gray-50 border-b-2" style={{ borderBottomColor: ACCENT }}>Notes</th>
            </tr>
            {/* Second header row: per-tier columns */}
            <tr>
              {MARKET_TIERS.map((t) => {
                const isActive = t.markets === 1;
                return (
                  <th
                    key={`wk-h-${t.markets}`}
                    className={`px-2 py-2 text-right text-[10.5px] uppercase tracking-wide font-bold border-b-2 ${isActive ? 'bg-amber-50 text-gray-900' : 'bg-gray-50 text-gray-600'}`}
                    style={{ borderBottomColor: ACCENT }}
                    title={isActive ? `${activePubLabel} only` : `${t.markets}-market bundle`}
                  >
                    <div>{t.label}</div>
                    <div className={`text-[9.5px] font-normal normal-case ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>{isActive ? activePubLabel : t.sub}</div>
                  </th>
                );
              })}
              {MARKET_TIERS.map((t) => {
                const isActive = t.markets === 1;
                return (
                  <th
                    key={`mo-h-${t.markets}`}
                    className={`px-2 py-2 text-right text-[10.5px] uppercase tracking-wide font-bold border-b-2 ${isActive ? 'bg-amber-50 text-gray-900' : 'bg-gray-50 text-gray-600'}`}
                    style={{ borderBottomColor: ACCENT }}
                    title={isActive ? `${activePubLabel} only` : `${t.markets}-market bundle`}
                  >
                    <div>{t.label}</div>
                    <div className={`text-[9.5px] font-normal normal-case ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>{isActive ? activePubLabel : t.sub}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, i) => (
              <AppSlotRow key={slot.slug} slot={slot} striped={i % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── e-Blast card ────────────────────────────────────────────────

function EBlastCard({ pkg, activePub }: { pkg: EBlast; activePub: PubTab }) {
  const price = eblastPriceForPub(pkg, activePub.mediaKitPub);
  const sends = eblastSendsForPub(pkg, activePub.mediaKitPub);
  const features = eblastFeaturesForPub(pkg, activePub.mediaKitPub);
  const subscribers = PUB_SUBSCRIBERS[activePub.mediaKitPub];
  // CPM = (price / sends) / (list size / 1000)
  const cpm = subscribers > 0 && sends > 0 ? (price / sends) / (subscribers / 1000) : 0;
  const sendsLabel = sends === 1 ? '1 send' : `${sends} sends`;
  return (
    <div className="bg-white border border-gray-200 rounded-md p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-[15px] font-bold text-gray-900">{pkg.name}</div>
        <div className="bg-gray-50 px-3 py-1.5 rounded-md text-right">
          <div className="text-2xl font-extrabold" style={{ color: ACCENT }}>
            {fmt(price)}
          </div>
          <div className="text-[11px] text-gray-500">per package ({sendsLabel})</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            ${cpm.toFixed(2)} CPM · {(subscribers / 1000).toFixed(0)}K list
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 mb-3" />
      <ul className="list-none m-0 p-0 space-y-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-gray-800">
            <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500 italic">
        *Same Event Details, Same Advert Materials. **Photo Coverage for publishing purposes only.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type MediaKitClientProps = {
  /** ISO timestamp of the most recent change to lib/media-kit.ts. */
  lastSyncedISO: string;
};

function formatSyncedDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function MediaKitClient({ lastSyncedISO }: MediaKitClientProps) {
  const lastSyncedLabel = formatSyncedDate(lastSyncedISO);
  const [activePubId, setActivePubId] = useState<PubTab['id']>('austin');
  const activePub = PUB_TABS.find((p) => p.id === activePubId) ?? PUB_TABS[0]!;

  // Digital slot inventory available on the selected publication. We always
  // include slots whose `availablePubs` either explicitly lists the active
  // pub OR is unset (default = all four single pubs + 'both').
  const visibleSlots = APP_AD_SLOTS.filter((s) =>
    getSlotAvailablePubs(s).includes(activePub.mediaKitPub),
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-12">
      {/* Page header */}
      <header>
        <Eyebrow>2026 Media Kit</Eyebrow>
        <PageTitle size="md">
          Media Kit: Packages &amp; Rates
        </PageTitle>
        <p className="text-sm text-gray-600 max-w-3xl">
          Reference sheet for sales — packages, ad rates, e-blasts, print deadlines, and
          contract policies pulled from the master 2026 Media Kit. Pricing here always
          matches the Sign Wizard and the generated agreement PDF.
        </p>

        {/* Publication tabs */}
        <div
          role="tablist"
          aria-label="Select publication"
          className="mt-5 flex flex-wrap gap-x-2 border-b border-gray-200"
        >
          {PUB_TABS.map((t) => {
            const isActive = t.id === activePubId;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActivePubId(t.id)}
                className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition ${
                  isActive
                    ? 'text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={isActive ? { borderBottomColor: ACCENT } : undefined}
              >
                <span>{t.label}</span>
                <span className={`ml-2 text-[11px] font-normal ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                  {t.channels}
                </span>
              </button>
            );
          })}
        </div>

        {/* Audience stats: subscriber count is per-tab (live list size for the
            active publication); open + click rates are network-wide. */}
        <div className="flex flex-wrap gap-2 mt-4">
          {AUDIENCE_STATS.map((s) => {
            const value =
              s.label === 'Subscribers'
                ? `${(PUB_SUBSCRIBERS[activePub.mediaKitPub] / 1000).toFixed(0)}K`
                : s.value;
            return (
              <div
                key={s.label}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full"
              >
                <span className="text-xs text-gray-500">{s.label}:</span>
                <span className="text-sm font-bold" style={{ color: ACCENT }}>
                  {value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Source-of-truth banner — confirms this page and every downstream
            surface (inquiry auto-reply, public checkout, Stripe payment
            intent, generated agreement) all read the same rate table. */}
        <div
          role="note"
          aria-label="Rate source of truth"
          className="mt-6 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3"
        >
          <div
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Last synced from Media Kit on {lastSyncedLabel}
            </p>
            <p className="text-[13px] leading-relaxed text-emerald-900/80 mt-1">
              All rates on this page flow from a single source of truth
              (<code className="px-1 py-0.5 bg-emerald-100 text-emerald-900 rounded-md text-[12px]">lib/media-kit.ts</code>). The same rates power the public ad-inquiry auto-reply, the self-serve checkout at <code className="px-1 py-0.5 bg-emerald-100 text-emerald-900 rounded-md text-[12px]">/advertise/checkout/[slot]</code>, the Stripe payment intent, and the generated advertising agreement PDF. Edit one place, every surface updates on next deploy.
            </p>
          </div>
        </div>
      </header>

      {/* App / Digital Ad Slots — unified <AdSlot> engine */}
      <section>
        <SectionHead>App &amp; Digital Ad Slots</SectionHead>
        <p className="text-[13px] text-gray-600 max-w-3xl mb-4">
          {APP_AD_AUDIENCE_NOTE} Weekly rates assume consecutive weeks; monthly = 4 weeks. Multi-market
          bundles use a {MARKET_MULTIPLIERS[2]}× / {MARKET_MULTIPLIERS[3]}× / {MARKET_MULTIPLIERS[4]}×
          multiplier on the single-market base for 2 / 3 / all 4 markets respectively. Manage live
          campaigns at{' '}
          <a href="/admin/ads" className="font-semibold underline" style={{ color: ACCENT }}>
            /admin/ads
          </a>
          .
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold text-white px-2 py-1 rounded-md" style={{ background: PREMIUM }}>
            ★ Premium tier
          </span>
          <span className="text-[12px] text-gray-600 self-center">High-context placements (article tops, sidebars, calendar pins, splash, push).</span>
        </div>
        <AppSlotsTable slots={visibleSlots.filter((s) => s.tier === 'premium')} activePubLabel={activePub.label} />

        <div className="flex flex-wrap gap-2 mt-6 mb-3">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold text-white px-2 py-1 rounded-md" style={{ background: NAVY }}>
            Standard tier
          </span>
          <span className="text-[12px] text-gray-600 self-center">Steady-reach inventory across feed, article, and calendar.</span>
        </div>
        <AppSlotsTable slots={visibleSlots.filter((s) => s.tier === 'standard')} activePubLabel={activePub.label} />

        <div className="mt-4 p-3 rounded-md border border-gray-200 bg-amber-50/40" style={{ borderLeft: `4px solid ${GOLD}` }}>
          <div className="text-[12.5px] text-gray-700">
            <span className="font-semibold">House inventory.</span> Every slot has a RealtyLine House
            fallback creative auto-seeded on app startup. Unsold weeks never go dark — the network
            keeps serving brand impressions until a paid campaign goes live.
          </div>
        </div>
      </section>

      {/* Packages — print + digital, only rendered for publications that run a print magazine */}
      {activePub.hasPrint && (
      <section>
        <SectionHead>Print &amp; Digital Ad Rate Packages</SectionHead>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PACKAGES.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </div>
      </section>
      )}

      {/* Rate matrix — print-only */}
      {activePub.hasPrint && (
      <section>
        <SectionHead>Ad Rates by Size &amp; Frequency</SectionHead>
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 bg-gray-50 border-b-2 border-r border-gray-200"
                  style={{ borderBottomColor: ACCENT }}
                >
                  Ad Size
                </th>
                {FREQ_LABELS.map((f, i) => (
                  <th
                    key={f}
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-600 bg-gray-50 border-b-2 border-r border-gray-200"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    {f}
                    <div className="text-[11px] font-medium text-gray-400 mt-0.5">
                      {FREQ_TERMS[i]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(RATE_MATRIX).map((size, ri) => {
                const prices = RATE_MATRIX[size]!;
                return (
                  <tr key={size} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2.5 font-semibold text-[13px] text-gray-900">{size}</td>
                    {prices.map((p, ci) => {
                      const isBest = ci === 3;
                      return (
                        <td
                          key={ci}
                          className="px-3 py-2.5 text-center text-[13px] font-bold"
                          style={{ color: isBest ? ACCENT : '#111827' }}
                        >
                          {fmt(p)}/mo
                          {isBest && (
                            <div
                              className="text-[11px] font-semibold opacity-80"
                              style={{ color: ACCENT }}
                            >
                              Best Rate
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Brand[12 Plus] premium tier */}
              <tr style={{ background: 'rgba(61, 7, 64, 0.06)' }}>
                <td className="px-3 py-2.5 font-semibold text-[13px] text-gray-900">
                  Full Page{' '}
                  <span
                    className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-full text-white ml-1"
                    style={{ background: PREMIUM }}
                  >
                    Brand [12 Plus]
                  </span>
                </td>
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-center text-xs text-gray-400 italic"
                >
                  Not available
                </td>
                <td
                  className="px-3 py-2.5 text-center text-[13px] font-bold"
                  style={{ color: PREMIUM }}
                >
                  {fmt(BRAND_12_PLUS_RATE)}/mo
                  <div className="text-[11.5px] font-semibold" style={{ color: PREMIUM }}>
                    Full Page Only
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      )}

      {/* e-Blast packages — every publication has email */}
      <section>
        <SectionHead>e-Blast Packages</SectionHead>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EBLASTS.filter((p) => isEblastAvailableForPub(p, activePub.mediaKitPub)).map((p) => (
            <EBlastCard key={p.name} pkg={p} activePub={activePub} />
          ))}
        </div>
      </section>

      {/* Print deadlines — print-only */}
      {activePub.hasPrint && (
      <section>
        <SectionHead>2026 Print Deadlines</SectionHead>
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm divide-y divide-gray-200">
          {PRINT_DEADLINES.map((d, i) => (
            <div
              key={d.month}
              className={`flex items-center justify-between px-4 py-3 ${
                Math.floor(i / 2) % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              <div>
                <div className="text-[13.5px] font-bold text-gray-900">{d.month}</div>
                <div className="text-[11.5px] text-gray-500">Mail: {d.mail}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-500">Deadline</div>
                <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>
                  {d.deadline}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      )}

      {/* Policy notes — universal */}
      <section>
        <SectionHead>Policies &amp; Notes</SectionHead>
        <div className="space-y-3">
          {POLICY_NOTES.map((n) => (
            <div
              key={n.title}
              className="bg-white border-l-4 border border-gray-200 rounded-r-lg p-4 shadow-sm"
              style={{ borderLeftColor: n.color }}
            >
              <div className="text-sm font-bold text-gray-900 mb-1" style={{ color: n.color }}>
                {n.title}
              </div>
              <div className="text-[13px] text-gray-700 leading-relaxed">{n.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
