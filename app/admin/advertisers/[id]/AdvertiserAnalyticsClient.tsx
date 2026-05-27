// app/admin/advertisers/[id]/AdvertiserAnalyticsClient.tsx
//
// Interactive analytics dashboard for one advertiser. Reads the
// /api/admin/analytics/advertiser/:id endpoint, lets the admin
// switch date ranges, and renders:
//  - Four headline stat cards
//  - Daily clicks area chart (recharts)
//  - Per-hotspot breakdown table

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';
import type { Advertiser } from '@/lib/advertisers';

interface AnalyticsResponse {
  advertiser: Advertiser;
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
    hotspot_id: number;
    magazine_id: number;
    magazine_label: string;
    page_idx: number;
    label: string | null;
    type: string;
    config_url: string | null;
    is_published: boolean;
    clicks: number;
    unique_sessions: number;
  }>;
}

type RangePreset = '7d' | '30d' | '90d' | 'all';

function getRangeDates(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  let from = new Date(to);
  if (preset === '7d') from.setUTCDate(from.getUTCDate() - 6);
  else if (preset === '30d') from.setUTCDate(from.getUTCDate() - 29);
  else if (preset === '90d') from.setUTCDate(from.getUTCDate() - 89);
  else if (preset === 'all') from = new Date('2024-01-01T00:00:00Z');
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeLabel(preset: RangePreset): string {
  if (preset === 'all') return 'All time';
  if (preset === '7d') return 'Last 7 days';
  if (preset === '30d') return 'Last 30 days';
  return 'Last 90 days';
}

export default function AdvertiserAnalyticsClient({ advertiser }: { advertiser: Advertiser }) {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: RangePreset) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getRangeDates(p);
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/analytics/advertiser/${advertiser.id}?${qs}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setData(d as AnalyticsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [advertiser.id]);

  // Data-fetch effect; setLoading inside `load` is intentional.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(preset); }, [load, preset]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/advertisers"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← All advertisers
          </Link>
          <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{advertiser.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {advertiser.slug}
                {advertiser.contact_email ? ` · ${advertiser.contact_email}` : ''}
              </p>
            </div>
            <div className="flex gap-1">
              {(['7d', '30d', '90d', 'all'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={
                    'px-3 py-1.5 text-sm font-medium rounded ' +
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
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-12 text-gray-500">Loading…</div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total clicks" value={data.summary.total_clicks.toLocaleString()} />
              <StatCard label="Unique sessions" value={data.summary.unique_sessions.toLocaleString()} />
              <StatCard label="Hotspots" value={data.summary.hotspot_count.toLocaleString()} />
              <StatCard
                label="Avg / day"
                value={data.summary.avg_clicks_per_day.toString()}
                sub={data.summary.top_day
                  ? `Best: ${formatDate(data.summary.top_day.date)} (${data.summary.top_day.clicks})`
                  : undefined}
              />
            </div>

            {/* Chart */}
            <div className="bg-white border border-gray-200 rounded p-4 mb-6">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Clicks per day</h2>
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.daily_clicks}
                    margin={{ top: 4, right: 12, bottom: 4, left: -10 }}
                  >
                    <defs>
                      <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#021D40" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#021D40" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={formatDate}
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={(label) => formatDate(String(label))}
                      contentStyle={{
                        fontSize: 12,
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: 4,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      stroke="#021D40"
                      strokeWidth={2}
                      fill="url(#clicksGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hotspot breakdown */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-700">Hotspot breakdown</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-600">
                    <th className="px-4 py-2">Issue / Page</th>
                    <th className="px-4 py-2">Label</th>
                    <th className="px-4 py-2">URL</th>
                    <th className="px-4 py-2 text-right">Clicks</th>
                    <th className="px-4 py-2 text-right">Unique</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hotspot_breakdown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        No hotspots linked to this advertiser yet.
                      </td>
                    </tr>
                  )}
                  {data.hotspot_breakdown.map((h) => (
                    <tr key={h.hotspot_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="text-gray-900">{h.magazine_label}</div>
                        <div className="text-xs text-gray-500">Page {h.page_idx + 1}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{h.label || '—'}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {h.config_url ? (
                          <a
                            href={h.config_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline truncate inline-block max-w-xs"
                            title={h.config_url}
                          >
                            {h.config_url.replace(/^https?:\/\//, '').slice(0, 60)}
                            {h.config_url.length > 60 ? '…' : ''}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-900 font-medium text-right">{h.clicks}</td>
                      <td className="px-4 py-2 text-gray-700 text-right">{h.unique_sessions}</td>
                      <td className="px-4 py-2">
                        {h.is_published
                          ? <span className="text-xs text-green-700">live</span>
                          : <span className="text-xs text-amber-700">draft</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
