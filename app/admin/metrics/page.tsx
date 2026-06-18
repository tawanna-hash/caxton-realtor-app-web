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
                        <div className="h-full bg-[#021D40]" style={{ width: `${pct}%` }} />
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
              {metrics.filter_usage.length === 0 ? (
                <p className="text-sm text-gray-500">No filter clicks yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left pb-2 font-medium">Filter</th>
                      <th className="text-right pb-2 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.filter_usage.map((f) => (
                      <tr key={f.filter} className="border-t border-gray-100">
                        <td className="py-2 text-gray-900 capitalize">{f.filter}</td>
                        <td className="py-2 text-right tabular-nums text-gray-700">
                          {f.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Top builders · last 30 days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              {metrics.top_builders.length === 0 ? (
                <p className="text-sm text-gray-500">No builder chip clicks yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left pb-2 font-medium">Builder</th>
                      <th className="text-left pb-2 font-medium">From</th>
                      <th className="text-right pb-2 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.top_builders.map((b, i) => (
                      <tr key={`${b.builder_name}-${b.source_page}-${i}`} className="border-t border-gray-100">
                        <td className="py-2 text-gray-900">{b.builder_name}</td>
                        <td className="py-2 text-gray-500 text-xs">{b.source_page}</td>
                        <td className="py-2 text-right tabular-nums text-gray-700">
                          {b.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Top inventory cards · last 30 days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              {metrics.top_inventory.length === 0 ? (
                <p className="text-sm text-gray-500">No card clicks yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left pb-2 font-medium">Builder</th>
                      <th className="text-left pb-2 font-medium">Row</th>
                      <th className="text-left pb-2 font-medium">Kind</th>
                      <th className="text-left pb-2 font-medium">Dest</th>
                      <th className="text-right pb-2 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.top_inventory.map((row, i) => (
                      <tr key={`${row.row_id}-${row.destination}-${i}`} className="border-t border-gray-100">
                        <td className="py-2 text-gray-900">{row.builder_name}</td>
                        <td className="py-2 text-gray-500 text-xs tabular-nums">#{row.row_id}</td>
                        <td className="py-2 text-gray-700 capitalize">{row.kind}</td>
                        <td className="py-2 text-gray-500 text-xs">{row.destination}</td>
                        <td className="py-2 text-right tabular-nums text-gray-700">
                          {row.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Pill engagement · last {days} days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              {!metrics.pill_engagement || metrics.pill_engagement.length === 0 ? (
                <p className="text-sm text-gray-500">No pill clicks recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left pb-2 font-medium">Surface</th>
                      <th className="text-left pb-2 font-medium">Action</th>
                      <th className="text-right pb-2 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.pill_engagement.map((row, i) => (
                      <tr key={`${row.surface}-${row.action}-${i}`} className="border-t border-gray-100">
                        <td className="py-2 text-gray-900">
                          {SURFACE_LABELS[row.surface] ?? row.surface}
                        </td>
                        <td className="py-2 text-gray-700">
                          {ACTION_LABELS[row.action] ?? row.action}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-700">
                          {row.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Share channel breakdown · last {days} days
            </h2>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              {!metrics.share_breakdown || metrics.share_breakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No shares recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="text-left pb-2 font-medium">Surface</th>
                      <th className="text-left pb-2 font-medium">Channel</th>
                      <th className="text-right pb-2 font-medium">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.share_breakdown.map((row, i) => (
                      <tr key={`${row.surface}-${row.channel}-${i}`} className="border-t border-gray-100">
                        <td className="py-2 text-gray-900">
                          {SURFACE_LABELS[row.surface] ?? row.surface}
                        </td>
                        <td className="py-2 text-gray-700 capitalize">{row.channel}</td>
                        <td className="py-2 text-right tabular-nums text-gray-700">
                          {row.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <NewsletterMetrics days={days} />

          <p className="text-xs text-gray-400 pt-4">
            Source: PostHog (click metrics) + Neon (newsletter) · refreshes on page load
          </p>
        </div>
      )}
    </div>
  );
}
