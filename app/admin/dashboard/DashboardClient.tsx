'use client';

import Link from 'next/link';
import { ArrowRight, Bell, CalendarDays, FileText, ShieldCheck, ClipboardCheck } from 'lucide-react';
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
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Guided action
              </div>
              <h2 className="mt-3 text-xl font-semibold text-gray-950">
                TREC 1–4 Residential Contract
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Start a structured deal-prep review for the parties, property, financing,
                deadlines and addenda before completing or reviewing the official contract.
              </p>
            </div>
            <FileText className="hidden h-10 w-10 shrink-0 text-orange-200 sm:block" aria-hidden="true" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/admin/command-center/trec-1-4"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Start deal prep
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <span className="text-xs text-gray-500">
              Guided review only. It does not create an official contract.
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-orange-700" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-gray-950">Date Radar</h2>
            <span className="ml-auto text-xs text-gray-500">Next 14 days</span>
          </div>
          {data.radar.length > 0 ? (
            <ul className="mt-4 divide-y divide-gray-100">
              {data.radar.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 py-3 transition hover:text-orange-700"
                  >
                    <span
                      className={
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase ' +
                        (item.tone === 'warning'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-700')
                      }
                    >
                      {new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{item.detail}</span>
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-md bg-gray-50 px-3 py-4 text-sm leading-5 text-gray-600">
              No upcoming invoice due dates or campaign end dates need attention.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-800">
              <Bell className="h-4 w-4" aria-hidden="true" />
              Cross-transaction Date Radar
            </div>
            <h2 className="mt-2 text-xl font-semibold text-gray-950">Active deal deadlines & reminders</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              The next 14 days across every saved TREC deal, including overdue in-app reminders.
            </p>
          </div>
          <Link
            href="/admin/command-center/trec-1-4"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-300 bg-white px-4 text-sm font-semibold text-violet-800 hover:bg-violet-100"
          >
            Open deal prep
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {data.trecRadar.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.trecRadar.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex min-h-24 gap-3 rounded-lg border border-violet-100 bg-white p-3 transition hover:border-violet-300 hover:shadow-sm"
              >
                <span className={item.tone === 'warning' ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-100 text-center text-[10px] font-semibold uppercase text-red-800' : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-violet-100 text-center text-[10px] font-semibold uppercase text-violet-800'}>
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold uppercase tracking-wide text-violet-800">{item.dealTitle}</span>
                  <span className="mt-0.5 block truncate text-sm font-semibold text-gray-900">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-600">{item.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-violet-200 bg-white px-4 py-5 text-sm leading-6 text-gray-600">
            No active saved-deal deadlines or reminders fall within the next 14 days. Save a TREC deal and add reminders from its Date Radar to surface them here.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Transaction operations
            </div>
            <h2 className="mt-2 text-xl font-semibold text-gray-950">TREC pipeline & workload</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">Operational totals from saved deal workspaces. Review alerts are prompts, not legal determinations.</p>
          </div>
          <Link href="/admin/command-center/trec-1-4" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            Manage transactions <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Active workspaces', data.transactionPipeline.activeDeals, 'Not completed or cancelled'],
            ['Closing next 30 days', data.transactionPipeline.closingNext30Days, 'Based on entered target closing dates'],
            ['Operational review alerts', data.transactionPipeline.reviewAlerts, 'Required fields and timing relationships'],
            ['Overdue tasks', data.transactionPipeline.overdueTasks, 'Incomplete tasks with passed due dates'],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-950">{value}</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-950">Pipeline stage</h3>
            <ul className="mt-3 space-y-2">{data.transactionPipeline.stages.map((stage) => <li key={stage.status} className="flex justify-between gap-3 text-sm"><span className="text-gray-600">{stage.label}</span><span className="font-semibold tabular-nums text-gray-950">{stage.count}</span></li>)}</ul>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-950">Coordinator workload</h3>
            <ul className="mt-3 space-y-2">{data.transactionPipeline.workloads.length ? data.transactionPipeline.workloads.map((item) => <li key={item.assignee} className="flex justify-between gap-3 text-sm"><span className="truncate text-gray-600">{item.assignee}</span><span className="font-semibold tabular-nums text-gray-950">{item.count}</span></li>) : <li className="text-sm text-gray-500">Assign an owner in a deal workspace to populate this view.</li>}</ul>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-950">Title-company distribution</h3>
            <ul className="mt-3 space-y-2">{data.transactionPipeline.titleDistribution.length ? data.transactionPipeline.titleDistribution.map((item) => <li key={item.label} className="flex justify-between gap-3 text-sm"><span className="truncate text-gray-600">{item.label}</span><span className="font-semibold tabular-nums text-gray-950">{item.count}</span></li>) : <li className="text-sm text-gray-500">Enter title companies in deal workspaces to populate this operational distribution.</li>}</ul>
          </div>
        </div>
      </section>

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
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-gray-950">Market snapshot</h2>
        <span className="text-xs text-gray-500">Live operational totals by publication</span>
      </div>
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
