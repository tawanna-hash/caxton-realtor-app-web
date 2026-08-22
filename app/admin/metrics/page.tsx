'use client';

import { useEffect, useState } from 'react';

import type { Metrics } from './_types';
import { EVENT_LABELS, SURFACE_LABELS, ACTION_LABELS } from './_types';
import dynamic from 'next/dynamic';

// Lazy-load recharts so admin/metrics first paint isn't blocked by ~320 kB.
const TimeSeriesChart = dynamic(() => import('./_components/TimeSeriesChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-sm text-gray-400">
      Loading chart…
    </div>
  ),
});
import { KPITile } from './_components/KPITile';
import { DateRangePicker } from './_components/DateRangePicker';
import type { DaysOption } from './_components/DateRangePicker';
import { NewsletterMetrics } from './_components/NewsletterMetrics';
import { TrendingMetrics } from './_components/TrendingMetrics';
import { MetricList } from './_components/MetricList';

import PageTitle from '@/components/ui/PageTitle';
export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DaysOption>(7);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/metrics?days=${days}`, { credentials: 'include' });
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; metrics?: Metrics; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok || !body.metrics) {
          setError(body?.error || 'Failed to load metrics.');
          setLoading(false);
          return;
        }
        setError(null);
        setMetrics(body.metrics);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  const grandTotalLast7 = metrics
    ? metrics.event_totals.reduce((s, e) => s + e.total, 0)
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
          Admin
        </p>
        <PageTitle size="md">
          Click Metrics
        </PageTitle>
        <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
          Engagement on builder/developer surfaces. Filter pills,
          builder chips, inventory cards, and per-builder tabs.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <DateRangePicker value={days} onChange={setDays} disabled={loading} />
        {loading && (
          <span className="text-xs text-gray-500">Loading…</span>
        )}
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md mb-6">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {!metrics && !error && (
        <div className="text-sm text-gray-500">Loading metrics…</div>
      )}

      {metrics && (
        <div className="space-y-10">
          {metrics.kpi_summary && (
            <section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPITile
                  label="Today"
                  value={metrics.kpi_summary.today}
                  trendPct={metrics.kpi_summary.trend_pct}
                  showTrend
                  sublabel="vs yesterday"
                />
                <KPITile
                  label="Yesterday"
                  value={metrics.kpi_summary.yesterday}
                />
                <KPITile
                  label="Last 7 days"
                  value={metrics.kpi_summary.week}
                />
                <KPITile
                  label="Avg / day"
                  value={Math.round(metrics.kpi_summary.week / 7)}
                  sublabel="7-day average"
                />
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Activity · last 7 days
            </h2>
            <TimeSeriesChart data={metrics.time_series ?? []} />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Last 7 days · {grandTotalLast7.toLocaleString()} total clicks
            </h2>
            <div className="bg-white border border-gray-200 rounded-md divide-y divide-gray-200">
              {metrics.event_totals.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">
                  No events yet. PostHog may take a few minutes to ingest.
                </div>
              ) : (
                metrics.event_totals.map((e) => {
                  const pct = grandTotalLast7 > 0 ? (e.total / grandTotalLast7) * 100 : 0;
                  return (
                    <div key={e.event} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-900">
                          {EVENT_LABELS[e.event] ?? e.event}
                        </span>
                        <span className="text-sm tabular-nums text-gray-700">
                          {e.total.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-md overflow-hidden">
                        <div className="h-full bg-brand-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Show filter usage · last 7 days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.filter_usage}
                keyFn={(f) => f.filter}
                emptyMessage="No filter clicks yet."
                columns={[
                  { header: 'Filter', role: 'primary', render: (f) => <span className="capitalize">{f.filter}</span> },
                  { header: 'Clicks', role: 'value', render: (f) => f.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Top builders · last 30 days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.top_builders}
                keyFn={(b, i) => `${b.builder_name}-${b.source_page}-${i}`}
                emptyMessage="No builder chip clicks yet."
                columns={[
                  { header: 'Builder', role: 'primary', render: (b) => b.builder_name },
                  { header: 'From', role: 'secondary', className: 'text-gray-500 text-xs', render: (b) => b.source_page },
                  { header: 'Clicks', role: 'value', render: (b) => b.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Top inventory cards · last 30 days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.top_inventory}
                keyFn={(row, i) => `${row.row_id}-${row.destination}-${i}`}
                emptyMessage="No card clicks yet."
                columns={[
                  { header: 'Builder', role: 'primary', render: (row) => row.builder_name },
                  { header: 'Row', role: 'secondary', className: 'text-gray-500 text-xs tabular-nums', render: (row) => `#${row.row_id}` },
                  { header: 'Kind', role: 'secondary', className: 'text-gray-700', render: (row) => <span className="capitalize">{row.kind}</span> },
                  { header: 'Dest', role: 'secondary', className: 'text-gray-500 text-xs', render: (row) => row.destination },
                  { header: 'Clicks', role: 'value', render: (row) => row.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Pill engagement · last {days} days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.pill_engagement ?? []}
                keyFn={(row, i) => `${row.surface}-${row.action}-${i}`}
                emptyMessage="No pill clicks recorded yet."
                columns={[
                  { header: 'Surface', role: 'primary', render: (row) => SURFACE_LABELS[row.surface] ?? row.surface },
                  { header: 'Action', role: 'secondary', className: 'text-gray-700', render: (row) => ACTION_LABELS[row.action] ?? row.action },
                  { header: 'Clicks', role: 'value', render: (row) => row.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Share channel breakdown · last {days} days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.share_breakdown ?? []}
                keyFn={(row, i) => `${row.surface}-${row.channel}-${i}`}
                emptyMessage="No shares recorded yet."
                columns={[
                  { header: 'Surface', role: 'primary', render: (row) => SURFACE_LABELS[row.surface] ?? row.surface },
                  { header: 'Channel', role: 'secondary', className: 'text-gray-700', render: (row) => <span className="capitalize">{row.channel}</span> },
                  { header: 'Shares', role: 'value', render: (row) => row.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Listing inquiries · last {days} days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <MetricList
                rows={metrics.listing_inquiries ?? []}
                keyFn={(row, i) => `${row.builder_name}-${i}`}
                emptyMessage={'No "Request more information" submissions yet.'}
                columns={[
                  { header: 'Builder', role: 'primary', render: (row) => row.builder_name },
                  { header: 'Inquiries', role: 'value', render: (row) => row.total.toLocaleString() },
                ]}
              />
            </div>
          </section>

          <TrendingMetrics days={days} />

          <NewsletterMetrics days={days} />

          <p className="text-xs text-gray-400 pt-4">
            Source: PostHog (click metrics) + Neon (newsletter) · refreshes on page load
          </p>
        </div>
      )}
    </div>
  );
}
