'use client';

// app/admin/analytics/page.tsx
//
// PostHog-backed analytics dashboard with a prompt compiler panel for
// generating client-facing reports.
//
// Lives at /admin/analytics — NOT /admin/reports — to avoid collision with
// the existing 33KB /admin/reports page.
//
// Lint compliance (Decision #19): no setState calls inside useEffect bodies.
// - `loading` is derived: data we have doesn't match current filters.
// - Row-filter resets happen inside select onChange handlers, not an effect.

import { useCallback, useEffect, useState } from 'react';
import KpiStrip from '@/components/KpiStrip';
import HotspotPerformance from '@/components/HotspotPerformance';

import PageTitle from '@/components/ui/PageTitle';
// ============================================================
// Types
// ============================================================

type Trend = 'up' | 'down' | 'flat';
type Publication = 'RealtyLine Austin' | 'Newsline San Antonio' | 'RealtyNewsNow' | 'All';

interface Kpi {
  label: string;
  value: string;
  change: string;
  trend: Trend;
  sub: string;
}

interface PageRow { url: string; views: string; users: string }
interface EventRow { name: string; count: string; users: string }
interface SourceRow { source: string; visits: string; users: string; newUsers: string }

interface ReportResponse {
  asOf: string;
  fromCache: boolean;
  timeframe: string;
  publication: string;
  kpis: Record<string, Kpi>;
  topPages: PageRow[];
  topEvents: EventRow[];
  trafficSources: SourceRow[];
  warnings: string[];
}

// Combined fetched-data state — tracks "what filters this data is for" so
// `loading` can be derived without setState-in-effect.
interface DataState {
  report: ReportResponse | null;
  error: string | null;
  forTimeframe: string;
  forPublication: string;
}

// ============================================================
// Constants
// ============================================================

const TIMEFRAME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: 'Last 1 day' },
  { value: '7', label: 'Last 7 days' },
  { value: '28', label: 'Last 28 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
];

const PUBLICATION_OPTIONS: ReadonlyArray<Publication> = [
  'RealtyLine Austin',
  'Newsline San Antonio',
  'RealtyNewsNow',
  'All',
];

const KPI_ORDER: ReadonlyArray<string> = ['users', 'sessions', 'avg_session', 'pageviews'];

const DEFAULT_CONVERSION_EVENTS = [
  'auth_completed',
  'article_opened',
  'flipbook_opened',
  'event_register_clicked',
  'magic_link_requested',
];

const ALL_CONVERSION_EVENT_OPTIONS = [
  'auth_completed',
  'article_opened',
  'article_saved',
  'article_shared',
  'flipbook_opened',
  'flipbook_page_turned',
  'event_register_clicked',
  'event_added_to_calendar',
  'magic_link_requested',
  'giveaway_continue_signup',
  'newsletter_signup',
  // Server-side CRM / lifecycle events (fired from API routes via
  // lib/server/posthog.ts captureServerEvent). See app/admin/metrics/_types.ts
  // EVENT_LABELS for the human-readable label mapping.
  'advertiser_linked',
  'advertiser_signed',
  'agreement_create_failed',
  'amended_pdf_sent',
  'dispatch_failed',
  'email_sent',
  'giveaway_entered',
  'invoice_create_failed',
  'issue_charge_failed',
  'issue_charge_succeeded',
  'locations_staff_seeded',
  'pdf_generation_failed',
  'renewal_email_sent',
  'verify_failed',
];

const SPARKLINE_PATHS: Record<Trend, string> = {
  up: 'M0,18 L10,14 L20,16 L30,11 L40,12 L50,8 L60,9 L70,5 L80,7 L90,3 L100,4',
  down: 'M0,5 L10,8 L20,7 L30,10 L40,9 L50,13 L60,12 L70,15 L80,14 L90,17 L100,16',
  flat: 'M0,10 L10,9 L20,11 L30,10 L40,12 L50,9 L60,11 L70,10 L80,9 L90,11 L100,10',
};

const LONG_WINDOW_VALUES: ReadonlyArray<string> = ['180', '365'];
const API_PATH = '/api/admin/analytics/posthog';

// Sentinel — initial state with mismatched filters so `loading` is true on first render
const INITIAL_DATA: DataState = {
  report: null,
  error: null,
  forTimeframe: '__init__',
  forPublication: '__init__',
};

// ============================================================
// Helpers
// ============================================================

