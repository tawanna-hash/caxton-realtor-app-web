'use client';

// app/admin/metrics/_components/NewsletterMetrics.tsx
//
// Self-contained section that fetches /api/admin/newsletter-subscribers/stats
// and renders KPI tiles + daily time series + source/publication breakdowns.
// Lives below the PostHog-backed sections on /admin/metrics.

import { useEffect, useState } from 'react';
import { KPITile } from './KPITile';
import { MetricList } from './MetricList';

type Stats = {
  totals: { active: number; unsubscribed: number; total: number };
  last_7_days: number;
  last_30_days: number;
  days: number;
  time_series: Array<{ date: string; count: number }>;
  by_source: Array<{ source: string; count: number }>;
  by_publication: Array<{ publication: string; count: number }>;
};

function MiniBars({ series }: { series: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className="flex items-end gap-[2px] h-24">
      {series.map((s) => {
        const pct = (s.count / max) * 100;
        return (
          <div
            key={s.date}
            className="flex-1 bg-brand-700/80 rounded-md"
            style={{ height: `${Math.max(2, pct)}%` }}
            title={`${s.date}: ${s.count}`}
          />
        );
      })}
    </div>
  );
}

export function NewsletterMetrics({ days }: { days: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/newsletter-subscribers/stats?days=${days}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
        }
        const body = (await res.json()) as Stats;
        if (cancelled) return;
        setStats(body);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Newsletter signups
        </h2>
        <a
          href="/admin/newsletter"
          className="text-xs uppercase tracking-wider text-brand-700 underline"
        >
          View list &rarr;
        </a>
      </div>

      {loading && !stats && (
        <p className="text-sm text-gray-500">Loading newsletter stats&hellip;</p>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPITile label="Total subscribers" value={stats.totals.total} />
            <KPITile label="Active" value={stats.totals.active} />
            <KPITile
              label="Last 7 days"
              value={stats.last_7_days}
              sublabel="new signups"
            />
            <KPITile
              label="Last 30 days"
              value={stats.last_30_days}
              sublabel="new signups"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              Daily signups &middot; last {stats.days} days
            </p>
            {stats.time_series.length === 0 ? (
              <p className="text-sm text-gray-500">No signups yet.</p>
            ) : (
              <MiniBars series={stats.time_series} />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                By source
              </p>
              <MetricList
                rows={stats.by_source}
                keyFn={(row) => row.source}
                emptyMessage="No data yet."
                columns={[
                  { header: 'Source', role: 'primary', render: (row) => row.source },
                  { header: 'Count', role: 'value', render: (row) => row.count.toLocaleString() },
                ]}
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-md p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                By publication
              </p>
              <MetricList
                rows={stats.by_publication}
                keyFn={(row) => row.publication}
                emptyMessage="No data yet."
                columns={[
                  { header: 'Publication', role: 'primary', render: (row) => <span className="capitalize">{row.publication}</span> },
                  { header: 'Count', role: 'value', render: (row) => row.count.toLocaleString() },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
