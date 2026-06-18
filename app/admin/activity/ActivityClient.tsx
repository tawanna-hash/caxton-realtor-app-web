'use client';

// /admin/activity — real-time public app activity dashboard.
//
// Polls /api/admin/activity every 10s for fresh events. Five header tiles
// show rollup counts. Filter chips switch event bucket. Path search narrows
// to one route. Time-window selector adjusts how far back to look. Click
// any row to expand full event JSON. CSV export downloads current view.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PageTitle from '@/components/ui/PageTitle';
type Event = {
  timestamp: string;
  event: string;
  pathname: string | null;
  host: string | null;
  url: string | null;
  publication: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  city: string | null;
  country: string | null;
  distinct_id: string;
  email: string | null;
  error_message: string | null;
  el_text: string | null;
  el_href: string | null;
  action: string | null;
  form_name: string | null;
};

type RawRow = (string | number | null)[];

type Rollup = {
  pageviews: number;
  clicks: number;
  forms: number;
  errors: number;
  visitors: number;
};

const BUCKETS = [
  { id: 'all', label: 'All events' },
  { id: 'pageview', label: 'Page views' },
  { id: 'click', label: 'Clicks' },
  { id: 'form', label: 'Form submits' },
  { id: 'error', label: 'Errors' },
] as const;

const WINDOWS = [
  { minutes: 15, label: 'Last 15 min' },
  { minutes: 60, label: 'Last hour' },
  { minutes: 60 * 6, label: 'Last 6 hours' },
  { minutes: 60 * 24, label: 'Last 24 hours' },
  { minutes: 60 * 24 * 7, label: 'Last 7 days' },
];

const FIELD_ORDER: (keyof Event)[] = [
  'timestamp', 'event', 'pathname', 'host', 'url', 'publication',
  'device', 'browser', 'os', 'city', 'country',
  'distinct_id', 'email',
  'error_message', 'el_text', 'el_href', 'action', 'form_name',
];

