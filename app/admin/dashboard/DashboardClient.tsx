'use client';

import Link from 'next/link';
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
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    ring: 'ring-blue-100',
  },
  newsline: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    ring: 'ring-amber-100',
  },
  'realtyline-houston': {
    badge: 'bg-teal-100 text-teal-800 border-teal-200',
    ring: 'ring-teal-100',
  },
  'realtyline-dallas': {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    ring: 'ring-purple-100',
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
        'rounded-lg border bg-white p-5 shadow-sm ring-1 ' +
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
        <span className="text-4xl font-bold tabular-nums text-gray-900">
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
              (snapshot.bounceCount > 0 ? 'text-red-700' : 'text-gray-900')
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
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span className="font-medium text-gray-900">Current issue:</span>{' '}
          {snapshot.currentIssue.label}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isLive ? (
          <>
            <Link
              href={crmHref}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
            >
              Open CRM
            </Link>
            <Link
              href={`/admin/ads/campaigns?market=${snapshot.market}`}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
            >
              Campaigns
            </Link>
            <Link
              href={`/admin/magazines?publication=${snapshot.market}`}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
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

export default function DashboardClient({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {/* Attention strip */}
      {data.attention.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-amber-900">
            <span className="font-semibold">Attention:</span>
            {data.attention.map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Market cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.markets.map((snapshot) => (
          <MarketCard key={snapshot.market} snapshot={snapshot} />
        ))}
      </div>

      <p className="text-[11px] text-gray-400">
        Snapshot generated {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
