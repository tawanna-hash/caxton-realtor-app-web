// app/admin/reports/_components/AdvertiserDashboardPane.tsx
//
// Right-pane dashboard for the currently-selected advertiser in the
// Client Reports -> Advertisers tab. Renders KPIs, the daily-clicks area
// chart, and a hotspot breakdown table. Also exposes a "Send report
// email" button that opens the existing AdvertiserReportDrawer in edit
// mode so admins can preview + customize before sending.
//
// This is a direct extraction of the body of the old
// /admin/advertisers/[id] AdvertiserAnalyticsClient -- same data source,
// same shape, same recharts gradient -- so the combined view has full
// parity with the standalone page it replaces.

'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import AdvertiserReportDrawer from './AdvertiserReportDrawer';

type RangePreset = '7d' | '30d' | '90d' | 'all';

interface PaneAdvertiser {
  id: number;
  name: string;
  slug: string;
  contact_email: string | null;
  publication: 'austin' | 'san_antonio' | 'both';
}

interface AnalyticsResponse {
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

function presetDays(preset: RangePreset): 7 | 30 | 90 | 180 {
  if (preset === '7d') return 7;
  if (preset === '30d') return 30;
  if (preset === '90d') return 90;
  return 180; // "all" -> drawer falls back to its widest preset
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rangeLabel(preset: RangePreset): string {
  if (preset === 'all') return 'All time';
  if (preset === '7d') return 'Last 7 days';
  if (preset === '30d') return 'Last 30 days';
  return 'Last 90 days';
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

interface Props {
  advertiser: PaneAdvertiser;
}

export default function AdvertiserDashboardPane({ advertiser }: Props) {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Fetch analytics whenever the advertiser or the range preset changes.
  // The cancelled guard avoids setting state on a stale request when the
  // user switches advertisers quickly. setState calls are deferred via the
  // async IIFE so the lint rule for synchronous setState in effects is
  // satisfied.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = getRangeDates(preset);
        const qs = new URLSearchParams({ from, to });
        const res = await fetch(
          `/api/admin/analytics/advertiser/${advertiser.id}?${qs}`,
          { cache: 'no-store', credentials: 'include' },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const d = (await res.json()) as AnalyticsResponse;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [advertiser.id, preset]);

  // Unique gradient ID per advertiser so multiple panes don't collide on the
  // same Recharts <defs>.
  const gradientId = `clicksGradient-pane-${advertiser.id}`;

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Advertiser dashboard
          </p>
          <h2 className="text-lg font-semibold text-gray-900 truncate">{advertiser.name}</h2>
          <p className="text-xs text-gray-500 truncate">
            {advertiser.slug}
            {advertiser.contact_email ? ` · ${advertiser.contact_email}` : ''}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={
                  'px-3 py-1.5 text-xs font-medium rounded-md ' +
                  (preset === p
                    ? 'bg-[#021D40] text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50')
                }
              >
                {rangeLabel(p)}
              </button>
            ))}
          </div>
          {/* Edit button: opens the same drawer in edit mode so the admin
              can customize the date range and personal message before
              copying or sending. Unlike "Send report email", this button is
              available even when the advertiser has no contact email so
              the report can still be previewed/copied. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Edit the report's date range and personal message"
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={!advertiser.contact_email}
            title={advertiser.contact_email
              ? 'Preview and send the performance report email'
              : 'Add a contact email on the Advertisers page to send a report'}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#021D40] text-white hover:bg-[#03285a] disabled:opacity-40"
          >
            Send report email
          </button>
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
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

            <div className="bg-white border border-gray-200 rounded-md p-4 mb-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Clicks per day</h3>
              <div className="w-full h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.daily_clicks}
                    margin={{ top: 4, right: 12, bottom: 4, left: -10 }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
                      fill={`url(#${gradientId})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-700">Hotspot breakdown</h3>
              </div>
              <div className="overflow-x-auto">
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
            </div>
          </>
        )}
      </div>

      {drawerOpen ? (
        <AdvertiserReportDrawer
          advertiser={{
            id: advertiser.id,
            name: advertiser.name,
            contact_email: advertiser.contact_email,
          }}
          mode="edit"
          initialDays={presetDays(preset)}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}
