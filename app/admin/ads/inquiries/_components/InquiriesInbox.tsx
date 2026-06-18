'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AD_CHANNELS,
  AD_CHANNEL_LABEL,
  isAdChannel,
  type AdChannel,
} from '@/lib/ad-channels';
import type { AdInquiryRow, AdInquiryStatus } from '@/lib/server/ad-inquiries-store';
import InquiryDetail from './InquiryDetail';

type ChannelTab = 'all' | AdChannel;

const CHANNEL_TABS: readonly ChannelTab[] = ['all', ...AD_CHANNELS] as const;

const STATUSES: readonly AdInquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
  'spam',
] as const;

const STATUS_LABEL: Record<AdInquiryStatus, string> = {
  new: 'New',
  replied: 'Replied',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  spam: 'Spam',
};

const STATUS_BADGE_CLASS: Record<AdInquiryStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  replied: 'bg-amber-100 text-amber-800',
  quoted: 'bg-violet-100 text-violet-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-gray-100 text-gray-700',
  spam: 'bg-red-100 text-red-800',
};

const CHANNEL_BADGE_CLASS: Record<AdChannel, string> = {
  print: 'bg-rose-50 text-rose-800 border-rose-200',
  digital: 'bg-sky-50 text-sky-800 border-sky-200',
  email: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

interface InboxResponse {
  rows: AdInquiryRow[];
  total: number;
  limit: number;
  offset: number;
  unread: {
    all: number;
    print: number;
    digital: number;
    email: number;
  };
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function InquiriesInbox() {
  const router = useRouter();
  const params = useSearchParams();

  // URL-driven filter state — channel + status + q. Default to "all + new".
  const channelParam = params.get('channel');
  const statusParam = params.get('status');
  const q = params.get('q') ?? '';
  const selectedId = params.get('id') ?? '';

  const activeChannel: ChannelTab =
    channelParam === 'all' || (channelParam && isAdChannel(channelParam))
      ? (channelParam as ChannelTab)
      : 'all';

  const activeStatus: AdInquiryStatus | 'all' =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as AdInquiryStatus)
      : 'all';

  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local q input — debounced into the URL so users can type freely.
  const [qInput, setQInput] = useState<string>(q);

  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/admin/ads/inquiries${sp.toString() ? `?${sp.toString()}` : ''}`);
    },
    [router, params],
  );

  // Push qInput into URL after 300ms of stillness.
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== q) setUrl({ q: qInput || null });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, setUrl]);

  const fetchUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (activeChannel !== 'all') sp.set('channel', activeChannel);
    if (activeStatus !== 'all') sp.set('status', activeStatus);
    if (q) sp.set('q', q);
    sp.set('limit', '100');
    return `/api/admin/ads/inquiries${sp.toString() ? `?${sp.toString()}` : ''}`;
  }, [activeChannel, activeStatus, q]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const json = (await res.json()) as InboxResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    // Refetch on filter change. The state writes happen inside refetch's
    // async body, which fires after the effect returns, so the cascading-
    // render warning is a false positive here — same pattern as the
    // sibling /admin/ads dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  const handleInquiryUpdated = useCallback(
    (updated: AdInquiryRow) => {
      // Patch the row in-place so the table reflects the new status
      // without a full refetch, then re-pull badges in the background.
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) => (r.id === updated.id ? updated : r)),
            }
          : prev,
      );
      refetch();
    },
    [refetch],
  );

  const handleInquiryDeleted = useCallback(
    (deletedId: string) => {
      // Drop the row optimistically so the detail pane closes and the
      // list collapses by one. The follow-up refetch refreshes badge
      // counts and pulls in any newer rows from the server.
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.filter((r) => r.id !== deletedId),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
      // Clear the ?id= param so the URL no longer points at the deleted row.
      setUrl({ id: null });
      refetch();
    },
    [refetch, setUrl],
  );

  const selectedInquiry = useMemo(
    () => data?.rows.find((r) => r.id === selectedId) ?? null,
    [data, selectedId],
  );

  return (
    <div>
      {/* Channel tabs with unread (new) counts. */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex gap-6 flex-wrap" aria-label="Channel tabs">
          {CHANNEL_TABS.map((c) => {
            const active = activeChannel === c;
            const label = c === 'all' ? 'All channels' : AD_CHANNEL_LABEL[c];
            const count = data?.unread?.[c] ?? 0;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setUrl({ channel: c === 'all' ? null : c, id: null })}
                className={`py-3 border-b-2 text-sm font-medium transition ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
                {count > 0 && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Status pipeline + search row. */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
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
            All statuses
          </button>
          {STATUSES.map((s) => {
            const active = activeStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setUrl({ status: s })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? 'bg-[#E06100] text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search name, email, company…"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-2 rounded-md mb-4">
          {error}
        </div>
      )}

      {/* Two-column layout: list on the left, detail drawer on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
        {/* List */}
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          {loading && !data ? (
            <div className="p-8 text-sm text-gray-600 text-center">Loading…</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-8 text-sm text-gray-600 text-center">
              No inquiries match this view.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setUrl({ id: row.id })}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                        selected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${CHANNEL_BADGE_CLASS[row.channel]}`}
                        >
                          {AD_CHANNEL_LABEL[row.channel]}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE_CLASS[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                        {row.takeover && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-orange-100 text-orange-800">
                            Takeover
                          </span>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                          {formatRelative(row.created_at)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {row.name}
                        </p>
                        {row.company && (
                          <p className="text-xs text-gray-600 truncate">
                            {row.company}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-700 mt-0.5">{row.email}</p>
                      {row.slot_label && (
                        <p className="text-xs text-gray-600 mt-1 truncate">
                          → {row.slot_label}
                        </p>
                      )}
                      <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                        {row.message}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.total > data.rows.length && (
            <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-100">
              Showing {data.rows.length} of {data.total}. Refine filters to see more.
            </div>
          )}
        </div>

        {/* Detail drawer */}
        <div className="bg-white border border-gray-200 rounded-md p-5 lg:sticky lg:top-4 lg:self-start">
          {selectedInquiry ? (
            <InquiryDetail
              key={selectedInquiry.id}
              inquiry={selectedInquiry}
              onUpdated={handleInquiryUpdated}
              onDeleted={handleInquiryDeleted}
              onClose={() => setUrl({ id: null })}
            />
          ) : (
            <div className="text-sm text-gray-600 text-center py-12">
              Select an inquiry from the list to reply, assign, or change status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