function timeframeLabel(value: string): string {
  return TIMEFRAME_OPTIONS.find((o) => o.value === value)?.label ?? `Last ${value} days`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function compilePrompt(args: {
  report: ReportResponse | null;
  activeKpi: string;
  timeframe: string;
  publication: Publication;
  pageFilter: string;
  eventFilter: string;
  sourceFilter: string;
  conversionEvents: string[];
}): string {
  const { report, activeKpi, timeframe, publication, pageFilter, eventFilter, sourceFilter, conversionEvents } = args;

  const kpi = report?.kpis[activeKpi];
  const kpiLine = kpi
    ? `${kpi.label} — ${kpi.value} (${kpi.change} ${kpi.sub})`
    : `${activeKpi} (data not loaded yet)`;

  const topPagesBlock = report?.topPages?.length
    ? report.topPages.map((p) => `  - ${p.url}: ${p.views} views, ${p.users} users`).join('\n')
    : '  - (no data)';

  const topEventsBlock = report?.topEvents?.length
    ? report.topEvents.map((e) => `  - ${e.name}: ${e.count} events, ${e.users} users`).join('\n')
    : '  - (no data)';

  const sourcesBlock = report?.trafficSources?.length
    ? report.trafficSources.map((s) => `  - ${s.source}: ${s.visits} visits, ${s.users} users, ${s.newUsers} new`).join('\n')
    : '  - (no data)';

  const pageSection = pageFilter !== 'All pages'
    ? `- Deep-dive page: "${pageFilter}". Cover views, unique users, exit rate, and what users do next. Recommend one UX change to lift downstream engagement.`
    : `- Rank the top 5 pages by views and by unique users. Flag any page with high views but low unique users (possible bot or one-user binge).`;

  const eventSection = eventFilter !== 'All events'
    ? `- Focus on the "${eventFilter}" event. Cover trigger frequency per user and time-to-first-fire for new users.`
    : `- Summarize the top 5 custom events by count. Flag any event volume change > 25% versus the prior period.`;

  const sourceSection = sourceFilter !== 'All sources'
    ? `- Traffic source deep-dive: "${sourceFilter}". Report visits, users, % new, and the activation rate (% of visitors who fire a conversion event the same day).`
    : `- Rank traffic sources by visits. Identify the highest-volume source and the highest-quality source (best ratio of conversion events to visits). They are usually different — call out the strategic implication for ${publication === 'All' ? 'the network' : publication}.`;

  return `Act as a senior product analyst writing a client-facing engagement report. The data below comes from PostHog (project realtyline-prod) for the RealtyLine network of real-estate trade publications.

Use ONLY the data supplied. Do not invent metrics. If a section has no data, state "Not measured in this window."

=== POSTHOG CONFIG ===
- Publication scope: ${publication}
- Reporting window: ${timeframeLabel(timeframe)}
- Data as of: ${report ? formatTime(report.asOf) : '(not loaded)'}
- Headline KPI: ${kpiLine}
- Page filter: ${pageFilter}
- Event filter: ${eventFilter}
- Traffic source filter: ${sourceFilter}
- Conversion events tracked: [ ${conversionEvents.join(', ')} ]

=== DATA SNAPSHOT ===

KPIs (current window vs prior equivalent window):
${report ? Object.values(report.kpis).map((k) => `  - ${k.label}: ${k.value} (${k.change} ${k.sub})`).join('\n') : '  - (not loaded)'}

Top pages:
${topPagesBlock}

Top custom events:
${topEventsBlock}

Traffic sources:
${sourcesBlock}

=== REPORT STRUCTURE ===

1. EXECUTIVE SUMMARY
   - Lead with the headline KPI: ${kpiLine}.
   - Interpret the period-over-period direction in plain English.
   - Call out one strength and one risk in the data.

2. CONTENT ENGAGEMENT
   ${pageSection}

3. EVENT BEHAVIOR
   ${eventSection}

4. TRAFFIC SOURCES
   ${sourceSection}

5. CONVERSION FUNNEL
   - Build a funnel using only these events, in this order: ${conversionEvents.join(' -> ')}.
   - Report the drop-off rate at each step. Identify the largest leak.
   - Suggest one PostHog Feature Flag experiment or content change to address it.

6. RECOMMENDATIONS (3 items, web-specific)
   - Each item must reference a PostHog feature you would use to validate it: Cohorts, Feature Flags, Experiments, Session Replay, or Surveys.
   - Each item must tie back to a metric named earlier in the report.

=== STYLE ===
- Professional, data-led prose. No filler phrases.
- Use Markdown headers (H2 for sections, H3 for sub-sections).
- Inline metrics in bold. Use Markdown tables for the page ranking, event ranking, and funnel.
- Reading time target: 4 to 5 minutes.`;
}

// ============================================================
// Page
// ============================================================

export default function AdminAnalyticsPage() {
  const [timeframe, setTimeframe] = useState<string>('28');
  const [publication, setPublication] = useState<Publication>('All');
  const [activeKpi, setActiveKpi] = useState<string>('users');
  const [pageFilter, setPageFilter] = useState<string>('All pages');
  const [eventFilter, setEventFilter] = useState<string>('All events');
  const [sourceFilter, setSourceFilter] = useState<string>('All sources');
  const [conversionEvents, setConversionEvents] = useState<string[]>(DEFAULT_CONVERSION_EVENTS);
  const [data, setData] = useState<DataState>(INITIAL_DATA);
  const [copied, setCopied] = useState<boolean>(false);

  // Derived loading state — true when current filters don't match what
  // the data was fetched for. Avoids setState-in-effect.
  const loading = data.forTimeframe !== timeframe || data.forPublication !== publication;
  const report = data.report;
  const error = data.error;

  // Fetch effect — no synchronous setState. All state updates happen
  // inside the async then/catch callbacks.
  useEffect(() => {
    let cancelled = false;
    const targetTimeframe = timeframe;
    const targetPublication = publication;

    fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeframe: targetTimeframe, publication: targetPublication }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text.slice(0, 200)}`);
        }
        return res.json() as Promise<ReportResponse>;
      })
      .then((freshReport) => {
        if (cancelled) return;
        setData({
          report: freshReport,
          error: null,
          forTimeframe: targetTimeframe,
          forPublication: targetPublication,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setData({
          report: null,
          error: err.message,
          forTimeframe: targetTimeframe,
          forPublication: targetPublication,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [timeframe, publication]);

  // Row-filter reset happens inline in onChange handlers below — no effect.

  const togglePage = useCallback((url: string) => {
    setPageFilter((prev) => (prev === url ? 'All pages' : url));
  }, []);

  const toggleEvent = useCallback((name: string) => {
    setEventFilter((prev) => (prev === name ? 'All events' : name));
  }, []);

  const toggleSource = useCallback((source: string) => {
    setSourceFilter((prev) => (prev === source ? 'All sources' : source));
  }, []);

  const toggleConversion = useCallback((evt: string) => {
    setConversionEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  }, []);

  const resetRowFilters = useCallback(() => {
    setPageFilter('All pages');
    setEventFilter('All events');
    setSourceFilter('All sources');
  }, []);

  const resetFilters = useCallback(() => {
    setActiveKpi('users');
    resetRowFilters();
    setConversionEvents(DEFAULT_CONVERSION_EVENTS);
  }, [resetRowFilters]);

  const onPublicationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPublication(e.target.value as Publication);
      // Reset row filters when the underlying data changes — keeps the
      // UI consistent without needing a useEffect.
      setPageFilter('All pages');
      setEventFilter('All events');
      setSourceFilter('All sources');
    },
    []
  );

  const onTimeframeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setTimeframe(e.target.value);
      setPageFilter('All pages');
      setEventFilter('All events');
      setSourceFilter('All sources');
    },
    []
  );

  const promptText = compilePrompt({
    report,
    activeKpi,
    timeframe,
    publication,
    pageFilter,
    eventFilter,
    sourceFilter,
    conversionEvents,
  });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [promptText]);

  const isLongWindow = LONG_WINDOW_VALUES.includes(timeframe);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 p-4 sm:p-6">

      <main className="space-y-5 min-w-0">

        {/* Phase 6b: cross-system at-a-glance KPIs. Self-contained fetch —
            renders instantly, independent of the slow PostHog report below. */}
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">At a glance</h2>
          <KpiStrip />
        </div>

        {/* Data freshness banner */}
        {report && !error ? (
          <div className="rounded-md px-4 py-2.5 flex items-center gap-3 text-sm border border-emerald-300 bg-emerald-50 text-emerald-900">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>
              <strong>Live data</strong> &mdash; fetched {formatTime(report.asOf)} from PostHog.
              {report.fromCache ? ' (cached, <= 5 min old)' : ''}
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md px-4 py-2.5 flex items-start gap-3 text-sm border border-red-400 bg-red-50 text-red-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong>Fetch failed:</strong> {error}
            </span>
          </div>
        ) : null}

        {report && report.warnings.length > 0 ? (
          <div className="rounded-md px-4 py-2.5 flex items-start gap-3 text-sm border border-amber-300 bg-amber-50 text-amber-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <strong>Warnings:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {/* Page heading + filters */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3">
          <div>
            <PageTitle size="md">PostHog Analytics</PageTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              Engagement report &mdash; <span className="font-mono text-gray-700">{publication}</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="pub-select" className="text-xs text-gray-500">Publication:</label>
              {/* BUG-40: do NOT use `disabled` for the loading state — it
                  hides the control from keyboards and screen readers entirely.
                  Use aria-busy + a faded visual cue instead so the filter
                  stays focusable while the report refreshes. */}
              <select
                id="pub-select"
                value={publication}
                onChange={onPublicationChange}
                aria-busy={loading}
                className={`bg-white border border-gray-300 text-sm text-gray-700 rounded-md px-3 py-1.5 outline-none focus:border-blue-500 cursor-pointer ${loading ? 'opacity-60' : ''}`}
              >
                {PUBLICATION_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="timeframe-select" className="text-xs text-gray-500">Range:</label>
              <select
                id="timeframe-select"
                value={timeframe}
                onChange={onTimeframeChange}
                aria-busy={loading}
                className={`bg-white border border-gray-300 text-sm text-gray-700 rounded-md px-3 py-1.5 outline-none focus:border-blue-500 cursor-pointer ${loading ? 'opacity-60' : ''}`}
              >
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && isLongWindow ? (
          <p className="text-xs text-gray-500 italic">
            Loading a long window from PostHog &mdash; 20 to 30 seconds is normal for 6+ month ranges.
          </p>
        ) : null}

        {/* KPI grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPI_ORDER.map((key) => {
            const item = report?.kpis[key];
            const isActive = activeKpi === key;
            const trend: Trend = item?.trend ?? 'flat';
            const path = SPARKLINE_PATHS[trend];
            const changeColor = item?.change.startsWith('+')
              ? 'text-emerald-600'
              : item?.change.startsWith('-')
                ? 'text-red-600'
                : 'text-gray-500';

            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveKpi(key)}
                disabled={!item}
                className={`text-left rounded-md border p-4 transition cursor-pointer bg-white disabled:cursor-default disabled:opacity-60 ${
                  isActive
                    ? 'border-blue-500 ring-1 ring-blue-500 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {loading || !item ? (
                  <KpiSkeleton />
                ) : (
                  <>
                    <p className="text-[11px] font-medium text-gray-500 truncate">{item.label}</p>
                    <p className="text-2xl font-semibold mt-1 tracking-tight text-gray-900">{item.value}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-[10px] font-mono ${changeColor}`}>{item.change}</span>
                      <span className="text-[9px] text-gray-400 uppercase">{item.sub}</span>
                    </div>
                    <svg viewBox="0 0 100 20" className="w-full h-7 mt-2" preserveAspectRatio="none">
                      <path d={`${path} L100,20 L0,20 Z`} fill="rgba(37, 99, 235, 0.1)" />
                      <path d={path} stroke="#2563eb" strokeWidth="1.75" fill="none" />
                    </svg>
                  </>
                )}
              </button>
            );
          })}
        </section>

        {/* Top pages + Top events */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Top pages" subtitle="$pageview, by $pathname" hint="Click to filter">
            {loading ? (
              <TableSkeleton rows={5} cols={3} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left font-medium pb-2">Page</th>
                    <th className="text-right font-medium pb-2">Views</th>
                    <th className="text-right font-medium pb-2">Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(report?.topPages ?? []).map((row) => {
                    const isActive = pageFilter === row.url;
                    return (
                      <tr
                        key={row.url}
                        onClick={() => togglePage(row.url)}
                        className={`cursor-pointer transition ${isActive ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                      >
                        <td className="py-2.5 pl-2 font-mono text-xs truncate max-w-[200px]" title={row.url}>{row.url}</td>
                        <td className="py-2.5 text-right font-mono">{row.views}</td>
                        <td className="py-2.5 text-right font-mono text-gray-500 pr-2">{row.users}</td>
                      </tr>
                    );
                  })}
                  {!report?.topPages?.length ? (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-xs">No data in window</td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Top custom events" subtitle="Excluding autocapture + pageviews" hint="Click to filter">
            {loading ? (
              <TableSkeleton rows={5} cols={3} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left font-medium pb-2">Event</th>
                    <th className="text-right font-medium pb-2">Count</th>
                    <th className="text-right font-medium pb-2">Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(report?.topEvents ?? []).map((row) => {
                    const isActive = eventFilter === row.name;
                    return (
                      <tr
                        key={row.name}
                        onClick={() => toggleEvent(row.name)}
                        className={`cursor-pointer transition ${isActive ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                      >
                        <td className="py-2.5 pl-2 font-mono text-xs">{row.name}</td>
                        <td className="py-2.5 text-right font-mono">{row.count}</td>
                        <td className="py-2.5 text-right font-mono text-gray-500 pr-2">{row.users}</td>
                      </tr>
                    );
                  })}
                  {!report?.topEvents?.length ? (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-xs">No data in window</td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* Traffic sources */}
        <Card
          title="Traffic sources"
          subtitle="Initial UTM source, with referring domain fallback"
          hint="Click to filter"
          titleBadge="$initial_utm_source"
        >
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                  <th className="text-left font-medium pb-2">Source</th>
                  <th className="text-right font-medium pb-2">Visits</th>
                  <th className="text-right font-medium pb-2">Users</th>
                  <th className="text-right font-medium pb-2">New users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(report?.trafficSources ?? []).map((row) => {
                  const isActive = sourceFilter === row.source;
                  return (
                    <tr
                      key={row.source}
                      onClick={() => toggleSource(row.source)}
                      className={`cursor-pointer transition ${isActive ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-2.5 pl-2 font-mono text-xs">{row.source}</td>
                      <td className="py-2.5 text-right font-mono">{row.visits}</td>
                      <td className="py-2.5 text-right font-mono">{row.users}</td>
                      <td className="py-2.5 text-right font-mono text-gray-500 pr-2">{row.newUsers}</td>
                    </tr>
                  );
                })}
                {!report?.trafficSources?.length ? (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-400 text-xs">No data in window</td></tr>
                ) : null}
              </tbody>
            </table>
          )}
        </Card>

        {/* Phase 6c: hotspot performance — top advertisers + top hotspots (30d).
            Self-contained fetch, independent of the PostHog report. */}
        <HotspotPerformance />

        {/* Conversion event toggles */}
        <Card
          title="Conversion events for funnel"
          subtitle="Toggle which events scope the compiled prompt's funnel section."
          headerRight={
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-gray-500 hover:text-blue-600 underline"
            >
              Reset filters
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {ALL_CONVERSION_EVENT_OPTIONS.map((evt) => {
              const isOn = conversionEvents.includes(evt);
              return (
                <button
                  key={evt}
                  type="button"
                  onClick={() => toggleConversion(evt)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-mono transition ${
                    isOn
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {isOn ? '● ' : '○ '}{evt}
                </button>
              );
            })}
          </div>
        </Card>
      </main>

      <aside className="min-w-0">
        <div className="rounded-md border border-gray-200 bg-white p-5 flex flex-col xl:sticky xl:top-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600">Report compiler</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Live prompt with real data &mdash; paste into Claude for the client deliverable
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`font-medium px-3 py-1.5 rounded-md text-xs transition active:scale-95 text-white ${
                copied ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            readOnly
            value={promptText}
            className="w-full bg-gray-50 text-gray-700 border border-gray-200 rounded-md p-3 text-[11px] font-mono resize-none outline-none focus:border-blue-400 h-[560px] leading-relaxed select-all"
          />
          <p className="text-[10px] text-gray-400 mt-3">
            Every clickable element + filter on this page updates this prompt with real PostHog data.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ============================================================
// Inline primitives
// ============================================================

interface CardProps {
  title: string;
  subtitle?: string;
  hint?: string;
  titleBadge?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

function Card({ title, subtitle, hint, titleBadge, headerRight, children }: CardProps) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
            {title}
            {titleBadge ? (
              <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase rounded-md bg-amber-100 text-amber-800">
                {titleBadge}
              </span>
            ) : null}
          </h3>
          {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {headerRight ? (
          <div className="self-start sm:self-auto">{headerRight}</div>
        ) : hint ? (
          <span className="text-[10px] text-blue-600 uppercase tracking-wider self-start sm:self-auto">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function KpiSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-2.5 bg-gray-200 rounded-md w-20" />
      <div className="h-7 bg-gray-200 rounded-md w-16 mt-2" />
      <div className="h-2 bg-gray-200 rounded-md w-12 mt-2" />
      <div className="h-7 bg-gray-100 rounded-md mt-3" />
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className={`h-3 bg-gray-200 rounded-md ${j === 0 ? 'flex-1' : 'w-12'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
