// app/api/admin/reports/articles-list/route.ts
// Helper endpoint for the report builder UI. Returns the list of
// distinct articles that have at least one tracked event in the
// rolling window, with their title and pub. Used to populate the
// article dropdown so the user picks from real data instead of
// typing IDs.
//
// Query params:
//   days (optional, default 60) - window to scan, clamped 1..365

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getNewsRaw } from '@/lib/server/wp-news';

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = 'https://us.posthog.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type PostHogRow = { title: string | null; pub: string | null; opens: number };
type LiveRow = { id: string; head: string; pub: 'realtyline' | 'newsline' };

async function runHogQL(query: string): Promise<unknown[]> {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PostHog query failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  return data.results ?? [];
}

async function fetchPostHogRows(days: number, log: (s: string) => void): Promise<{
  byId: Map<string, PostHogRow>;
  warning: string | null;
}> {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    log('posthog: env missing');
    return { byId: new Map(), warning: 'PostHog env vars missing.' };
  }
  try {
    log('posthog: querying');
    const raw = await runHogQL(`
      SELECT
        properties.article_id AS article_id,
        nullIf(coalesce(any(properties.article_title), any(properties.title), any(properties.article_head), any(properties.head), ''), '') AS title,
        nullIf(coalesce(any(properties.pub), any(properties.publication), any(properties.pub_id), ''), '') AS pub,
        count() AS opens
      FROM events
      WHERE event = 'article_opened'
        AND properties.article_id IS NOT NULL
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY article_id
      ORDER BY opens DESC
      LIMIT 200
    `);
    log(`posthog: ok, ${raw.length} rows`);
    const byId = new Map<string, PostHogRow>();
    for (const r of raw) {
      const row = r as [string, string | null, string | null, number];
      const id = String(row[0]);
      byId.set(id, { title: row[1] ?? null, pub: row[2] ?? null, opens: Number(row[3]) });
    }
    return { byId, warning: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log(`posthog: FAILED ${msg}`);
    console.error('[articles-list] PostHog failed:', msg, stack);
    return { byId: new Map(), warning: `PostHog: ${msg}` };
  }
}

async function fetchLiveArticles(log: (s: string) => void): Promise<{ live: LiveRow[]; warning: string | null }> {
  const live: LiveRow[] = [];
  const warnings: string[] = [];

  log('wp: austin start');
  try {
    const austin = await getNewsRaw('austin');
    log(`wp: austin ok, ${austin.length} articles`);
    for (const a of austin) live.push({ id: String(a.id), head: a.head, pub: 'realtyline' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log(`wp: austin FAILED ${msg}`);
    console.error('[articles-list] austin failed:', msg, stack);
    warnings.push(`Austin: ${msg}`);
  }

  log('wp: sa start');
  try {
    const sa = await getNewsRaw('san_antonio');
    log(`wp: sa ok, ${sa.length} articles`);
    for (const a of sa) live.push({ id: String(a.id), head: a.head, pub: 'newsline' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log(`wp: sa FAILED ${msg}`);
    console.error('[articles-list] sa failed:', msg, stack);
    warnings.push(`SA: ${msg}`);
  }

  return { live, warning: warnings.length > 0 ? warnings.join(' | ') : null };
}

export async function GET(req: NextRequest) {
  const trace: string[] = [];
  const log = (s: string) => {
    const stamp = `${Date.now()}`;
    trace.push(`[${stamp}] ${s}`);
    console.log(`[articles-list] ${s}`);
  };

  try {
    log('start');

    // Auth - explicit try around getCurrentAdmin so we capture token-decode throws.
    let isAdmin = false;
    try {
      const admin = await getCurrentAdmin();
      isAdmin = admin !== null;
      log(`auth: ${isAdmin ? 'admin' : 'no admin'}`);
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      const stack = authErr instanceof Error ? authErr.stack : undefined;
      log(`auth: THREW ${msg}`);
      console.error('[articles-list] auth threw:', msg, stack);
      return NextResponse.json(
        { ok: false, error: 'Auth check failed', detail: msg, trace },
        { status: 500 },
      );
    }

    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized', trace }, { status: 401 });
    }

    const daysRaw = req.nextUrl.searchParams.get('days');
    const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 60;
    const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365 ? daysParsed : 60;
    log(`days=${days}`);

    let posthog: { byId: Map<string, PostHogRow>; warning: string | null } = { byId: new Map(), warning: null };
    let liveResult: { live: LiveRow[]; warning: string | null } = { live: [], warning: null };

    try {
      posthog = await fetchPostHogRows(days, log);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`posthog wrapper THREW ${msg}`);
      console.error('[articles-list] posthog wrapper threw:', e);
      posthog = { byId: new Map(), warning: `PostHog wrapper: ${msg}` };
    }

    try {
      liveResult = await fetchLiveArticles(log);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`wp wrapper THREW ${msg}`);
      console.error('[articles-list] wp wrapper threw:', e);
      liveResult = { live: [], warning: `WP wrapper: ${msg}` };
    }

    log(`merging: ${posthog.byId.size} ph, ${liveResult.live.length} wp`);

    const posthogById = posthog.byId;
    const live = liveResult.live;
    const seen = new Set<string>();
    const articles: Array<{ article_id: string; title: string; pub: string | null; opens: number }> = [];

    for (const l of live) {
      seen.add(l.id);
      const ph = posthogById.get(l.id);
      articles.push({
        article_id: l.id,
        title: ph?.title || l.head || `Article #${l.id}`,
        pub: ph?.pub || l.pub,
        opens: ph?.opens ?? 0,
      });
    }
    for (const [id, ph] of posthogById.entries()) {
      if (seen.has(id)) continue;
      articles.push({
        article_id: id,
        title: ph.title || `Article #${id}`,
        pub: ph.pub,
        opens: ph.opens,
      });
    }

    articles.sort((a, b) => {
      if (b.opens !== a.opens) return b.opens - a.opens;
      return a.title.localeCompare(b.title);
    });

    log(`returning ${articles.length} articles`);
    const warnings = [posthog.warning, liveResult.warning].filter(Boolean) as string[];
    const warning = warnings.length > 0 ? warnings.join(' | ') : undefined;

    return NextResponse.json({
      ok: true,
      articles,
      range_days: days,
      trace,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[articles-list] FATAL:', msg, stack);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        stack: stack?.split('\n').slice(0, 8),
        trace,
        articles: [],
      },
      { status: 500 },
    );
  }
}
