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
import type { BookedWindow } from '@/lib/server/availability-store';
import { PRINT_DEADLINES } from '@/lib/media-kit';

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

  // For each day in the month, list bookings that overlap that day.
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookedWindow[]>();
    const mStart = new Date(mStartIso);
    const mEnd = new Date(mEndIso);
    for (const r of rows) {
      const days = daysInRangeForMonth(r, mStart, mEnd);
      for (const d of days) {
        const arr = map.get(d) ?? [];
        arr.push(r);
        map.set(d, arr);
      }
    }
    return map;
  }, [rows, mStartIso, mEndIso]);

  // Bookings that overlap the current month at all — for the list below.
  const monthBookings = useMemo(() => {
    return rows
      .filter((r) => r.end_date >= mStartIso && r.start_date <= mEndIso)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  }, [rows, mStartIso, mEndIso]);

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
    <div>
      {/* Channel tabs */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex gap-6 flex-wrap" aria-label="Channel tabs">
          {CHANNEL_TABS.map((c) => {
            const active = activeChannel === c;
            const label = c === 'all' ? 'All channels' : AD_CHANNEL_LABEL[c];
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
              </button>
            );
          })}
        </nav>
      </div>

      {/* Month nav */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 whitespace-nowrap"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[10rem] text-center">
            {monthLabel(year, month0)}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 whitespace-nowrap"
            aria-label="Next month"
          >
            →
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-2 px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 whitespace-nowrap"
          >
            Today
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-gray-600">
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
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <strong>Print deadline:</strong> {printDeadline.deadline} ·{' '}
          <strong>Mail date:</strong> {printDeadline.mail}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Month grid */}
      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
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
                  isToday ? 'bg-blue-50/60' : 'bg-white'
                }`}
              >
                <div className={`text-xs font-medium ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                  {day}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayBookings.slice(0, 3).map((b) => (
                    <Link
                      key={`${b.id}-${iso}`}
                      href={detailHref(b)}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[10px] border ${CHANNEL_BADGE_CLASS[b.channel]} hover:opacity-80`}
                      title={`${b.advertiser_name ?? 'Unknown advertiser'} — ${b.slot_or_size ?? ''}`}
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

      {/* List view */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          Bookings this month{' '}
          <span className="text-gray-500 font-normal">({monthBookings.length})</span>
        </h3>
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : monthBookings.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-600">
            No bookings overlap this month.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Partner</th>
                  <th className="px-3 py-2">Slot / size</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${CHANNEL_BADGE_CLASS[b.channel]}`}
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
                        className="text-blue-700 hover:text-blue-900 text-xs"
                      >
                        Open →
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
