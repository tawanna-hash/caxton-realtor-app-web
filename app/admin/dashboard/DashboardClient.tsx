'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import type { DashboardData, MarketSnapshot } from './data';

function fmtNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtMoneyFromCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
}

const CARD_ACCENT: Record<string, { badge: string; ring: string }> = {
  realtyline: {
    badge: 'bg-[#EFEAF8] text-[#301D5D] border-[#D9CFF0]',
    ring: 'ring-[#EFEAF8]',
  },
  newsline: {
    badge: 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30',
    ring: 'ring-[#FEF8CC]',
  },
  'realtyline-houston': {
    badge: 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30',
    ring: 'ring-[#E0FBE0]',
  },
  'realtyline-dallas': {
    badge: 'bg-[#EFEAF8] text-[#42277C] border-[#B9ADD6]',
    ring: 'ring-[#EFEAF8]',
  },
};

function MarketCard({ snapshot }: { snapshot: MarketSnapshot }) {
  const accent = CARD_ACCENT[snapshot.publication] ?? {
    badge: 'bg-gray-100 text-gray-800 border-gray-200',
    ring: 'ring-gray-100',
  };
  const isLive = snapshot.status === 'live';
  const crmHref = `/admin/crm?market=${snapshot.market}`;

  return (
    <div
      className={
        'rounded-2xl border border-[#ECE8F5] bg-white p-5 ' +
        accent.ring +
        (isLive ? '' : ' opacity-60')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{snapshot.label}</h2>
          <span
            className={
              'mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' +
              accent.badge
            }
          >
            {snapshot.publication}
          </span>
        </div>
        {!isLive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
            Coming soon
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums text-[#6D3FD6]">
          {fmtNumber(snapshot.advertiserCount)}
        </span>
        <span className="text-sm text-gray-500">partners</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Active</dt>
          <dd className="tabular-nums font-medium text-gray-900">
            {fmtNumber(snapshot.activeCount)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Prospects</dt>
          <dd className="tabular-nums font-medium text-gray-900">
            {fmtNumber(snapshot.prospectCount)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Bounces</dt>
          <dd
            className={
              'tabular-nums font-medium ' +
              (snapshot.bounceCount > 0 ? 'text-[#661102]' : 'text-gray-900')
            }
          >
            {fmtNumber(snapshot.bounceCount)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Opens 30d</dt>
          <dd className="tabular-nums font-medium text-gray-900">
            {fmtNumber(snapshot.opens30d)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Live campaigns</dt>
          <dd className="tabular-nums font-medium text-gray-900">
            {fmtNumber(snapshot.activeCampaigns)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Revenue MTD</dt>
          <dd className="tabular-nums font-medium text-gray-900">
            {fmtMoneyFromCents(snapshot.revenueMtdCents)}
          </dd>
        </div>
      </dl>

      {snapshot.currentIssue && (
        <div className="mt-4 rounded-xl border border-[#ECE8F5] bg-[#F6F5FB] px-3 py-2 text-xs text-gray-700">
          <span className="font-medium text-gray-900">Current issue:</span>{' '}
          {snapshot.currentIssue.label}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isLive ? (
          <>
            <Link
              href={crmHref}
              className="inline-flex items-center rounded-full border border-[#ECE8F5] bg-white px-4 py-2 text-xs font-semibold text-[#6D3FD6] hover:bg-[#F6F5FB]"
            >
              Open CRM
            </Link>
            <Link
              href={`/admin/ads/campaigns?market=${snapshot.market}`}
              className="inline-flex items-center rounded-full border border-[#ECE8F5] bg-white px-4 py-2 text-xs font-semibold text-[#6D3FD6] hover:bg-[#F6F5FB]"
            >
              Campaigns
            </Link>
            <Link
              href={`/admin/magazines?publication=${snapshot.market}`}
              className="inline-flex items-center rounded-full border border-[#ECE8F5] bg-white px-4 py-2 text-xs font-semibold text-[#6D3FD6] hover:bg-[#F6F5FB]"
            >
              Issues
            </Link>
          </>
        ) : (
          <span className="text-xs text-gray-500 italic">Launch to open workflows</span>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-6 py-5 first:pl-8 sm:border-l sm:border-dashed sm:border-[#E3DEF1] sm:first:border-l-0">
      <div className="text-sm text-gray-700">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-[#6D3FD6]">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const live = data.markets.filter((m) => m.status === 'live');
  const sum = (f: (m: MarketSnapshot) => number) => live.reduce((n, m) => n + f(m), 0);

  return (
    <div className="space-y-6">
      {/* KPI strip (Mint "Analytics") */}
      <section className="grid grid-cols-2 rounded-2xl border border-[#ECE8F5] bg-white lg:grid-cols-4">
        <Kpi label="Partners" value={fmtNumber(sum((m) => m.advertiserCount))} sub={`${fmtNumber(sum((m) => m.activeCount))} active`} />
        <Kpi label="Revenue MTD" value={fmtMoneyFromCents(sum((m) => m.revenueMtdCents))} sub={`${live.length} live markets`} />
        <Kpi label="Live campaigns" value={fmtNumber(sum((m) => m.activeCampaigns))} sub={`${fmtNumber(sum((m) => m.opens30d))} opens in 30 days`} />
        <Kpi label="Prospects" value={fmtNumber(sum((m) => m.prospectCount))} sub={`${fmtNumber(sum((m) => m.bounceCount))} bounces`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg text-gray-800">Market Snapshot</h2>
            <span className="text-xs text-gray-500">Live operational totals by publication</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.markets.map((snapshot) => (
              <MarketCard key={snapshot.market} snapshot={snapshot} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[#ECE8F5] bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#E4DBFA] text-[#5B3FC4]">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="text-lg text-gray-800">Date Radar</h2>
              <span className="ml-auto text-xs text-gray-500">Next 14 days</span>
            </div>
            {data.radar.length > 0 ? (
              <ul className="mt-4 space-y-1">
                {data.radar.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[#F6F5FB]">
                      <span
                        className={
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[10px] font-semibold uppercase ' +
                          (item.tone === 'warning' ? 'bg-[#FFE0DD] text-[#D9342B]' : 'bg-[#E4DBFA] text-[#5B3FC4]')
                        }
                      >
                        {new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-800">{item.title}</span>
                        <span className="block truncate text-xs text-gray-500">{item.detail}</span>
                      </span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-[#F6F5FB] px-3 py-4 text-sm leading-5 text-gray-600">
                No upcoming invoice due dates or campaign end dates need attention.
              </p>
            )}
          </section>

          {data.attention.length > 0 && (
            <section className="rounded-2xl border border-[#ECE8F5] bg-white p-6">
              <h2 className="mb-3 text-lg text-gray-800">Needs attention</h2>
              <div className="flex flex-wrap gap-2">
                {data.attention.map((item, i) => (
                  <Link key={i} href={item.href} className="inline-flex items-center rounded-full border border-[#FFE0DD] bg-[#FFF5F4] px-4 py-1.5 text-xs font-medium text-[#D9342B] hover:bg-[#FFE0DD]">
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">Snapshot generated {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}
