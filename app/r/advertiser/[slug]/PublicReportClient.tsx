// app/r/advertiser/[slug]/PublicReportClient.tsx
//
// Renders either the email-gate form (when GATED + no cookie yet) or the
// full performance dashboard. Single client component, two views.

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';

interface PublicAdvertiser {
  id: number;
  name: string;
  slug: string;
  requires_email_gate: boolean;
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
  mode: 'dashboard' | 'email_gate';
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

export default function PublicReportClient({ advertiser, mode, shareToken }: Props) {
  if (mode === 'email_gate') {
    if (!shareToken) {
      // Defensive — server should never get here without share_token.
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-sm text-gray-500">Invalid access link.</p>
        </div>
      );
    }
    return <EmailGate advertiser={advertiser} shareToken={shareToken} />;
  }
  return <Dashboard advertiser={advertiser} shareToken={shareToken} />;
}

function EmailGate({ advertiser, shareToken }: { advertiser: PublicAdvertiser; shareToken: string }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/r/advertiser/${advertiser.slug}/request-access?t=${encodeURIComponent(shareToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [email, advertiser.slug, shareToken]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{advertiser.name}</h1>
          <p className="text-sm text-gray-600 mb-6">
            Performance report — sign in with your email to view.
          </p>

          {success ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded text-sm text-green-800">
              <p className="font-medium">Check your inbox.</p>
              <p className="mt-1">
                If your email is on file, you&apos;ll receive a sign-in link.
                It expires in 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs uppercase tracking-wider text-gray-600 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={submitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full bg-[#021D40] text-white py-2 rounded font-medium disabled:opacity-50 hover:bg-[#03285a] transition"
              >
                {submitting ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          )}
        </div>
        <p className="text-xs text-gray-500 text-center mt-4">
          Powered by Realty News Now
        </p>
      </div>
    </div>
  );
}

function Dashboard({ advertiser, shareToken }: { advertiser: PublicAdvertiser; shareToken?: string }) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#021D40] text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-sm font-medium">Realty News Now · Advertiser Report</div>
          <div className="text-xs opacity-75">{advertiser.name}</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{advertiser.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Performance report</p>
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
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

            <div className="bg-white border border-gray-200 rounded p-4 mb-6">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Clicks per day</h2>
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily_clicks} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
                    <defs>
                      <linearGradient id="publicClicksGradient" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#publicClicksGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded overflow-hidden">
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
              Powered by Realty News Now · Data updates in real time as ads are viewed.
            </p>
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
