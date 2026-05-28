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
    const raw = await runHogQL(`
      SELECT
        properties.article_id AS article_id,
        any(properties.article_title) AS title,
        any(properties.pub) AS pub,
        count() AS opens
      FROM events
      WHERE event = 'article_opened'
        AND properties.article_id IS NOT NULL
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY article_id
      ORDER BY opens DESC
      LIMIT 200
    `);

    const articles = raw.map((r) => {
      const row = r as [string, string | null, string | null, number];
      return {
        article_id: row[0],
        title: row[1] ?? '(untitled)',
        pub: row[2] ?? null,
        opens: Number(row[3]),
      };
    });

    return NextResponse.json({ ok: true, articles, range_days: days });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
