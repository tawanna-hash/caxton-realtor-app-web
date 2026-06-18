'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AD_CHANNELS,
  AD_CHANNEL_LABEL,
  isAdChannel,
  type AdChannel,
} from '@/lib/ad-channels';
import type {
  OrderRow,
  OrderSource,
  OrderStatus,
} from '@/lib/server/orders-store';

type ChannelTab = 'all' | AdChannel;

const CHANNEL_TABS: readonly ChannelTab[] = ['all', ...AD_CHANNELS] as const;

const STATUSES: readonly OrderStatus[] = [
  'draft',
  'sent',
  'signed',
  'active',
  'expired',
  'cancelled',
  'paid',
] as const;

const SOURCES: readonly OrderSource[] = ['campaign', 'agreement'] as const;

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-amber-100 text-amber-800',
  signed: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
  paid: 'bg-emerald-100 text-emerald-900',
};

const CHANNEL_BADGE_CLASS: Record<AdChannel, string> = {
  print: 'bg-rose-50 text-rose-800 border-rose-200',
  digital: 'bg-sky-50 text-sky-800 border-sky-200',
  email: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

const SOURCE_LABEL: Record<OrderSource, string> = {
  campaign: 'Self-serve',
  agreement: 'Agreement',
};

interface ApiResponse {
  rows: OrderRow[];
  counts: Record<AdChannel | 'all', number>;
}

function fmtCents(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Friendly label for the PUB column. Campaigns + agreements store either
// the legacy enum ('austin' | 'san_antonio' | 'both') or, for new multi-
// market bookings, a comma-joined pub-key list (e.g. 'realtyline,newsline-
// houston'). Render either format as the publication brand the team uses
// day-to-day.
function fmtPublication(v: string | null): string {
  if (!v) return '—';
  // Legacy single-value enums.
  switch (v) {
    case 'austin':       return 'RealtyLine Austin';
    case 'san_antonio':  return 'Newsline San Antonio';
    case 'both':         return 'Both';
  }
  // New comma-joined pub-key list — map each key to its short brand name.
  if (v.includes(',')) {
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    const labels = parts.map((key) => {
      switch (key) {
        case 'realtyline':         return 'Austin';
        case 'newsline':           return 'San Antonio';
        case 'realtyline-houston': return 'Houston';
        case 'realtyline-dallas':  return 'Dallas/FTW';
        default:                   return key;
      }
    });
    return labels.join(' + ');
  }
  // Single new-style pub key.
  switch (v) {
    case 'realtyline':         return 'RealtyLine Austin';
    case 'newsline':           return 'Newsline San Antonio';
    case 'realtyline-houston': return 'RealtyLine Houston';
    case 'realtyline-dallas':  return 'RealtyLine Dallas/FTW';
  }
  return v;
}

function detailHref(row: OrderRow): string {
  // Campaigns live under /admin/ads (with the campaigns tab + detail edit
  // route). Agreements live in /admin/agreements; the sign flow runs
  // out of /admin/billing/sign/[token]. Invoices are at /admin/invoices.
  if (row.source === 'campaign') {
    return `/admin/ads/campaigns/${encodeURIComponent(row.id)}`;
  }
  return `/admin/agreements?agreement=${encodeURIComponent(row.id)}`;
}

export default function OrdersTable() {
  const router = useRouter();
  const params = useSearchParams();

  const channelParam = params.get('channel');
  const sourceParam = params.get('source');
  const statusParam = params.get('status');
  const q = params.get('q') ?? '';

  const activeChannel: ChannelTab =
    channelParam === 'all' || (channelParam && isAdChannel(channelParam))
      ? (channelParam as ChannelTab)
      : 'all';

  const activeSource: OrderSource | 'all' =
    sourceParam && (SOURCES as readonly string[]).includes(sourceParam)
      ? (sourceParam as OrderSource)
      : 'all';

  const activeStatus: OrderStatus | 'all' =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as OrderStatus)
      : 'all';

  const [qInput, setQInput] = useState<string>(q);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/admin/ads/orders${sp.toString() ? `?${sp.toString()}` : ''}`);
    },
    [router, params],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== q) setUrl({ q: qInput || null });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, setUrl]);

  const fetchUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (activeChannel !== 'all') sp.set('channel', activeChannel);
    if (activeSource !== 'all') sp.set('source', activeSource);
    if (activeStatus !== 'all') sp.set('status', activeStatus);
    if (q) sp.set('q', q);
    sp.set('limit', '200');
    return `/api/admin/ads/orders${sp.toString() ? `?${sp.toString()}` : ''}`;
  }, [activeChannel, activeSource, activeStatus, q]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    // Same pattern as the inquiries inbox — refetch on filter change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  return (
    <div>
      {/* Channel tabs with counts */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex gap-6 flex-wrap" aria-label="Channel tabs">
          {CHANNEL_TABS.map((c) => {
            const active = activeChannel === c;
            const label = c === 'all' ? 'All channels' : AD_CHANNEL_LABEL[c];
            const count = data?.counts?.[c] ?? 0;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setUrl({ channel: c === 'all' ? null : c })}
                className={`py-3 border-b-2 text-sm font-medium transition ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
                <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Filter row: source + status + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setUrl({ source: null })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              activeSource === 'all'
                ? 'bg-[#E06100] text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            Any source
          </button>
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setUrl({ source: s })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                activeSource === s
                  ? 'bg-[#E06100] text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setUrl({ status: null })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              activeStatus === 'all'
                ? 'bg-[#E06100] text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
            }`}
          >
            Any status
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setUrl({ status: s })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition ${
                activeStatus === s
                  ? 'bg-[#E06100] text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search advertiser, slot, size…"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        {loading && !data ? (
          <div className="p-8 text-sm text-gray-600 text-center">Loading…</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="p-8 text-sm text-gray-600 text-center">
            No orders match this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Advertiser</th>
                  <th className="px-4 py-2 font-medium">Slot / size</th>
                  <th className="px-4 py-2 font-medium">Pub</th>
                  <th className="px-4 py-2 font-medium">Dates</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium">Payment</th>
                  <th className="px-4 py-2 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row) => (
                  <tr key={`${row.source}:${row.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${CHANNEL_BADGE_CLASS[row.channel]}`}
                      >
                        {AD_CHANNEL_LABEL[row.channel]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {SOURCE_LABEL[row.source]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE_CLASS[row.status]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[220px]">
                        {row.advertiser_name ?? '—'}
                      </p>
                      {row.advertiser_email && (
                        <p className="text-xs text-gray-600 truncate max-w-[220px]">
                          {row.advertiser_email}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]">
                      {row.slot_or_size ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {fmtPublication(row.publication)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {fmtDate(row.start_date)}
                      {row.end_date ? ` – ${fmtDate(row.end_date)}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {fmtCents(row.amount_cents)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.paid_at ? (
                        <span className="text-green-700 font-medium">
                          Paid {fmtDate(row.paid_at)}
                        </span>
                      ) : row.stripe_payment_link_url ? (
                        <a
                          href={row.stripe_payment_link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          Stripe link ↗
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={detailHref(row)}
                        className="text-blue-700 hover:underline text-xs"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
