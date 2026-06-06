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

    const articles = raw.map((r) => {
      const row = r as [string, string | null, string | null, number];
      const id = String(row[0]);
      // Article-id fallback is more useful than "(untitled)" — the admin can
      // at least look it up in the news feed by ID.
      return {
        article_id: id,
        title: row[1] ?? `Article #${id}`,
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
