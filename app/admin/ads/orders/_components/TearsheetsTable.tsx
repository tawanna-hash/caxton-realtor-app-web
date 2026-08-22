'use client';

// app/admin/ads/orders/_components/TearsheetsTable.tsx
//
// Standalone table for /admin/ads/orders?view=tearsheets.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AD_CHANNELS, AD_CHANNEL_LABEL, type AdChannel } from '@/lib/ad-channels';
import {
  TEARSHEET_STATUS_LABEL,
  TEARSHEET_STATUS_VALUES,
  type TearsheetWithAdvertiser,
  type TearsheetStatus,
} from '@/lib/insertion-orders';

type ChannelTab = 'all' | AdChannel;
const CHANNEL_TABS: readonly ChannelTab[] = ['all', ...AD_CHANNELS] as const;

const STATUS_BADGE: Record<TearsheetStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  ready:   'bg-blue-50 text-blue-700 border-blue-200',
  sent:    'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function TearsheetsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const channelParam = params.get('channel');
  const activeChannel: ChannelTab =
    channelParam && (CHANNEL_TABS as readonly string[]).includes(channelParam)
      ? (channelParam as ChannelTab)
      : 'all';

  const statusParam = params.get('status');
  const activeStatus: TearsheetStatus | 'all' =
    statusParam && (TEARSHEET_STATUS_VALUES as readonly string[]).includes(statusParam)
      ? (statusParam as TearsheetStatus)
      : 'all';

  const [rows, setRows] = useState<TearsheetWithAdvertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      const s = sp.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`);
    },
    [params, pathname, router],
  );

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (activeChannel !== 'all') sp.set('channel', activeChannel);
    if (activeStatus !== 'all') sp.set('status', activeStatus);
    return sp.toString();
  }, [activeChannel, activeStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/tearsheets${queryString ? `?${queryString}` : ''}`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { rows: TearsheetWithAdvertiser[] };
        if (!cancelled) {
          setRows(data.rows ?? []);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  async function sendTearsheet(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/tearsheets/${id}/send`, { method: 'POST' });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { tearsheet: TearsheetWithAdvertiser };
      setRows((prev) => prev.map((t) => (t.id === id ? { ...t, ...data.tearsheet } : t)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'send failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTearsheet(id: string) {
    if (!confirm('Delete this tearsheet?')) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/tearsheets/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-4">
        {CHANNEL_TABS.map((c) => {
          const isActive = activeChannel === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setUrl({ channel: c === 'all' ? null : c })}
              className={
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' +
                (isActive
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-500 border-transparent hover:text-gray-700')
              }
            >
              {c === 'all' ? 'All channels' : AD_CHANNEL_LABEL[c as AdChannel]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          value={activeStatus}
          onChange={(e) => setUrl({ status: e.target.value === 'all' ? null : e.target.value })}
        >
          <option value="all">Any status</option>
          {TEARSHEET_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {TEARSHEET_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
        {/* mobile card list */}
        <ul className="sm:hidden divide-y divide-gray-100 rounded-md border border-gray-200 bg-white overflow-hidden">
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-gray-500">No tearsheets yet.</li>
          ) : (
            rows.map((t) => (
              <li key={`m-${t.id}`} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{t.issue_label ?? '—'}</div>
                    <div className="text-xs text-gray-500">{formatDate(t.issue_date)}</div>
                    <p className="text-sm text-gray-800 mt-1 truncate">{t.advertiser_name ?? '—'}</p>
                  </div>
                  <span className={'inline-block px-2 py-0.5 rounded border text-[10px] font-medium ' + STATUS_BADGE[t.status]}>
                    {TEARSHEET_STATUS_LABEL[t.status]}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500">Channel</dt>
                  <dd className="text-gray-700 capitalize">{t.channel}</dd>
                  <dt className="text-gray-500">IO #</dt>
                  <dd className="text-gray-700 font-mono">{t.io_number ?? '—'}</dd>
                  <dt className="text-gray-500">File</dt>
                  <dd>
                    {t.file_url ? (
                      <a href={t.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View</a>
                    ) : (
                      <span className="text-gray-400">No file</span>
                    )}
                  </dd>
                  {t.sent_to && (
                    <>
                      <dt className="text-gray-500">Sent to</dt>
                      <dd className="text-gray-700 truncate">{t.sent_to}</dd>
                    </>
                  )}
                </dl>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.status !== 'sent' && t.file_url && (
                    <button type="button" disabled={busyId === t.id} onClick={() => sendTearsheet(t.id)} className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Send</button>
                  )}
                  <button type="button" disabled={busyId === t.id} onClick={() => deleteTearsheet(t.id)} className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">Delete</button>
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">IO #</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                    No tearsheets yet.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">
                        {t.issue_label ?? '—'}
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(t.issue_date)}</div>
                    </td>
                    <td className="px-3 py-2">{t.advertiser_name ?? '—'}</td>
                    <td className="px-3 py-2 capitalize">{t.channel}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.io_number ?? '—'}</td>
                    <td className="px-3 py-2">
                      {t.file_url ? (
                        <a
                          href={t.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">No file</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'inline-block px-2 py-0.5 rounded border text-xs font-medium ' +
                          STATUS_BADGE[t.status]
                        }
                      >
                        {TEARSHEET_STATUS_LABEL[t.status]}
                      </span>
                      {t.sent_to && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[160px]">
                          → {t.sent_to}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {t.status !== 'sent' && t.file_url && (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={() => sendTearsheet(t.id)}
                            className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Send
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => deleteTearsheet(t.id)}
                          className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
