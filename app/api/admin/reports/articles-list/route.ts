// app/api/admin/reports/articles-list/route.ts
// Helper endpoint for the report builder UI. Returns the list of
// distinct articles that have at least one tracked event in the
// rolling window, with their title and pub. Used to populate the
// article dropdown so the user picks from real data instead of
// typing IDs.
//
// Query params:
//   days (optional, default 60) - window to scan, clamped 1..365
//
// Resilience: PostHog and WP are queried independently. Either failing
// must not blank out the picker. We always return 200 with whatever
// subset we could assemble, and surface a `warning` field when one of
// the upstreams failed so the UI can hint at degraded data.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getNewsRaw } from '@/lib/server/wp-news';

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = 'https://us.posthog.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

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

type PostHogRow = { title: string | null; pub: string | null; opens: number };
type LiveRow = { id: string; head: string; pub: 'realtyline' | 'newsline' };

async function fetchPostHogRows(days: number): Promise<{
  byId: Map<string, PostHogRow>;
  warning: string | null;
}> {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    return { byId: new Map(), warning: 'PostHog env vars missing - showing WP articles only.' };
  }
  try {
    const raw = await runHogQL(`
      SELECT
        properties.article_id AS article_id,
        nullIf(
          coalesce(
            any(properties.article_title),
            any(properties.title),
            any(properties.article_head),
            any(properties.head),
            ''
          ),
          ''
        ) AS title,
        nullIf(
          coalesce(
            any(properties.pub),
            any(properties.publication),
            any(properties.pub_id),
            ''
          ),
          ''
        ) AS pub,
        count() AS opens
      FROM events
      WHERE event = 'article_opened'
        AND properties.article_id IS NOT NULL
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY article_id
      ORDER BY opens DESC
      LIMIT 200
    `);
    const byId = new Map<string, PostHogRow>();
    for (const r of raw) {
      const row = r as [string, string | null, string | null, number];
      const id = String(row[0]);
      byId.set(id, {
        title: row[1] ?? null,
        pub: row[2] ?? null,
        opens: Number(row[3]),
      });
    }
    return { byId, warning: null };
  } catch (err) {
    console.error('[articles-list] PostHog query failed', err);
    return {
      byId: new Map(),
      warning: 'Open-count data unavailable (PostHog query failed). Showing articles without engagement counts.',
    };
  }
}

async function fetchLiveArticles(): Promise<{ live: LiveRow[]; warning: string | null }> {
  const live: LiveRow[] = [];
  const warnings: string[] = [];
  try {
    const austin = await getNewsRaw('austin').catch((err) => {
      console.error('[articles-list] getNewsRaw(austin) failed', err);
      warnings.push('RealtyLine Austin article list unavailable.');
      return [] as Awaited<ReturnType<typeof getNewsRaw>>;
    });
    for (const a of austin) live.push({ id: String(a.id), head: a.head, pub: 'realtyline' });
  } catch (err) {
    console.error('[articles-list] austin fetch threw', err);
    warnings.push('RealtyLine Austin article list unavailable.');
  }
  try {
    const sa = await getNewsRaw('san_antonio').catch((err) => {
      console.error('[articles-list] getNewsRaw(san_antonio) failed', err);
      warnings.push('Newsline San Antonio article list unavailable.');
      return [] as Awaited<ReturnType<typeof getNewsRaw>>;
    });
    for (const a of sa) live.push({ id: String(a.id), head: a.head, pub: 'newsline' });
  } catch (err) {
    console.error('[articles-list] san_antonio fetch threw', err);
    warnings.push('Newsline San Antonio article list unavailable.');
  }
  return {
    live,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}

export async function GET(req: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const daysRaw = req.nextUrl.searchParams.get('days');
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 60;
  const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365
    ? daysParsed
    : 60;

  try {
    // Run PostHog + WP independently. Either side failing produces a warning
    // but never blanks out the dropdown.
    const [posthog, liveResult] = await Promise.all([
      fetchPostHogRows(days),
      fetchLiveArticles(),
    ]);

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

    const warnings = [posthog.warning, liveResult.warning].filter(Boolean) as string[];
    const warning = warnings.length > 0 ? warnings.join(' ') : undefined;

    return NextResponse.json({
      ok: true,
      articles,
      range_days: days,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    console.error('[articles-list] fatal', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        articles: [],
      },
      { status: 500 },
    );
  }
}
