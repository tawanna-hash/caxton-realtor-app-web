// app/api/admin/reports/articles-list/route.ts
// Helper endpoint for the report builder UI. Returns the list of
// distinct articles that have at least one tracked event in the
// rolling window, with their title and pub. Used to populate the
// article dropdown so the user picks from real data instead of
// typing IDs.
//
// Query params:
//   days (optional, default 60) — window to scan, clamped 1..365

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

export async function GET(req: NextRequest) {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfigured: PostHog env vars missing.' },
      { status: 500 },
    );
  }

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
    // Distinct articles with at least one open in the window, ordered by
    // open count desc so the most-engaged articles are at the top.
    //
    // BUG-35: older `article_opened` events were emitted before the tracker
    // attached `article_title` and `pub` properties — they showed up as
    // "[?] (untitled)" in the picker. Coalesce the column across every
    // plausible property name the tracker has used, and emptyString -> null
    // so the fallback in the row mapper applies.
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

    // PostHog rows: id -> { title, pub, opens }
    const posthogById = new Map<string, { title: string | null; pub: string | null; opens: number }>();
    for (const r of raw) {
      const row = r as [string, string | null, string | null, number];
      const id = String(row[0]);
      posthogById.set(id, {
        title: row[1] ?? null,
        pub: row[2] ?? null,
        opens: Number(row[3]),
      });
    }

    // Pull the current WP article lists so newly-synced articles appear in
    // the picker even if no one has opened them yet. Failure here must not
    // break the report builder — fall back to PostHog-only if WP is down.
    type LiveRow = { id: string; head: string; pub: 'realtyline' | 'newsline' };
    const live: LiveRow[] = [];
    try {
      const [austin, sa] = await Promise.all([
        getNewsRaw('austin').catch(() => []),
        getNewsRaw('san_antonio').catch(() => []),
      ]);
      for (const a of austin) live.push({ id: String(a.id), head: a.head, pub: 'realtyline' });
      for (const a of sa) live.push({ id: String(a.id), head: a.head, pub: 'newsline' });
    } catch {
      // Swallow — articles[] will still contain PostHog-only entries below.
    }

    // Union: every live WP article + any PostHog id we haven't already covered.
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

    // Sort: opens DESC, then title ASC so 0-open new articles cluster but stay alphabetical.
    articles.sort((a, b) => {
      if (b.opens !== a.opens) return b.opens - a.opens;
      return a.title.localeCompare(b.title);
    });

    return NextResponse.json({ ok: true, articles, range_days: days });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
