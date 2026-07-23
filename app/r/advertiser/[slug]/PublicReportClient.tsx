// app/r/advertiser/[slug]/PublicReportClient.tsx
//
// Publication-themed advertiser dashboard. Header bar, gate button,
// and chart gradient all read from `theme.primaryColor`, so the
// same component renders RealtyLine navy for Austin advertisers
// and Newsline San Antonio purple for San Antonio.

'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PublicationTheme } from '@/lib/publication-theme';

// Lazy-load recharts (~320 kB) so it isn't shipped on first paint.
const DailyClicksAreaChart = dynamic(() => import('./DailyClicksAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
      Loading chart…
    </div>
  ),
});

import PageTitle from '@/components/ui/PageTitle';
interface PublicAdvertiser {
  id: number;
  name: string;
  slug: string;
}

interface PublicAnalyticsResponse {
  advertiser: { id: number; name: string; slug: string };
  range: { from: string; to: string };
  summary: {
    total_clicks: number;
    unique_sessions: number;
    hotspot_count: number;
    avg_clicks_per_day: number;
    top_day: { date: string; clicks: number } | null;
  };
  daily_clicks: Array<{ date: string; clicks: number }>;
  hotspot_breakdown: Array<{
    magazine_label: string;
    page_idx: number;
    label: string | null;
    config_url: string | null;
    clicks: number;
    unique_sessions: number;
  }>;
}

type Props = {
  advertiser: PublicAdvertiser;
  theme: PublicationTheme;
  shareToken?: string;
};

type RangePreset = '7d' | '30d' | '90d' | 'all';

function getRangeDates(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  let from = new Date(to);
  if (preset === '7d') from.setUTCDate(from.getUTCDate() - 6);
  else if (preset === '30d') from.setUTCDate(from.getUTCDate() - 29);
  else if (preset === '90d') from.setUTCDate(from.getUTCDate() - 89);
  else from = new Date('2024-01-01T00:00:00Z');
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeLabel(p: RangePreset): string {
  if (p === 'all') return 'All time';
  if (p === '7d') return 'Last 7 days';
  if (p === '30d') return 'Last 30 days';
  return 'Last 90 days';
}

export default function PublicReportClient({ advertiser, theme, shareToken }: Props) {
  return <Dashboard advertiser={advertiser} theme={theme} shareToken={shareToken} />;
}

function Dashboard({
  advertiser, theme, shareToken,
}: { advertiser: PublicAdvertiser; theme: PublicationTheme; shareToken?: string }) {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [data, setData] = useState<PublicAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: RangePreset) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getRangeDates(p);
      const qs = new URLSearchParams({ from, to });
      if (shareToken) qs.set('t', shareToken);
      const res = await fetch(`/api/r/advertiser/${advertiser.slug}/analytics?${qs}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setData(d as PublicAnalyticsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [advertiser.slug, shareToken]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(preset); }, [load, preset]);

  // Unique gradient ID per publication to avoid SVG defs collisions
  const gradientId = `clicksGradient-${theme.id}`;

  return (
    <div className="min-h-screen bg-white">
      <div style={{ backgroundColor: theme.primaryColor }} className="text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-sm font-medium">{theme.name} &middot; Advertiser Report</div>
          <div className="text-xs opacity-75">{advertiser.name}</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <PageTitle size="md">{advertiser.name}</PageTitle>
            <p className="text-sm text-gray-500 mt-1">Performance report</p>
          </div>
          <div className="flex gap-1">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={
                  'px-3 py-1.5 text-sm font-medium rounded-md ' +
                  (preset === p
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50')
                }
              >
                {rangeLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-12 text-gray-500">Loading your report…</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total clicks" value={data.summary.total_clicks.toLocaleString()} />
              <StatCard label="Unique readers" value={data.summary.unique_sessions.toLocaleString()} />
              <StatCard label="Active placements" value={data.summary.hotspot_count.toLocaleString()} />
              <StatCard
                label="Avg / day"
                value={data.summary.avg_clicks_per_day.toString()}
                sub={data.summary.top_day
                  ? `Best: ${formatDate(data.summary.top_day.date)} (${data.summary.top_day.clicks})`
                  : undefined}
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-md p-4 mb-6">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Clicks per day</h2>
              <div className="w-full h-64">
                <DailyClicksAreaChart
                  data={data.daily_clicks}
                  primaryColor={theme.primaryColor}
                  gradientId={gradientId}
                  formatDate={formatDate}
                />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-700">Where your readers clicked</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-600">
                    <th className="px-4 py-2">Issue / Page</th>
                    <th className="px-4 py-2">Linked to</th>
                    <th className="px-4 py-2 text-right">Clicks</th>
                    <th className="px-4 py-2 text-right">Unique</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hotspot_breakdown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                        No active placements yet. Your report will populate once ads go live.
                      </td>
                    </tr>
                  )}
                  {data.hotspot_breakdown.map((h, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="text-gray-900">{h.magazine_label}</div>
                        <div className="text-xs text-gray-500">
                          Page {h.page_idx + 1}{h.label ? ` · ${h.label}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {h.config_url ? (
                          <a
                            href={h.config_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                            title={h.config_url}
                          >
                            {h.config_url.replace(/^https?:\/\//, '').slice(0, 50)}
                            {h.config_url.length > 50 ? '…' : ''}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-900 font-medium text-right">{h.clicks}</td>
                      <td className="px-4 py-2 text-gray-700 text-right">{h.unique_sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500 text-center mt-8">
              Powered by {theme.name} · Data updates in real time as ads are viewed.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