function parseRow(row: RawRow): Event {
  const obj: Partial<Event> = {};
  FIELD_ORDER.forEach((key, i) => {
    (obj as Record<string, unknown>)[key] = row[i] ?? null;
  });
  return obj as Event;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function eventBadge(event: string): { label: string; color: string } {
  if (event === '$pageview') return { label: 'view', color: 'bg-gray-100 text-gray-700' };
  if (event === '$exception' || event === 'client_error') return { label: 'error', color: 'bg-rose-100 text-rose-800' };
  if (event === '$autocapture' || event === '$rageclick') return { label: 'click', color: 'bg-sky-100 text-sky-800' };
  if (event.includes('form_') || event.includes('_signed') || event.includes('signup') || event.includes('entered')) {
    return { label: 'form', color: 'bg-emerald-100 text-emerald-800' };
  }
  if (event === 'cta_clicked' || event === 'share_click' || event === 'article_opened') {
    return { label: 'click', color: 'bg-sky-100 text-sky-800' };
  }
  return { label: event.slice(0, 12), color: 'bg-gray-100 text-gray-700' };
}

function describeAction(e: Event): string {
  if (e.event === '$pageview') return `Viewed ${e.pathname ?? '/'}`;
  if (e.event === '$exception' || e.event === 'client_error') return e.error_message ?? 'Error';
  if (e.event === '$autocapture' || e.event === '$rageclick') {
    const t = e.el_text?.trim();
    return t ? `Clicked "${t.slice(0, 40)}"` : `Click on ${e.pathname ?? '/'}`;
  }
  if (e.form_name) return `Submitted ${e.form_name}`;
  if (e.action) return e.action;
  return e.event;
}

export default function ActivityClient() {
  const [bucket, setBucket] = useState<typeof BUCKETS[number]['id']>('all');
  const [minutes, setMinutes] = useState<number>(60);
  const [pathFilter, setPathFilter] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [rollup, setRollup] = useState<Rollup>({ pageviews: 0, clicks: 0, forms: 0, errors: 0, visitors: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const pathDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedPath, setDebouncedPath] = useState('');

  useEffect(() => {
    if (pathDebounce.current) clearTimeout(pathDebounce.current);
    pathDebounce.current = setTimeout(() => setDebouncedPath(pathFilter), 300);
    return () => {
      if (pathDebounce.current) clearTimeout(pathDebounce.current);
    };
  }, [pathFilter]);

  const fetchEvents = useCallback(async (showLoadingSpinner: boolean) => {
    if (showLoadingSpinner) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ bucket, minutes: String(minutes), limit: '200' });
      if (debouncedPath) params.set('path', debouncedPath);
      const res = await fetch(`/api/admin/activity?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = (data.events ?? []) as RawRow[];
      setEvents(rows.map(parseRow));
      if (data.rollup) setRollup(data.rollup);
      setLastFetchedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [bucket, minutes, debouncedPath]);

  // Initial load + refetch on filter changes. The rule's a heuristic; here
  // we're synchronizing React state with an external system (the activity
  // feed API), which is exactly what useEffect is for.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional initial fetch
    void fetchEvents(true);
  }, [fetchEvents]);

  // Auto-poll every 10s unless paused or expanded (so user can read).
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => fetchEvents(false), 10_000);
    return () => clearInterval(id);
  }, [fetchEvents, paused]);

  const csv = useMemo(() => {
    const headers = ['Time', 'Event', 'Action', 'Path', 'Publication', 'Device', 'Browser', 'City', 'Country', 'User', 'Email'];
    const rows = events.map((e) => [
      e.timestamp,
      e.event,
      describeAction(e),
      e.pathname ?? '',
      e.publication ?? '',
      e.device ?? '',
      e.browser ?? '',
      e.city ?? '',
      e.country ?? '',
      e.distinct_id ?? '',
      e.email ?? '',
    ]);
    return [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }, [events]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin</div>
        <PageTitle size="md">Live activity</PageTitle>
        <p className="text-sm text-gray-600 mb-6">Public app events in real time. Polls every 10 seconds. Admin paths excluded.</p>

        {/* Rollup tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Tile label="Visitors" value={rollup.visitors} accent="bg-gray-900 text-white" />
          <Tile label="Page views" value={rollup.pageviews} />
          <Tile label="Clicks" value={rollup.clicks} />
          <Tile label="Form submits" value={rollup.forms} accent="bg-emerald-50" />
          <Tile label="Errors" value={rollup.errors} accent={rollup.errors > 0 ? 'bg-rose-50 text-rose-900' : ''} />
        </div>

        {/* Controls row */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBucket(b.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  bucket === b.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
          >
            {WINDOWS.map((w) => (
              <option key={w.minutes} value={w.minutes}>{w.label}</option>
            ))}
          </select>
          <input
            value={pathFilter}
            onChange={(e) => setPathFilter(e.target.value)}
            placeholder="Filter by path (e.g. /advertisers)"
            className="flex-1 min-w-[180px] border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setPaused((p) => !p)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
              paused ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title={paused ? 'Live updates paused' : 'Live updates running'}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={downloadCsv}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>

        {/* Status line */}
        <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
          <div>
            {loading ? 'Loading…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
            {lastFetchedAt && !loading && ` · updated ${formatTime(lastFetchedAt.toISOString())}`}
          </div>
          {error && <div className="text-rose-600">{error}</div>}
        </div>

        {/* Feed */}
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {events.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-500 text-sm">No events match the current filter.</div>
          )}
          {events.map((e, i) => {
            const badge = eventBadge(e.event);
            const isOpen = expanded === i;
            return (
              <div key={i} className="hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-xs text-gray-500 font-mono w-20 shrink-0">{formatTime(e.timestamp)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${badge.color}`}>{badge.label}</span>
                  <span className="text-sm text-gray-900 truncate flex-1">{describeAction(e)}</span>
                  {e.publication && <span className="text-xs text-gray-500 hidden md:inline">{e.publication}</span>}
                  {e.city && <span className="text-xs text-gray-500 hidden md:inline">· {e.city}</span>}
                  {e.device && <span className="text-xs text-gray-500 hidden md:inline">· {e.device}</span>}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    {FIELD_ORDER.map((k) => {
                      const v = e[k];
                      if (v === null || v === undefined || v === '') return null;
                      return (
                        <div key={k} className="flex gap-2">
                          <span className="text-gray-500 w-24 shrink-0">{k}</span>
                          <span className="text-gray-900 break-all font-mono">{String(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className={`border border-gray-200 rounded-lg px-4 py-3 ${accent ?? 'bg-white'}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
