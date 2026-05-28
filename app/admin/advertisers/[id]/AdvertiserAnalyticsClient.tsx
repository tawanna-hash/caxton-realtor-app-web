// app/admin/advertisers/[id]/AdvertiserAnalyticsClient.tsx
//
// Per-advertiser drill-down dashboard with:
//   - 4 stat cards
//   - Recharts area chart (daily clicks)
//   - Hotspot breakdown table
//   - "Send report email" button → modal with preview + send
//
// The Send-report feature sends a branded HTML email to the advertiser's
// contact_email via Resend, scoped to the date range currently displayed.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [reportModalOpen, setReportModalOpen] = useState(false);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(preset); }, [load, preset]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
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
            <div className="flex gap-2 items-center flex-wrap">
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
              <button
                type="button"
                onClick={() => setReportModalOpen(true)}
                className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Send report email
              </button>
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

      {reportModalOpen && (
        <SendReportModal
          advertiser={advertiser}
          rangePreset={preset}
          rangeLabel={rangeLabel(preset)}
          onClose={() => setReportModalOpen(false)}
        />
      )}
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

/**
 * Modal for previewing + sending an advertiser performance report email.
 * Inherits the date range from the parent dashboard view.
 */
function SendReportModal({
  advertiser, rangePreset, rangeLabel: rangeLabelText, onClose,
}: {
  advertiser: Advertiser;
  rangePreset: RangePreset;
  rangeLabel: string;
  onClose: () => void;
}) {
  const [personalMessage, setPersonalMessage] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'error' | 'sent'; text?: string }>({ kind: 'idle' });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const hasRecipient = !!(advertiser.contact_email && advertiser.contact_email.trim());

  const callApi = useCallback(async (preview: boolean): Promise<{
    html?: string; text?: string; sent?: boolean; recipient?: string | null; error?: string;
  }> => {
    const { from, to } = getRangeDates(rangePreset);
    const res = await fetch(`/api/admin/advertisers/${advertiser.id}/send-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, message: personalMessage, preview }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || body.detail || `HTTP ${res.status}`);
    return body;
  }, [advertiser.id, rangePreset, personalMessage]);

  const onPreview = useCallback(async () => {
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      const body = await callApi(true);
      setPreviewHtml(body.html || '');
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'preview failed' });
    } finally {
      setBusy(false);
    }
  }, [callApi]);

  const onCopyHtml = useCallback(async () => {
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      const body = await callApi(true);
      await navigator.clipboard.writeText(body.html || '');
      setStatus({ kind: 'sent', text: 'HTML copied to clipboard' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'copy failed' });
    } finally {
      setBusy(false);
    }
  }, [callApi]);

  const onSend = useCallback(async () => {
    if (!hasRecipient) return;
    if (!window.confirm(`Send report to ${advertiser.contact_email}?`)) return;
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      await callApi(false);
      setStatus({ kind: 'sent', text: `Sent to ${advertiser.contact_email}` });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'send failed' });
    } finally {
      setBusy(false);
    }
  }, [callApi, hasRecipient, advertiser.contact_email]);

  // Write previewHtml into the iframe whenever it updates
  useEffect(() => {
    if (!previewHtml || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Send performance report</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-gray-500">To:</span>{' '}
              {hasRecipient
                ? <span className="text-gray-900 font-medium">{advertiser.contact_email}</span>
                : <span className="text-amber-700">No contact email set &mdash; edit the advertiser to add one before sending.</span>}
            </div>

            <div className="text-sm">
              <span className="text-gray-500">Range:</span>{' '}
              <span className="text-gray-900">{rangeLabelText}</span>
              <span className="text-xs text-gray-400 ml-2">(matches the dashboard view)</span>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-600 mb-1">
                Personal note <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <textarea
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                rows={3}
                disabled={busy}
                placeholder="e.g. Hi — here's your monthly performance snapshot. Let me know if you'd like to discuss results."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {status.kind === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
                {status.text}
              </div>
            )}
            {status.kind === 'sent' && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
                ✓ {status.text}
              </div>
            )}

            {previewHtml && (
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-600 mb-1">Preview</div>
                <div className="border border-gray-300 rounded overflow-hidden bg-gray-100">
                  <iframe
                    ref={iframeRef}
                    title="Report preview"
                    className="w-full h-96 bg-white"
                    sandbox=""
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onPreview}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={onCopyHtml}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Copy HTML
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !hasRecipient}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  );
}
