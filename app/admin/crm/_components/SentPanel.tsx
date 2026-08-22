'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type SentRow = {
  id: string;
  subject: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  recurrence_interval_days: number | null;
  recurrence_until: string | null;
  recurrence_parent_id: string | null;
  from_name: string | null;
  reply_to: string | null;
  preview_text: string | null;
  recipient_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  runs_sent?: number | null;
  runs_total?: number | null;
  last_sent_at?: string | null;
  next_scheduled_for?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
};

type Props = {
  limit?: number;
  showFilters?: boolean;
  onEditResend?: (row: SentRow) => void;
};

function fmt(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return dt; }
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'sent' ? 'bg-green-100 text-green-800'
      : status === 'scheduled' ? 'bg-blue-100 text-blue-800'
        : status === 'sending' ? 'bg-yellow-100 text-yellow-800'
          : status === 'failed' ? 'bg-red-100 text-red-800'
            : status === 'cancelled' ? 'bg-gray-200 text-gray-700'
              : 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export default function SentPanel({ limit = 50, showFilters = true, onEditResend }: Props) {
  const [rows, setRows] = useState<SentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [recurring, setRecurring] = useState<'any' | 'series' | 'oneoff'>('any');
  const [group, setGroup] = useState<'flat' | 'series'>('flat');
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (recurring !== 'any') p.set('recurring', recurring);
    p.set('group', group);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return p.toString();
  }, [q, status, recurring, group, limit, offset]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/crm-email/sent?${query}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRows(j.rows ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'load failed'); }
    finally { setLoading(false); }
  }, [query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const doResend = useCallback(async (id: string) => {
    if (!confirm('Resend this email to the original audience as-is?')) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/crm-email/${id}/resend`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      alert(`Queued ${j.total ?? 0} recipients — sent ${j.sent ?? 0}, failed ${j.failed ?? 0}`);
      await load();
    } catch (e) { alert(`Resend failed: ${e instanceof Error ? e.message : 'unknown'}`); }
    finally { setBusyId(null); }
  }, [load]);

  const doCancelSeries = useCallback(async (id: string) => {
    if (!confirm('Cancel all future runs of this recurring series?')) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/crm-email/${id}/cancel-series`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      alert(`Cancelled ${j.cancelled} scheduled run(s).`);
      await load();
    } catch (e) { alert(`Cancel failed: ${e instanceof Error ? e.message : 'unknown'}`); }
    finally { setBusyId(null); }
  }, [load]);

  return (
    <div>
      {showFilters && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500">Search subject</label>
            <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}
              placeholder="Subject contains…"
              className="mt-1 w-64 rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
                    className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm">
              <option value="">Any</option>
              <option value="sent">Sent</option>
              <option value="scheduled">Scheduled</option>
              <option value="sending">Sending</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500">Type</label>
            <select value={recurring} onChange={(e) => { setRecurring(e.target.value as 'any' | 'series' | 'oneoff'); setOffset(0); }}
                    className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm">
              <option value="any">Any</option>
              <option value="oneoff">One-off</option>
              <option value="series">Recurring</option>
            </select>
          </div>
          <label className="ml-2 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={group === 'series'}
                   onChange={(e) => { setGroup(e.target.checked ? 'series' : 'flat'); setOffset(0); }} />
            Group recurring
          </label>
          <button type="button" onClick={() => void load()}
                  className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50">
            Refresh
          </button>
        </div>
      )}

      {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {/* mobile card list */}
      <ul className="sm:hidden divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading && <li className="px-3 py-6 text-center text-sm text-gray-500">Loading…</li>}
        {!loading && rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">No sent emails match your filters.</li>}
        {!loading && rows.map((row) => {
          const isSeries = row.recurrence_interval_days != null || row.recurrence_parent_id != null;
          return (
            <li key={`m-${row.id}`} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {row.subject || <em className="text-gray-400">no subject</em>}
                  </div>
                  {row.from_name && <div className="text-xs text-gray-500 truncate">from {row.from_name}</div>}
                  {row.preview_text && <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{row.preview_text}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={row.status} />
                  {isSeries && <div className="mt-1 text-[11px] text-purple-700">Recurring</div>}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-500">Recipients</dt>
                <dd className="text-gray-700 tabular-nums">
                  {row.recipient_count ?? '—'}
                  {row.sent_count != null && (
                    <span className="text-gray-500"> · {row.sent_count} sent{row.failed_count ? ` · ${row.failed_count} failed` : ''}</span>
                  )}
                </dd>
                <dt className="text-gray-500">{group === 'series' ? 'Last sent' : 'Sent at'}</dt>
                <dd className="text-gray-700">{fmt(group === 'series' ? (row.last_sent_at ?? row.sent_at) : (row.sent_at ?? row.scheduled_for))}</dd>
                {group === 'series' && (
                  <>
                    <dt className="text-gray-500">Next</dt>
                    <dd className="text-gray-700">{fmt(row.next_scheduled_for ?? null)}</dd>
                    <dt className="text-gray-500">Runs</dt>
                    <dd className="text-gray-700 tabular-nums">{row.runs_sent ?? 0}/{row.runs_total ?? 0}</dd>
                  </>
                )}
                <dt className="text-gray-500">Opens / Clicks</dt>
                <dd className="text-gray-700 tabular-nums">{row.open_count ?? 0} / {row.click_count ?? 0}</dd>
              </dl>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void doResend(row.id)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id || !onEditResend}
                  onClick={() => onEditResend?.(row)}
                  className="rounded-md border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-800 hover:bg-purple-100 disabled:opacity-50"
                >
                  Edit &amp; Resend
                </button>
                {isSeries && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void doCancelSeries(row.id)}
                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Cancel series
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Recipients</th>
              <th className="px-3 py-2">{group === 'series' ? 'Last sent' : 'Sent at'}</th>
              {group === 'series' && <th className="px-3 py-2">Next</th>}
              {group === 'series' && <th className="px-3 py-2">Runs</th>}
              <th className="px-3 py-2">Opens</th>
              <th className="px-3 py-2">Clicks</th>
              <th className="px-3 py-2">First opened</th>
              <th className="px-3 py-2">Last opened</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={group === 'series' ? 11 : 9} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={group === 'series' ? 11 : 9} className="px-3 py-6 text-center text-gray-500">No sent emails match your filters.</td></tr>
            )}
            {!loading && rows.map((row) => {
              const isSeries = row.recurrence_interval_days != null || row.recurrence_parent_id != null;
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{row.subject || <em className="text-gray-400">no subject</em>}</div>
                    {row.from_name && <div className="text-xs text-gray-500">from {row.from_name}</div>}
                    {row.preview_text && <div className="mt-1 line-clamp-1 text-xs text-gray-500">{row.preview_text}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                    {isSeries && <div className="mt-1 text-xs text-purple-700">Recurring</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.recipient_count ?? '—'}
                    {row.sent_count != null && (
                      <div className="text-xs text-gray-500">
                        {row.sent_count} sent{row.failed_count ? ` · ${row.failed_count} failed` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {fmt(group === 'series' ? (row.last_sent_at ?? row.sent_at) : (row.sent_at ?? row.scheduled_for))}
                  </td>
                  {group === 'series' && <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmt(row.next_scheduled_for ?? null)}</td>}
                  {group === 'series' && (
                    <td className="px-3 py-2 tabular-nums text-gray-700">
                      {row.runs_sent ?? 0}/{row.runs_total ?? 0}
                    </td>
                  )}
                  <td className="px-3 py-2 tabular-nums text-gray-700">{row.open_count ?? 0}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">{row.click_count ?? 0}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmt(row.first_opened_at ?? null)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmt(row.last_opened_at ?? null)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={busyId === row.id}
                        onClick={() => void doResend(row.id)}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                        title="Resend as-is to the original audience">Resend</button>
                      <button type="button" disabled={busyId === row.id || !onEditResend}
                        onClick={() => onEditResend?.(row)}
                        className="rounded-md border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-800 hover:bg-purple-100 disabled:opacity-50"
                        title="Open composer prefilled with this email">Edit &amp; Resend</button>
                      {isSeries && (
                        <button type="button" disabled={busyId === row.id}
                          onClick={() => void doCancelSeries(row.id)}
                          className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Stop all future runs of this recurring series">Cancel series</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showFilters && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <div>Showing {rows.length} row{rows.length === 1 ? '' : 's'} (offset {offset})</div>
          <div className="flex gap-2">
            <button type="button" disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-40">Prev</button>
            <button type="button" disabled={rows.length < limit}
                    onClick={() => setOffset(offset + limit)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
