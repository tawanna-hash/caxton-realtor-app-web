// app/api/admin/reports/posthog/route.ts
//
// Server-side endpoint that compiles a snapshot of analytics for the
// /admin/reports page by issuing parallel HogQL queries against PostHog.
//
// Auth: same fail-closed pattern as /api/admin/inventory/[id] — verifies the
// admin cookie against the droplet's /admin/auth/me before touching PostHog.
//
// Caching: 5-minute server-side cache keyed by (timeframe, publication).
//
// Publication filtering strategy (verified S17 against project files):
//
//   - RealtyNewsNow is served from realtynewsnow.app (distinct host).
//     Filterable via properties.$host on ALL historical + future events.
//
//   - RealtyLine + Newsline San Antonio both live on app.myrealtyline.com. Which one a
//     user picked is stored in localStorage. PostHog has NO way to read
//     localStorage. To make them filterable we register `publication` as a
//     super property in posthog-provider.tsx (see posthog-provider-patch.tsx
//     in /mnt/user-data/outputs/). Historical events (pre-S17 patch) lack
//     this property — the warnings[] array in the response will flag this.
//
//   - 'All' applies no filter.

import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';

const posthogBodySchema = z.object({
  timeframe:   z.string().optional(),
  publication: z.string().optional(),
});

// ============================================================
// CONFIG
// ============================================================


const POSTHOG_HOST = 'https://us.posthog.com';
const POSTHOG_PROJECT_ID = '418339';

// Map UI labels → PostHog super-property values + an optional host pattern.
// `propertyValue`: matched against properties.publication (super-property).
// `hostPattern`: matched against properties.$host (set automatically by
//                posthog-js on every event). Used as a fallback / for hosts
//                that are inherently single-publication (RealtyNewsNow).
interface PublicationConfig {
  propertyValue: string | null;
  hostPattern: string | null;
  hasHistoricalData: boolean; // false = only post-S17 events carry the tag
}

const PUBLICATION_CONFIG: Record<string, PublicationConfig> = {
  'RealtyLine Austin': {
    propertyValue: 'realtyline',
    hostPattern: null,
    hasHistoricalData: false,
  },
  'Newsline San Antonio': {
    propertyValue: 'newsline',
    hostPattern: null,
    hasHistoricalData: false,
  },
  'RealtyNewsNow': {
    propertyValue: 'realtynewsnow',
    hostPattern: '%realtynewsnow%',
    hasHistoricalData: true,
  },
  'All': {
    propertyValue: null,
    hostPattern: null,
    hasHistoricalData: true,
  },
};

const EXCLUDED_EVENTS = ['$pageview', '$pageleave', '$autocapture', '$identify', '$set'];

const TIMEFRAME_DAYS: Record<string, number> = {
  '1': 1,
  '7': 7,
  '28': 28,
  '90': 90,
  '180': 180,
  '365': 365,
};

const CACHE_TTL_SECONDS = 300;

// ============================================================
// Types
// ============================================================

type Trend = 'up' | 'down' | 'flat';

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

interface PostHogQueryResult {
  results: Array<Array<string | number | null>>;
  columns?: string[];
}

// ============================================================
// PostHog client
// ============================================================

