'use client';

// Home screen for the private Dallas/Ft. Worth preview. Dallas has no
// article source yet, so instead of falling back to another market's feed
// this shows what Dallas does have: board market reports and the calendar.
// Both data endpoints return 403 unless the account is on the preview list.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CalendarEvent } from '@/lib/events-store';
import { monthLabel, type DfwMarketReport } from '@/lib/dfw-markets';

const BRAND = '#301D5D';

function fmtDate(iso: string | null): { mo: string; dy: string; time: string } {
  if (!iso) return { mo: '', dy: '', time: '' };
  const d = new Date(iso);
  return {
    mo: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Chicago' }),
    dy: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Chicago' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }),
  };
}

function ReportTile({ r, area }: { r: DfwMarketReport | undefined; area: string }) {
  if (!r) return null;
  return (
    <Link
      href="/market-reports/dfw"
      className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {area} · {r.areaLabel}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{r.metrics.medianPrice ?? '—'}</div>
      <div className="text-sm text-gray-600">
        Median price{r.metrics.medianPriceYoY ? ` · ${r.metrics.medianPriceYoY} YoY` : ''}
      </div>
      <div className="mt-2 text-sm tabular-nums text-gray-700">
        {r.metrics.closedSales ? `${r.metrics.closedSales} closed sales` : ''}
        {r.metrics.monthsInventory ? ` · ${r.metrics.monthsInventory} months inventory` : ''}
      </div>
      <div className="mt-1 text-xs text-gray-500">{monthLabel(r.month)}</div>
    </Link>
  );
}

export default function DallasPreviewHome({ surface }: { surface: 'news' | 'events' }) {
  const [reports, setReports] = useState<DfwMarketReport[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dfw-market-reports', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((d: { reports?: DfwMarketReport[] }) => { if (!cancelled) setReports(d.reports ?? []); })
      .catch(() => { if (!cancelled) setReports([]); });
    fetch('/api/events/dallas', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d: { events?: CalendarEvent[] }) => {
        if (cancelled) return;
        const now = Date.now();
        const upcoming = (d.events ?? [])
          .filter((e) => e.startDate && new Date(e.endDate ?? e.startDate).getTime() >= now)
          .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
        setEvents(upcoming);
      })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, []);

  const dallas = reports?.find((r) => r.board === 'metrotex' && r.areaKey === 'dfw-metroplex')
    ?? reports?.find((r) => r.board === 'metrotex' && r.areaKey === 'dallas-county');
  const fw = reports?.find((r) => r.board === 'gfwar' && r.areaKey === 'tarrant-county');
  const list = surface === 'events' ? events : events?.slice(0, 5);

  return (
    <div className="px-4 py-5">
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Dallas/Ft. Worth preview — visible only to your account.
      </div>

      {surface === 'news' && (
        <section className="mb-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Market Reports</h2>
            <Link href="/market-reports/dfw" className="text-sm font-medium" style={{ color: BRAND }}>
              All areas
            </Link>
          </div>
          {reports === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
            </div>
          ) : dallas || fw ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ReportTile r={dallas} area="Dallas" />
              <ReportTile r={fw} area="Ft. Worth" />
            </div>
          ) : (
            <p className="text-sm text-gray-600">No market reports imported yet.</p>
          )}
          <p className="mt-4 text-sm text-gray-600">
            Dallas/Ft. Worth articles aren’t connected yet.
          </p>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Upcoming in Dallas/Ft. Worth</h2>
          <Link href="/calendar" className="text-sm font-medium" style={{ color: BRAND }}>
            Calendar
          </Link>
        </div>
        {list === null || list === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-gray-600">No upcoming events.</p>
        ) : (
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {list.map((e) => {
              const d = fmtDate(e.startDate);
              return (
                <li key={e.id}>
                  <Link href={`/calendar/dallas/${e.id}`} className="flex gap-4 py-3 hover:bg-gray-50">
                    <div
                      className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: BRAND }}
                    >
                      <span className="text-[11px] uppercase leading-none tracking-wider text-white/70">{d.mo}</span>
                      <span className="text-lg font-medium leading-none">{d.dy}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-base font-medium text-gray-900">{e.title}</p>
                      <p className="truncate text-sm text-gray-500">
                        {d.time}
                        {e.location ? ` · ${e.location}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
