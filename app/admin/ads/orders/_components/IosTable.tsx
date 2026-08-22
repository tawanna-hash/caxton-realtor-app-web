'use client';

// app/admin/ads/orders/_components/IosTable.tsx
//
// Standalone table for /admin/ads/orders?view=ios.
// Fetches GET /api/admin/insertion-orders and renders a purpose-built
// column set (IO number, advertiser, channel, flight, total, status,
// actions). URL-synced filters: channel, status, search.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AD_CHANNELS, AD_CHANNEL_LABEL, type AdChannel } from '@/lib/ad-channels';
import {
  IO_STATUS_LABEL,
  IO_STATUS_VALUES,
  type InsertionOrderWithAdvertiser,
  type IoStatus,
} from '@/lib/insertion-orders';

type ChannelTab = 'all' | AdChannel;
const CHANNEL_TABS: readonly ChannelTab[] = ['all', ...AD_CHANNELS] as const;

const STATUS_BADGE: Record<IoStatus, string> = {
  draft:        'bg-gray-100 text-gray-700 border-gray-200',
  sent:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  acknowledged: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  active:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  fulfilled:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:    'bg-gray-100 text-gray-500 border-gray-200',
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function IosTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const channelParam = params.get('channel');
  const activeChannel: ChannelTab =
    channelParam && (CHANNEL_TABS as readonly string[]).includes(channelParam)
      ? (channelParam as ChannelTab)
      : 'all';

  const statusParam = params.get('status');
  const activeStatus: IoStatus | 'all' =
    statusParam && (IO_STATUS_VALUES as readonly string[]).includes(statusParam)
      ? (statusParam as IoStatus)
      : 'all';

  const q = params.get('q') ?? '';
  const [qInput, setQInput] = useState(q);
  const [rows, setRows] = useState<InsertionOrderWithAdvertiser[]>([]);
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
    if (q) sp.set('q', q);
    return sp.toString();
  }, [activeChannel, activeStatus, q]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/insertion-orders${queryString ? `?${queryString}` : ''}`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { rows: InsertionOrderWithAdvertiser[] };
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

  async function transition(id: string, status: IoStatus) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/insertion-orders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { io: InsertionOrderWithAdvertiser };
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...data.io } : row)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'transition failed');
    } finally {
      setBusyId(null);
    }
  }

  async function sendIo(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/insertion-orders/${id}/send`, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { io: InsertionOrderWithAdvertiser };
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...data.io } : row)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'send failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Channel tab strip */}
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

      {/* Status + search row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          value={activeStatus}
          onChange={(e) => setUrl({ status: e.target.value === 'all' ? null : e.target.value })}
        >
          <option value="all">Any status</option>
          {IO_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {IO_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search IO number, notes, advertiser…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setUrl({ q: qInput || null });
          }}
          className="flex-1 min-w-[240px] rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setUrl({ q: qInput || null })}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Search
        </button>
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
            <li className="px-3 py-6 text-center text-sm text-gray-500">No insertion orders yet.</li>
          ) : (
            rows.map((io) => (
              <li key={`m-${io.id}`} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-700">{io.io_number}</span>
                      <span className={'inline-block px-2 py-0.5 rounded border text-[10px] font-medium ' + STATUS_BADGE[io.status]}>
                        {IO_STATUS_LABEL[io.status]}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 mt-1.5 truncate">{io.advertiser_name ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0 text-sm font-medium tabular-nums text-gray-900">
                    {formatMoney(io.total_cents)}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500">Channel</dt>
                  <dd className="text-gray-700 capitalize">{io.channel}</dd>
                  <dt className="text-gray-500">Publication</dt>
                  <dd className="text-gray-700">{io.publication ?? '—'}</dd>
                  <dt className="text-gray-500">Flight</dt>
                  <dd className="text-gray-700">{formatDate(io.flight_start)} → {formatDate(io.flight_end)}</dd>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1">
                  <a
                    href={`/api/admin/insertion-orders/${io.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 rounded-md"
                  >
                    PDF
                  </a>
                  {io.status === 'draft' && (
                    <button type="button" disabled={busyId === io.id} onClick={() => sendIo(io.id)} className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">Send</button>
                  )}
                  {io.status === 'sent' && (
                    <button type="button" disabled={busyId === io.id} onClick={() => transition(io.id, 'acknowledged')} className="text-xs px-2 py-1 rounded border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">Ack</button>
                  )}
                  {io.status === 'acknowledged' && (
                    <button type="button" disabled={busyId === io.id} onClick={() => transition(io.id, 'active')} className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Activate</button>
                  )}
                  {io.status === 'active' && (
                    <button type="button" disabled={busyId === io.id} onClick={() => transition(io.id, 'fulfilled')} className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Fulfill</button>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">IO #</th>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Publication</th>
                <th className="px-3 py-2">Flight</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                    No insertion orders yet.
                  </td>
                </tr>
              ) : (
                rows.map((io) => (
                  <tr key={io.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{io.io_number}</td>
                    <td className="px-3 py-2">{io.advertiser_name ?? '—'}</td>
                    <td className="px-3 py-2 capitalize">{io.channel}</td>
                    <td className="px-3 py-2">{io.publication ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {formatDate(io.flight_start)} → {formatDate(io.flight_end)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(io.total_cents)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'inline-block px-2 py-0.5 rounded border text-xs font-medium ' +
                          STATUS_BADGE[io.status]
                        }
                      >
                        {IO_STATUS_LABEL[io.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <a
                          href={`/api/admin/insertion-orders/${io.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 rounded-md"
                        >
                          PDF
                        </a>
                        {io.status === 'draft' && (
                          <button
                            type="button"
                            disabled={busyId === io.id}
                            onClick={() => sendIo(io.id)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            Send
                          </button>
                        )}
                        {io.status === 'sent' && (
                          <button
                            type="button"
                            disabled={busyId === io.id}
                            onClick={() => transition(io.id, 'acknowledged')}
                            className="text-xs px-2 py-1 rounded border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            Ack
                          </button>
                        )}
                        {io.status === 'acknowledged' && (
                          <button
                            type="button"
                            disabled={busyId === io.id}
                            onClick={() => transition(io.id, 'active')}
                            className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Activate
                          </button>
                        )}
                        {io.status === 'active' && (
                          <button
                            type="button"
                            disabled={busyId === io.id}
                            onClick={() => transition(io.id, 'fulfilled')}
                            className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Fulfill
                          </button>
                        )}
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