async function runHogQL(name: string, sql: string): Promise<PostHogQueryResult> {
  // S17 NAMING NOTE: Vercel env var is POSTHOG_PERSONAL_API_KEY (the original
  // POSTHOG_PERSONAL_API_KEY slot was occupied at the time of provisioning).
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) {
    throw new Error('POSTHOG_PERSONAL_API_KEY is not set');
  }
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query: sql },
      name,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog ${res.status} on "${name}": ${text.slice(0, 200)}`);
  }
  return (await res.json()) as PostHogQueryResult;
}

// ============================================================
// SQL builders
// ============================================================

function publicationClause(publication: string): string {
  const cfg = PUBLICATION_CONFIG[publication];
  if (!cfg) return '';
  if (publication === 'All') return '';

  // RealtyNewsNow: prefer host-pattern (works on historical) OR super property
  // (works after the posthog-provider patch ships).
  if (publication === 'RealtyNewsNow') {
    const safeProp = cfg.propertyValue?.replace(/'/g, "''") ?? '';
    return ` AND (properties.$host LIKE '${cfg.hostPattern}' OR properties.publication = '${safeProp}')`;
  }

  // RealtyLine / Newsline San Antonio: only the super property distinguishes them.
  // Historical events lack this — caller surfaces a warning.
  const safeProp = cfg.propertyValue?.replace(/'/g, "''") ?? '';
  return ` AND properties.publication = '${safeProp}'`;
}

// BUG-36: `properties.$session_duration` is only set on virtual `$session`
// events, so the previous avg() returned NULL even with 1300+ pageviews,
// and the KPI rendered as "—". Compute duration ourselves as
// max(timestamp) - min(timestamp) per $session_id, then average. Two
// queries (event-counts + per-session) keep each one simple HogQL.
function kpisSQL(days: number, pubClause: string, label: string): string {
  return `
    SELECT
      uniq(distinct_id) AS users,
      countIf(event = '$pageview') AS pageviews,
      uniq(properties.$session_id) AS sessions
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND timestamp < now()
      ${pubClause}
    -- ${label}
  `;
}

function avgSessionSQL(days: number, pubClause: string, prior: boolean): string {
  const from = prior ? `now() - INTERVAL ${days * 2} DAY` : `now() - INTERVAL ${days} DAY`;
  const to = prior ? `now() - INTERVAL ${days} DAY` : `now()`;
  return `
    SELECT avg(dur) AS avg_session_seconds FROM (
      SELECT dateDiff('second', min(timestamp), max(timestamp)) AS dur
      FROM events
      WHERE timestamp >= ${from}
        AND timestamp < ${to}
        AND properties.$session_id IS NOT NULL
        ${pubClause}
      GROUP BY properties.$session_id
    )
  `;
}

function priorKpisSQL(days: number, pubClause: string): string {
  return `
    SELECT
      uniq(distinct_id) AS users,
      countIf(event = '$pageview') AS pageviews,
      uniq(properties.$session_id) AS sessions
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days * 2} DAY
      AND timestamp < now() - INTERVAL ${days} DAY
      ${pubClause}
  `;
}

function topPagesSQL(days: number, pubClause: string): string {
  return `
    SELECT
      properties.$pathname AS url,
      count() AS views,
      uniq(distinct_id) AS users
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${pubClause}
    GROUP BY url
    ORDER BY views DESC
    LIMIT 6
  `;
}

function topEventsSQL(days: number, pubClause: string): string {
  const excluded = EXCLUDED_EVENTS.map((e) => `'${e}'`).join(', ');
  return `
    SELECT
      event,
      count() AS cnt,
      uniq(distinct_id) AS users
    FROM events
    WHERE event NOT IN (${excluded})
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${pubClause}
    GROUP BY event
    ORDER BY cnt DESC
    LIMIT 6
  `;
}

function trafficSourcesSQL(days: number, pubClause: string): string {
  return `
    SELECT
      coalesce(
        nullIf(properties.$initial_utm_source, ''),
        nullIf(properties.$initial_referring_domain, ''),
        'direct'
      ) AS source,
      count() AS visits,
      uniq(distinct_id) AS users,
      uniq(if(properties.$is_identified = '0', distinct_id, NULL)) AS new_users
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - INTERVAL ${days} DAY
      ${pubClause}
    GROUP BY source
    ORDER BY visits DESC
    LIMIT 5
  `;
}

// ============================================================
// Format helpers
// ============================================================

function formatInt(n: number | string | null): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-US').format(Math.round(v));
}

function formatDuration(seconds: number | string | null): string {
  const v = typeof seconds === 'string' ? Number(seconds) : seconds;
  if (v === null || v === undefined || Number.isNaN(v) || v <= 0) return '—';
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function pctChange(current: number, prior: number): { change: string; trend: Trend } {
  if (!prior || prior === 0) {
    return { change: current > 0 ? '+new' : '—', trend: 'flat' };
  }
  const delta = ((current - prior) / prior) * 100;
  const trend: Trend = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
  const sign = delta >= 0 ? '+' : '';
  return { change: `${sign}${delta.toFixed(1)}%`, trend };
}

function toNum(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'string' ? Number(v) || 0 : v;
}

// ============================================================
// Build report
// ============================================================

async function buildReport(timeframe: string, publication: string): Promise<ReportResponse> {
  const days = TIMEFRAME_DAYS[timeframe] ?? 28;
  const cfg = PUBLICATION_CONFIG[publication];
  const pubClause = publicationClause(publication);
  const warnings: string[] = [];

  // BUG-36: avg-session is now computed in its own HogQL query (see
  // avgSessionSQL). The base kpis query no longer includes it.
  const [kpisCur, kpisPrior, avgDurCurRes, avgDurPriorRes, topPagesRes, topEventsRes, sourcesRes] = await Promise.all([
    runHogQL('reports.kpis.current', kpisSQL(days, pubClause, 'current')),
    runHogQL('reports.kpis.prior', priorKpisSQL(days, pubClause)),
    runHogQL('reports.avg_session.current', avgSessionSQL(days, pubClause, false))
      .catch((err) => { console.warn('[analytics] avg_session current failed', err); return { results: [[null]] } as PostHogQueryResult; }),
    runHogQL('reports.avg_session.prior', avgSessionSQL(days, pubClause, true))
      .catch((err) => { console.warn('[analytics] avg_session prior failed', err); return { results: [[null]] } as PostHogQueryResult; }),
    runHogQL('reports.top_pages', topPagesSQL(days, pubClause)),
    runHogQL('reports.top_events', topEventsSQL(days, pubClause)),
    runHogQL('reports.traffic_sources', trafficSourcesSQL(days, pubClause)),
  ]);

  const curRow = kpisCur.results[0] ?? [0, 0, 0];
  const priorRow = kpisPrior.results[0] ?? [0, 0, 0];

  const usersCur = toNum(curRow[0]);
  const pageviewsCur = toNum(curRow[1]);
  const sessionsCur = toNum(curRow[2]);
  const avgDurCur = toNum(avgDurCurRes.results[0]?.[0] ?? null);

  const usersPrior = toNum(priorRow[0]);
  const pageviewsPrior = toNum(priorRow[1]);
  const sessionsPrior = toNum(priorRow[2]);
  const avgDurPrior = toNum(avgDurPriorRes.results[0]?.[0] ?? null);

  const subLabel = `vs prior ${days}d`;
  const kpis: Record<string, Kpi> = {
    users: {
      label: 'Unique users',
      value: formatInt(usersCur),
      ...pctChange(usersCur, usersPrior),
      sub: subLabel,
    },
    sessions: {
      label: 'Sessions',
      value: formatInt(sessionsCur),
      ...pctChange(sessionsCur, sessionsPrior),
      sub: subLabel,
    },
    avg_session: {
      label: 'Avg session duration',
      value: formatDuration(avgDurCur),
      ...pctChange(avgDurCur, avgDurPrior),
      sub: subLabel,
    },
    pageviews: {
      label: 'Pageviews',
      value: formatInt(pageviewsCur),
      ...pctChange(pageviewsCur, pageviewsPrior),
      sub: subLabel,
    },
  };

  const topPages: PageRow[] = (topPagesRes.results ?? []).map((row) => ({
    url: String(row[0] ?? '(unknown)'),
    views: formatInt(toNum(row[1])),
    users: formatInt(toNum(row[2])),
  }));

  const topEvents: EventRow[] = (topEventsRes.results ?? []).map((row) => ({
    name: String(row[0] ?? '(unknown)'),
    count: formatInt(toNum(row[1])),
    users: formatInt(toNum(row[2])),
  }));

  const trafficSources: SourceRow[] = (sourcesRes.results ?? []).map((row) => ({
    source: String(row[0] ?? 'direct'),
    visits: formatInt(toNum(row[1])),
    users: formatInt(toNum(row[2])),
    newUsers: formatInt(toNum(row[3])),
  }));

  // Historical-data warning for RealtyLine + Newsline San Antonio filters
  if (cfg && !cfg.hasHistoricalData && publication !== 'All') {
    warnings.push(
      `Historical events (before the posthog-provider patch ships) are NOT tagged with publication. Numbers shown only reflect data captured after the tagging change. For full-history reporting on "${publication}", use the "All" filter and segment manually, or wait for sufficient post-patch data to accumulate.`
    );
  }

  if (publication !== 'All' && usersCur === 0) {
    warnings.push(
      `No events found for "${publication}" in this window. Either the publication tagging patch has not shipped yet, or no users selected this publication in the period.`
    );
  }

  if (topPages.length === 0 && publication === 'All') {
    warnings.push('Top pages query returned 0 rows for "All". Verify $pageview events are firing in PostHog Live Events.');
  }

  return {
    asOf: new Date().toISOString(),
    fromCache: false,
    timeframe,
    publication,
    kpis,
    topPages,
    topEvents,
    trafficSources,
    warnings,
  };
}

const getCachedReport = unstable_cache(
  async (timeframe: string, publication: string) => buildReport(timeframe, publication),
  ['admin-reports-posthog'],
  { revalidate: CACHE_TTL_SECONDS, tags: ['admin-reports'] }
);

// ============================================================
// Handler
// ============================================================

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  const body = await parseJson(request, posthogBodySchema);

  const timeframe = body.timeframe ?? '28';
  const publication = body.publication ?? 'All';

  if (!TIMEFRAME_DAYS[timeframe]) {
    throw new ApiError(400, `Invalid timeframe: ${timeframe}`);
  }
  if (!(publication in PUBLICATION_CONFIG)) {
    throw new ApiError(400, `Invalid publication: ${publication}`);
  }

  const report = await getCachedReport(timeframe, publication);
  return NextResponse.json(report);
});
