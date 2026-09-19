'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import {
  AD_CHANNELS,
  AD_CHANNEL_LABEL,
  isAdChannel,
  type AdChannel,
} from '@/lib/ad-channels';
import type { BookedWindow } from '@/lib/server/availability-store';
import { PRINT_DEADLINES } from '@/lib/media-kit';
import { AD_OPS_CONTROL, AD_OPS_SECONDARY, AdOpsMetrics } from '../../_components/AdOpsUi';

type ChannelTab = 'all' | AdChannel;

const CHANNEL_TABS: readonly ChannelTab[] = ['all', ...AD_CHANNELS] as const;

const CHANNEL_BADGE_CLASS: Record<AdChannel, string> = {
  print: 'bg-rose-50 text-rose-800 border-rose-200',
  digital: 'bg-sky-50 text-sky-800 border-sky-200',
  email: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  app: 'bg-purple-50 text-purple-800 border-purple-200',
};

const CHANNEL_DOT_CLASS: Record<AdChannel, string> = {
  print: 'bg-rose-500',
  digital: 'bg-sky-500',
  email: 'bg-emerald-500',
  app: 'bg-purple-500',
};

interface ApiResponse {
  rows: BookedWindow[];
}

// ── date helpers ─────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year: number, month0: number): Date {
  return new Date(year, month0, 1);
}

