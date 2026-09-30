'use client';

// Home screen for the private Dallas/Ft. Worth preview, laid out exactly like
// the Austin / San Antonio feed: board category chips, the monthly board
// report cards (same card as the ABOR report), then the article list; the
// events tab uses the same event rows as the other markets. Dallas has no
// article source yet, so the article list shows the standard empty state.
// Both data endpoints return 403 unless the account is on the preview list.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CalendarEvent } from '@/lib/events-store';
import type { DfwMarketReport } from '@/lib/dfw-markets';
import DfwReportCard from '@/components/DfwReportCard';

const BRAND = '#301D5D';

const CATS = [
  'All',
  'MetroTex Association of REALTORS (MetroTex)',
  'Greater Fort Worth Association of REALTORS (GFWAR)',
] as const;
type Cat = (typeof CATS)[number];

function fmtDate(iso: string | null): { mo: string; dy: string; time: string } {
  if (!iso) return { mo: '', dy: '', time: '' };
  const d = new Date(iso);
  return {
    mo: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/Chicago' }),
    dy: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Chicago' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }),
  };
}

function orgOf(title: string): { org: string; title: string } {
  const m = /^(MetroTex|Greater Ft\. Worth):\s*(.*)$/.exec(title);
  return m ? { org: m[1], title: m[2] } : { org: 'Dallas/Ft. Worth', title };
}

function ReportSkeleton() {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="mx-3 my-3 h-64 animate-pulse rounded-md bg-gray-100" />
    </div>
  );
}

export default function DallasPreviewHome({ surface }: { surface: 'news' | 'events' }) {
  const [reports, setReports] = useState<DfwMarketReport[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [cat, setCat] = useState<Cat>('All');

  useEffect(() => {
    let cancelled = false;
    if (surface === 'news') {
      fetch('/api/dfw-market-reports', { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { reports: [] }))
        .then((d: { reports?: DfwMarketReport[] }) => { if (!cancelled) setReports(d.reports ?? []); })
        .catch(() => { if (!cancelled) setReports([]); });
    } else {
      fetch('/api/events/dallas', { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((d: { events?: CalendarEvent[] }) => {
          if (cancelled) return;
          const now = Date.now();
          setEvents(
            (d.events ?? [])
              .filter((e) => e.startDate && new Date(e.endDate ?? e.startDate).getTime() >= now)
              .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
          );
        })
        .catch(() => { if (!cancelled) setEvents([]); });
    }
    return () => { cancelled = true; };
  }, [surface]);

  if (surface === 'events') {
    return (
      <div>
        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium">Upcoming in Dallas/Ft. Worth</p>
        </div>
        {events === null ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border-b border-gray-200 px-4 py-5">
              <div className="h-16 animate-pulse rounded-md bg-gray-100" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="px-6 py-16 text-center bg-white border-b border-gray-200">
            <p className="text-gray-700 text-lg font-medium mb-1">No upcoming events.</p>
            <p className="text-gray-500 text-sm font-light">Check back soon.</p>
          </div>
        ) : (
          events.map((e) => {
            const d = fmtDate(e.startDate);
            const t = orgOf(e.title);
            return (
              <article key={e.id} className="bg-white border-b border-gray-200">
                <Link href={`/calendar/dallas/${e.id}`} className="px-4 py-5 flex gap-4 hover:bg-gray-50">
                  <div className="flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center rounded-md" style={{ backgroundColor: BRAND }}>
                    <span className="text-xs uppercase text-white/60 font-medium leading-none tracking-wider">{d.mo}</span>
                    <span className="text-xl font-medium text-white leading-none">{d.dy}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base text-gray-900 leading-snug mb-1 font-semibold">{t.title}</h3>
                    <p className="text-sm text-gray-500 font-light">{d.time}</p>
                    {e.location && <p className="text-sm text-gray-500 font-light">{e.location}</p>}
                    <p className="text-sm font-medium mt-2 uppercase tracking-wider" style={{ color: BRAND }}>{t.org}</p>
                  </div>
                </Link>
              </article>
            );
          })
        )}
      </div>
    );
  }

  const dallas = reports?.find((r) => r.board === 'metrotex' && r.areaKey === 'dfw-metroplex')
    ?? reports?.find((r) => r.board === 'metrotex' && r.areaKey === 'dallas-county');
  const fw = reports?.find((r) => r.board === 'gfwar' && r.areaKey === 'tarrant-county');
  const showMetro = cat === 'All' || cat === CATS[1];
  const showFw = cat === 'All' || cat === CATS[2];

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-200" style={{ scrollbarWidth: 'none' }}>
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={
              cat === c
                ? 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-semibold border border-gray-900 bg-gray-900 text-white rounded-md transition-colors'
                : 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 rounded-md transition-colors'
            }
          >
            {c}
          </button>
        ))}
      </div>

      {reports === null ? (
        <ReportSkeleton />
      ) : (
        <>
          {showMetro && dallas && <DfwReportCard report={dallas} id="dfw-card-metrotex" />}
          {showFw && fw && <DfwReportCard report={fw} id="dfw-card-gfwar" />}
          {(dallas || fw) && (
            <div className="px-4 py-3 bg-white border-b border-gray-200 text-right">
              <Link href="/market-reports/dfw" className="text-sm font-medium" style={{ color: BRAND }}>
                All counties and zip codes
              </Link>
            </div>
          )}
        </>
      )}

      <div className="px-6 py-16 text-center bg-white border-b border-gray-200">
        <p className="text-gray-700 text-lg font-medium mb-1">
          {cat === 'All' ? 'No articles available right now.' : `No articles tagged ${cat} yet.`}
        </p>
        <p className="text-gray-500 text-sm font-light">Check back soon.</p>
      </div>
    </div>
  );
}
