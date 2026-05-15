// app/api/admin/reports/article/route.ts
// Per-article engagement report for client-facing handoff.
//
// Query params:
//   article_id (required) — the article being reported on
//   days       (optional, default 30) — rolling window, clamped 1..365
//
// Auth: admin cookie (same pattern as /api/admin/metrics).

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = 'https://us.posthog.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
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

function escSql(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function GET(req: NextRequest) {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    return NextResponse.json(
      { ok: false, error: 'Server misconfigured: PostHog env vars missing.' },
      { status: 500 },
    );
  }

  const isAdmin = await verifyAdmin(req.headers.get('cookie'));
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const articleId = req.nextUrl.searchParams.get('article_id');
  if (!articleId) {
    return NextResponse.json(
      { ok: false, error: 'Missing required param: article_id' },
      { status: 400 },
    );
  }

  const daysRaw = req.nextUrl.searchParams.get('days');
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 30;
  const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365
    ? daysParsed
    : 30;

  const aid = escSql(articleId);

  try {
    // 1. Article meta — title, pub, category (pulled from any tracked event)
    const metaRaw = await runHogQL(`
      SELECT
        any(properties.article_title) AS title,
        any(properties.pub) AS pub,
        any(properties.article_cat) AS cat
      FROM events
      WHERE event = 'article_opened'
        AND properties.article_id = '${aid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const metaRow = (metaRaw[0] as [string | null, string | null, string | null] | undefined);
    const articleMeta = {
      article_id: articleId,
      title: metaRow?.[0] ?? null,
      pub: metaRow?.[1] ?? null,
      cat: metaRow?.[2] ?? null,
    };

    // 2. Opens / clicks total
    const opensRaw = await runHogQL(`
      SELECT count() FROM events
      WHERE event = 'article_opened'
        AND properties.article_id = '${aid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const opens = Number((opensRaw[0] as [number])?.[0] ?? 0);

    // 3. Shares by channel
    const sharesRaw = await runHogQL(`
      SELECT properties.channel AS channel, count() AS total
      FROM events
      WHERE event = 'article_shared'
        AND properties.article_id = '${aid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY channel
      ORDER BY total DESC
    `);
    const shares = sharesRaw.map((r) => {
      const row = r as [string, number];
      return { channel: row[0] ?? 'unknown', total: Number(row[1]) };
    });
    const sharesTotal = shares.reduce((sum, s) => sum + s.total, 0);

    // 4. Scroll milestones
    const scrollRaw = await runHogQL(`
      SELECT properties.milestone AS milestone, count() AS total
      FROM events
      WHERE event = 'article_scroll_milestone'
        AND properties.article_id = '${aid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY milestone
      ORDER BY milestone ASC
    `);
    const scroll = scrollRaw.map((r) => {
      const row = r as [string | number, number];
      return { milestone: Number(row[0]), total: Number(row[1]) };
    });

    // 5. Avg time on article (from article_back_clicked time_on_article_ms)
    const timeRaw = await runHogQL(`
      SELECT
        avg(toFloat(properties.time_on_article_ms)) AS avg_ms,
        count() AS sessions
      FROM events
      WHERE event = 'article_back_clicked'
        AND properties.article_id = '${aid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const timeRow = (timeRaw[0] as [number | null, number] | undefined);
    const avgMs = Number(timeRow?.[0] ?? 0);
    const sessions = Number(timeRow?.[1] ?? 0);

    // 6. Saves (article_saved minus article_unsaved gives net saves over period)
    const savesRaw = await runHogQL(`
      SELECT
        (SELECT count() FROM events WHERE event = 'article_saved'
           AND properties.article_id = '${aid}'
           AND timestamp >= now() - INTERVAL ${days} DAY) AS saves,
        (SELECT count() FROM events WHERE event = 'article_unsaved'
           AND properties.article_id = '${aid}'
           AND timestamp >= now() - INTERVAL ${days} DAY) AS unsaves
    `);
    const savesRow = (savesRaw[0] as [number, number] | undefined);
    const saves = Number(savesRow?.[0] ?? 0);
    const unsaves = Number(savesRow?.[1] ?? 0);

    return NextResponse.json({
      ok: true,
      report: {
        article: articleMeta,
        range_days: days,
        opens,
        shares,
        shares_total: sharesTotal,
        scroll,
        avg_time_on_article_ms: avgMs,
        sessions_with_time: sessions,
        saves,
        unsaves,
        net_saves: saves - unsaves,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