function endOfMonth(year: number, month0: number): Date {
  return new Date(year, month0 + 1, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function detailHref(row: BookedWindow): string {
  if (row.source === 'campaign') {
    return `/admin/ads/campaigns/${encodeURIComponent(row.id)}`;
  }
  return `/admin/agreements?agreement=${encodeURIComponent(row.id)}`;
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Return the set of YYYY-MM-DD days touched by the booking within the
 * given month range. For email rows (start === end) this is a single day.
 */
function daysInRangeForMonth(
  row: BookedWindow,
  monthStart: Date,
  monthEnd: Date,
): Set<string> {
  const out = new Set<string>();
  const start = new Date(row.start_date);
  const end = new Date(row.end_date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const lo = start < monthStart ? new Date(monthStart) : start;
  const hi = end > monthEnd ? new Date(monthEnd) : end;
  const cursor = new Date(lo.getFullYear(), lo.getMonth(), lo.getDate());
  while (cursor <= hi) {
    out.add(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ── component ────────────────────────────────────────────────────────────

export default function AvailabilityCalendar() {
  const router = useRouter();
  const params = useSearchParams();

  const channelParam = params.get('channel');
  const activeChannel: ChannelTab =
    channelParam === 'all' || (channelParam && isAdChannel(channelParam))
      ? (channelParam as ChannelTab)
      : 'all';

  // Anchor month — defaults to today.
  const monthParam = params.get('month'); // YYYY-MM
  const today = new Date();
  const initial = (() => {
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  const [anchor, setAnchor] = useState<Date>(initial);
  const [rows, setRows] = useState<BookedWindow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const setUrl = useCallback(
    (next: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(
        `/admin/ads/availability${sp.toString() ? `?${sp.toString()}` : ''}`,
      );
    },
    [router, params],
  );

  // Query a 3-month window (prev / current / next) so prev/next nav feels
  // instant without refetching.
  const fetchUrl = useMemo(() => {
    const rangeStart = isoDay(addMonths(anchor, -1));
    const rangeEnd = isoDay(endOfMonth(anchor.getFullYear(), anchor.getMonth() + 1));
    const sp = new URLSearchParams();
    if (activeChannel !== 'all') sp.set('channel', activeChannel);
    sp.set('rangeStart', rangeStart);
    sp.set('rangeEnd', rangeEnd);
    return `/api/admin/ads/availability?${sp.toString()}`;
  }, [activeChannel, anchor]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const json = (await res.json()) as ApiResponse;
      setRows(json.rows ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    // Same eslint-disable as the inquiries inbox + orders table — refetch
    // is the canonical way to re-pull data when filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  // ── derived: month grid ────────────────────────────────────────────────

  const year = anchor.getFullYear();
  const month0 = anchor.getMonth();

  // Stable ISO bounds for the displayed month — using strings (not Date
  // objects) keeps React Compiler happy since Dates are mutable. We compare
  // by ISO string which is lexicographically equivalent for YYYY-MM-DD.
  const mStartIso = useMemo(() => isoDay(startOfMonth(year, month0)), [year, month0]);
  const mEndIso = useMemo(() => isoDay(endOfMonth(year, month0)), [year, month0]);
  const daysInMonth = endOfMonth(year, month0).getDate();
  const firstWeekday = startOfMonth(year, month0).getDay(); // 0 = Sun

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [
      row.advertiser_name,
      row.slot_or_size,
      row.publication,
      row.status,
      AD_CHANNEL_LABEL[row.channel],
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [query, rows]);

  // For each day in the month, list bookings that overlap that day.
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookedWindow[]>();
    const mStart = new Date(mStartIso);
    const mEnd = new Date(mEndIso);
    for (const r of filteredRows) {
      const days = daysInRangeForMonth(r, mStart, mEnd);
      for (const d of days) {
        const arr = map.get(d) ?? [];
        arr.push(r);
        map.set(d, arr);
      }
    }
    return map;
  }, [filteredRows, mStartIso, mEndIso]);

  // Bookings that overlap the current month at all — for the list below.
  const monthBookings = useMemo(() => {
    return filteredRows
      .filter((r) => r.end_date >= mStartIso && r.start_date <= mEndIso)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  }, [filteredRows, mStartIso, mEndIso]);

  const monthChannelCounts = useMemo(() => {
    const counts: Record<AdChannel, number> = { print: 0, digital: 0, email: 0, app: 0 };
    monthBookings.forEach((booking) => { counts[booking.channel] += 1; });
    return counts;
  }, [monthBookings]);

  // Print deadline for the current month (if any) — only relevant when
  // viewing print or all.
  const printDeadline = useMemo(() => {
    if (activeChannel !== 'all' && activeChannel !== 'print') return null;
    const monthName = new Date(mStartIso).toLocaleDateString('en-US', { month: 'long' });
    return PRINT_DEADLINES.find((d) => d.month === monthName) ?? null;
  }, [activeChannel, mStartIso]);

  // ── render ─────────────────────────────────────────────────────────────

  const goPrev = () => {
    const next = addMonths(anchor, -1);
    setAnchor(next);
    setUrl({ month: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}` });
  };
  const goNext = () => {
    const next = addMonths(anchor, 1);
    setAnchor(next);
    setUrl({ month: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}` });
  };
  const goToday = () => {
    const next = new Date(today.getFullYear(), today.getMonth(), 1);
    setAnchor(next);
    setUrl({ month: null });
  };

  return (
    <div className="space-y-5">
      <AdOpsMetrics
        label={`${monthLabel(year, month0)} booking summary`}
        items={[
          { label: 'Bookings', value: monthBookings.length },
          { label: 'Digital / app', value: monthChannelCounts.digital + monthChannelCounts.app },
          { label: 'Print', value: monthChannelCounts.print },
          { label: 'Email', value: monthChannelCounts.email },
        ]}
      />

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-300 px-4 py-3">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search bookings</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${AD_OPS_CONTROL} w-full pl-9`}
              placeholder="Partner, placement, publication, or status"
            />
          </span>
        </label>
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-gray-500">Channel</span>
          <nav className="flex h-9 min-w-max items-center gap-1" aria-label="Channel tabs">
          {CHANNEL_TABS.map((c) => {
            const active = activeChannel === c;
            const label = c === 'all' ? 'All channels' : AD_CHANNEL_LABEL[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setUrl({ channel: c === 'all' ? null : c })}
                className={`h-9 rounded px-3 text-sm font-medium transition ${
                  active
                    ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
              </button>
            );
          })}
          </nav>
        </div>
        <button type="button" onClick={refetch} disabled={loading} className={AD_OPS_SECONDARY}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Month nav */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[10rem] text-center">
            {monthLabel(year, month0)}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className={`${AD_OPS_SECONDARY} ml-1`}
          >
            Today
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          {AD_CHANNELS.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${CHANNEL_DOT_CLASS[c]}`} />
              {AD_CHANNEL_LABEL[c]}
            </span>
          ))}
        </div>
      </div>

      {/* Print deadline banner */}
      {printDeadline && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          <strong>Print deadline:</strong> {printDeadline.deadline} ·{' '}
          <strong>Mail date:</strong> {printDeadline.mail}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={refetch} className="font-semibold hover:underline">Try again</button>
        </div>
      )}

      {/* Month grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-7 bg-gray-50 text-xs font-medium text-gray-600 uppercase">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-1.5 text-center border-b border-gray-200">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {/* Leading blanks */}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`b${i}`} className="min-h-[5.5rem] border-b border-r border-gray-100 bg-gray-50/40" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const d = new Date(year, month0, day);
            const iso = isoDay(d);
            const isToday = iso === isoDay(today);
            const dayBookings = bookingsByDay.get(iso) ?? [];
            return (
              <div
                key={iso}
                className={`min-h-[5.5rem] border-b border-r border-gray-100 px-1.5 py-1 ${
                  isToday ? 'bg-orange-50/60' : 'bg-white'
                }`}
              >
                <div className={`text-xs font-medium ${isToday ? 'text-orange-700' : 'text-gray-700'}`}>
                  {day}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayBookings.slice(0, 3).map((b) => (
                    <Link
                      key={`${b.id}-${iso}`}
                      href={detailHref(b)}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[10px] border ${CHANNEL_BADGE_CLASS[b.channel]} hover:opacity-80`}
                      title={`${b.advertiser_name ?? 'Unknown partner'} — ${b.slot_or_size ?? ''}`}
                    >
                      {b.advertiser_name ?? '—'}
                    </Link>
                  ))}
                  {dayBookings.length > 3 && (
                    <span className="text-[10px] text-gray-500 pl-1">
                      +{dayBookings.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {/* Trailing blanks to complete the last row */}
          {(() => {
            const totalCells = firstWeekday + daysInMonth;
            const trailing = (7 - (totalCells % 7)) % 7;
            return Array.from({ length: trailing }).map((_, i) => (
              <div key={`t${i}`} className="min-h-[5.5rem] border-b border-r border-gray-100 bg-gray-50/40" />
            ));
          })()}
        </div>
        </div>
      </div>
      </section>

      {/* List view */}
      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-300 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Bookings this month{' '}
            <span className="font-normal text-gray-500">({monthBookings.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">Open a row to review its source record.</p>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600">Loading bookings…</div>
        ) : monthBookings.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">
            {query ? 'No bookings match this search.' : 'No bookings overlap this month.'}
          </div>
        ) : (
          <>
          {/* mobile card list */}
          <div className="divide-y divide-gray-100 md:hidden">
            {monthBookings.map((b) => (
              <div key={b.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${CHANNEL_BADGE_CLASS[b.channel]}`}
                    >
                      {AD_CHANNEL_LABEL[b.channel]}
                    </span>
                    <p className="mt-1.5 truncate font-medium text-gray-900">
                      {b.advertiser_name ?? '—'}
                    </p>
                  </div>
                  <Link
                    href={detailHref(b)}
                    className="shrink-0 whitespace-nowrap text-xs font-medium text-orange-700 hover:underline"
                  >
                    Open →
                  </Link>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-gray-500">Slot / size</dt>
                  <dd className="truncate text-gray-700">{b.slot_or_size ?? '—'}</dd>
                  <dt className="text-gray-500">Window</dt>
                  <dd className="whitespace-nowrap text-gray-700">
                    {fmtDateShort(b.start_date)} – {fmtDateShort(b.end_date)}
                  </dd>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="text-gray-700">{b.status}</dd>
                </dl>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-300 bg-white text-left text-xs text-gray-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Channel</th>
                  <th className="px-3 py-3 font-semibold">Partner</th>
                  <th className="px-3 py-3 font-semibold">Slot / size</th>
                  <th className="px-3 py-3 font-semibold">Window</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-orange-50/40">
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${CHANNEL_BADGE_CLASS[b.channel]}`}
                      >
                        {AD_CHANNEL_LABEL[b.channel]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">
                      {b.advertiser_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {b.slot_or_size ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {fmtDateShort(b.start_date)} – {fmtDateShort(b.end_date)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{b.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={detailHref(b)}
                        className="text-xs font-medium text-orange-700 hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
