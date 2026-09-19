'use client';

// /admin/activity — real-time public app activity dashboard.
//
// Polls /api/admin/activity every 10s for fresh events. Five header tiles
// show rollup counts. Filter chips switch event bucket. Path search narrows
// to one route. Time-window selector adjusts how far back to look. Click
// any row to expand full event JSON. CSV export downloads current view.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlNumber, useUrlState, useUrlString } from '@/lib/use-url-state';
import { Download, Pause, Play, Radio, Search } from 'lucide-react';

import PageTitle from '@/components/ui/PageTitle';
import InsightsPagination from '@/components/admin/InsightsPagination';
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
  exception_type: string | null;
  exception_source: string | null;
  exception_lineno: string | number | null;
  masked_by_browser: boolean | string | null;
  captured_user_agent: string | null;
  el_text: string | null;
  el_href: string | null;
  elements_chain: string | null;
  action: string | null;
  form_name: string | null;
};

type RawRow = (string | number | null)[];

type Rollup = {
  pageviews: number;
  clicks: number;
  rageclicks: number;
  forms: number;
  errors: number;
  visitors: number;
};

const BUCKETS = [
  { id: 'all', label: 'All events' },
  { id: 'pageview', label: 'Page views' },
  { id: 'click', label: 'Clicks' },
  { id: 'rageclick', label: 'Rageclicks' },
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

// Order MUST match app/api/admin/activity/route.ts SELECT column order,
// because runHogQL() returns positional arrays.
const FIELD_ORDER: (keyof Event)[] = [
  'timestamp', 'event', 'pathname', 'host', 'url', 'publication',
  'device', 'browser', 'os', 'city', 'country',
  'distinct_id', 'email',
  'error_message', 'exception_type', 'exception_source', 'exception_lineno',
  'masked_by_browser', 'captured_user_agent',
  'el_text', 'el_href', 'elements_chain', 'action', 'form_name',
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
  if (event === '$rageclick') return { label: 'RAGE', color: 'bg-rose-100 text-rose-900 font-semibold' };
  if (event === '$autocapture') return { label: 'click', color: 'bg-sky-100 text-sky-800' };
  if (event.includes('form_') || event.includes('_signed') || event.includes('signup') || event.includes('entered')) {
    return { label: 'form', color: 'bg-emerald-100 text-emerald-800' };
  }
  if (event === 'cta_clicked' || event === 'share_click' || event === 'article_opened') {
    return { label: 'click', color: 'bg-sky-100 text-sky-800' };
  }
  return { label: event.slice(0, 12), color: 'bg-gray-100 text-gray-700' };
}

// PostHog $elements_chain is a leaf->root ';'-separated string:
//   tag.class1.class2:attr="value";tag.class:attr="value";...
// Return the leaf's tag + first class as "tag.class" (or just tag).
function parseElementsChainLeaf(chain: string | null | undefined): string | null {
  if (!chain) return null;
  const leaf = chain.split(';')[0]?.trim();
  if (!leaf) return null;
  // Strip everything after the first ':' (attrs), keep tag.class1[.class2]
  const head = leaf.split(':')[0]?.trim() ?? '';
  // Keep tag + first class only to stay short.
  const parts = head.split('.');
  const tag = parts[0] || 'element';
  const cls = parts[1];
  return cls ? `${tag}.${cls}` : tag;
}

function describeAction(e: Event): string {
  if (e.event === '$pageview') return `Viewed ${e.pathname ?? '/'}`;
  if (e.event === '$exception' || e.event === 'client_error') {
    const masked = e.masked_by_browser === true || e.masked_by_browser === 'true';
    const msg = e.error_message?.trim();
    if (msg && msg !== 'Script error.') return msg;
    if (msg === 'Script error.') return 'Script error (cross-origin, browser-masked)';
    if (masked) return 'Script error (cross-origin, browser-masked)';
    if (e.exception_type) return `${e.exception_type} (no message)`;
    if (e.exception_source) return `Unknown error at ${e.exception_source}`;
    if (e.pathname) return `Unknown error on ${e.pathname}`;
    return 'Unknown error (no message captured)';
  }
  if (e.event === '$autocapture' || e.event === '$rageclick') {
    const verb = e.event === '$rageclick' ? 'Rage-clicked' : 'Clicked';
    const t = e.el_text?.trim();
    if (t) return `${verb} "${t.slice(0, 40)}"`;
    const leaf = parseElementsChainLeaf(e.elements_chain);
    if (leaf) return `${verb} <${leaf}> on ${e.pathname ?? '/'}`;
    return `${verb} on ${e.pathname ?? '/'} (unlabeled element)`;
  }
  if (e.form_name) return `Submitted ${e.form_name}`;
  if (e.action) return e.action;
  return e.event;
}

export default function ActivityClient() {
  // Bucket / time window / text filters are URL-backed so refresh restores
  // whatever slice of activity the admin was inspecting.
  const [bucket, setBucket] = useUrlString<typeof BUCKETS[number]['id']>('bucket', 'all');
  const [minutes, setMinutes] = useUrlNumber('minutes', 60);
  const [pathFilter, setPathFilter] = useUrlState<string>('path', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  const [cityFilter, setCityFilter] = useUrlState<string>('city', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  const [searchFilter, setSearchFilter] = useUrlState<string>('q', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [rollup, setRollup] = useState<Rollup>({ pageviews: 0, clicks: 0, rageclicks: 0, forms: 0, errors: 0, visitors: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pathDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedPath, setDebouncedPath] = useState('');
  const [debouncedCity, setDebouncedCity] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (pathDebounce.current) clearTimeout(pathDebounce.current);
    pathDebounce.current = setTimeout(() => setDebouncedPath(pathFilter), 300);
    return () => {
      if (pathDebounce.current) clearTimeout(pathDebounce.current);
    };
  }, [pathFilter]);

  useEffect(() => {
    if (cityDebounce.current) clearTimeout(cityDebounce.current);
    cityDebounce.current = setTimeout(() => setDebouncedCity(cityFilter), 300);
    return () => {
      if (cityDebounce.current) clearTimeout(cityDebounce.current);
    };
  }, [cityFilter]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setDebouncedSearch(searchFilter), 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchFilter]);

  const fetchEvents = useCallback(async (showLoadingSpinner: boolean) => {
    if (showLoadingSpinner) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ bucket, minutes: String(minutes), limit: '200' });
      if (debouncedPath) params.set('path', debouncedPath);
      if (debouncedCity) params.set('city', debouncedCity);
      if (debouncedSearch) params.set('search', debouncedSearch);
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
  }, [bucket, minutes, debouncedPath, debouncedCity, debouncedSearch]);

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
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Insights</div>
            <PageTitle size="md">Live activity</PageTitle>
            <p className="mt-1 text-sm text-gray-600">Public app events, refreshed every 10 seconds. Admin paths are excluded.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-sm ${paused ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              <Radio className="h-4 w-4" aria-hidden="true" />
              {paused ? 'Paused' : 'Live'}
            </span>
            <button onClick={downloadCsv} className="inline-flex h-9 items-center gap-2 rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-700">
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </button>
          </div>
        </header>

        {/* Rollup tiles */}
        <section aria-label="Activity summary" className="grid grid-cols-2 gap-y-3 bg-white sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Visitors" value={rollup.visitors} />
          <Tile label="Page views" value={rollup.pageviews} />
          <Tile label="Clicks" value={rollup.clicks} />
          {rollup.rageclicks > 0 && (
            <Tile label="Rageclicks" value={rollup.rageclicks} accent="bg-rose-100 text-rose-900" />
          )}
          <Tile label="Form submits" value={rollup.forms} accent="bg-emerald-50" />
          <Tile label="Errors" value={rollup.errors} accent={rollup.errors > 0 ? 'bg-rose-50 text-rose-900' : ''} />
        </section>

        {/* Controls row */}
        <section aria-label="Activity filters" className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1 flex-wrap">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBucket(b.id)}
                className={`h-9 rounded border px-3 text-sm font-medium ${
                  bucket === b.id ? 'border-orange-700 bg-orange-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-9 rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          >
            {WINDOWS.map((w) => (
              <option key={w.minutes} value={w.minutes}>{w.label}</option>
            ))}
          </select>
          <label className="relative min-w-[210px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <span className="sr-only">Filter by path</span>
            <input value={pathFilter} onChange={(e) => { setPathFilter(e.target.value); setPage(1); }} placeholder="Filter by path" className="h-9 w-full rounded border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
          </label>
          <input
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            placeholder="City (e.g. Grayton Beach)"
            className="h-9 w-40 rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search errors / text"
            className="h-9 w-48 rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={() => setPaused((p) => !p)}
            className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-sm font-medium ${
              paused ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            title={paused ? 'Live updates paused' : 'Live updates running'}
          >
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </section>

        {/* Status line */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div>
            {loading ? 'Loading…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
            {lastFetchedAt && !loading && ` · updated ${formatTime(lastFetchedAt.toISOString())}`}
          </div>
          {error && <div className="text-rose-600">{error}</div>}
        </div>

        {/* Feed */}
        <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {events.length === 0 && !loading && (
            <div className="p-12 text-center">
              <Radio className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
              <div className="mt-3 text-sm font-medium text-gray-800">No matching activity</div>
              <p className="mt-1 text-sm text-gray-500">Adjust the event, time, or search filters.</p>
            </div>
          )}
          {pageEvents.map((e, i) => {
            const badge = eventBadge(e.event);
            const isOpen = expanded === i;
            return (
              <div key={`${e.timestamp}-${i}`} className="hover:bg-orange-50/40">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-xs text-gray-500 font-mono w-20 shrink-0">{formatTime(e.timestamp)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium shrink-0 ${badge.color}`}>{badge.label}</span>
                  <span className="text-sm text-gray-900 truncate flex-1">{describeAction(e)}</span>
                  {e.publication && <span className="text-xs text-gray-500 hidden md:inline">{e.publication}</span>}
                  {e.city && <span className="text-xs text-gray-500 hidden md:inline">· {e.city}</span>}
                  {e.device && <span className="text-xs text-gray-500 hidden md:inline">· {e.device}</span>}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3">
                    {(e.event === '$exception' || e.event === 'client_error') &&
                      (e.masked_by_browser === true || e.masked_by_browser === 'true' ||
                        (e.error_message?.trim() === 'Script error.')) && (
                      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <div className="font-medium">Browser-masked cross-origin error</div>
                        <div className="mt-1 leading-relaxed">
                          A script from a different origin threw an error without the required
                          CORS <code className="font-mono">crossorigin</code> attribute, so the
                          browser hid the actual message and stack trace. Common sources: third-
                          party ads/analytics, embedded iframes, browser extensions, magazine
                          reader, Stripe/PostHog SDK loaders. Fix by adding
                          <code className="font-mono">{'crossorigin="anonymous"'}</code> to the
                          offending &lt;script&gt; tag and ensuring the CDN returns
                          <code className="font-mono">Access-Control-Allow-Origin</code>.
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {events.length > 25 && <InsightsPagination page={currentPage} pageSize={pageSize} total={events.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
        </section>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className={`min-w-0 border-r border-gray-200 px-4 py-2 last:border-r-0 ${accent ?? 'bg-white'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">{value.toLocaleString()}</div>
    </div>
  );
}
