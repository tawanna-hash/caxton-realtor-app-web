'use client';

// app/admin/metrics/_components/TrendingMetrics.tsx
//
// Fetches /api/admin/metrics/trending and renders KPI tiles + per-item table
// + per-market split. Mirrors the shape of NewsletterMetrics.

import { useEffect, useState } from 'react';
import { KPITile } from './KPITile';

type Metrics = {
  totals: {
    impressions: number;
    clicks: number;
    dismissals: number;
    navs: number;
    loaded: number;
  };
  ctr: number;
  dismissal_rate: number;
  top_items: Array<{
    trending_id: string;
    headline: string;
    impressions: number;
    clicks: number;
    dismissals: number;
    ctr: number;
  }>;
  by_market: Array<{
    market: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  days: number;
};

export function TrendingMetrics({ days }: { days: number }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/metrics/trending?days=${days}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
        }
        const body = (await res.json()) as { ok: boolean; metrics: Metrics };
        if (cancelled) return;
        setMetrics(body.metrics);
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
          Trending ticker
        </h2>
        <a
          href="/admin/content/trending"
          className="text-xs uppercase tracking-wider text-brand-700 underline"
        >
          Manage &rarr;
        </a>
      </div>

      {loading && !metrics && (
        <p className="text-sm text-gray-500">Loading trending stats&hellip;</p>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {metrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPITile
              label="Impressions"
              value={metrics.totals.impressions}
              sublabel={`last ${metrics.days}d`}
            />
            <KPITile
              label="Clicks"
              value={metrics.totals.clicks}
              sublabel={`last ${metrics.days}d`}
            />
            <KPITile
              label="CTR (%)"
              value={metrics.ctr}
              sublabel="clicks / impressions"
            />
            <KPITile
              label="Dismissals"
              value={metrics.totals.dismissals}
              sublabel={`${metrics.dismissal_rate}% dismissal rate`}
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              Top items &middot; last {metrics.days} days
            </p>
            {metrics.top_items.length === 0 ? (
              <p className="text-sm text-gray-500">
                No trending activity yet. Publish items and wait for events to ingest.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2">Headline</th>
                    <th className="pb-2 text-right">Impr.</th>
                    <th className="pb-2 text-right">Clicks</th>
                    <th className="pb-2 text-right">CTR</th>
                    <th className="pb-2 text-right">Dismissed</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.top_items.map((row) => (
                    <tr
                      key={row.trending_id}
                      className="border-t border-gray-100 first:border-t-0"
                    >
                      <td className="py-2 text-gray-900 truncate max-w-xs">
                        {row.headline}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.impressions.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.clicks.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.ctr}%
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {row.dismissals.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              By market
            </p>
            {metrics.by_market.length === 0 ? (
              <p className="text-sm text-gray-500">No data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="pb-2">Market</th>
                    <th className="pb-2 text-right">Impr.</th>
                    <th className="pb-2 text-right">Clicks</th>
                    <th className="pb-2 text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.by_market.map((row) => (
                    <tr key={row.market} className="border-t border-gray-100 first:border-t-0">
                      <td className="py-2 text-gray-900 capitalize">{row.market}</td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.impressions.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.clicks.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {row.ctr}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
