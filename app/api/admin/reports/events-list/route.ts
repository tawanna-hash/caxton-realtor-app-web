// app/api/admin/reports/events-list/route.ts
// Helper endpoint for the report builder UI. Returns distinct events
// that have at least one tracked event in the rolling window, with
// title and pub. Used to populate the event dropdown.
//
// Query params:
//   days (optional, default 60) — window to scan, clamped 1..365

import { NextRequest, NextResponse } from 'next/server';
import { getServerApiBase } from '@/lib/server-api-base';

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = 'https://us.posthog.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const API_URL = await getServerApiBase();
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

  const daysRaw = req.nextUrl.searchParams.get('days');
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 60;
  const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365
    ? daysParsed
    : 60;

  try {
    // Distinct events with at least one card_clicked or register_clicked
    // (the two events that carry event_title). Title pulled from either —
    // coalesce of any(register_clicked.title) then any(card_clicked.title).
    const raw = await runHogQL(`
      SELECT
        properties.event_id AS event_id,
        coalesce(
          any(if(event = 'event_register_clicked', properties.event_title, NULL)),
          any(if(event = 'event_card_clicked', properties.event_title, NULL))
        ) AS title,
        any(properties.pub) AS pub,
        countIf(event = 'event_card_clicked') AS card_clicks,
        countIf(event = 'event_register_clicked') AS registrations
      FROM events
      WHERE event IN ('event_card_clicked', 'event_register_clicked')
        AND properties.event_id IS NOT NULL
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY event_id
      ORDER BY (card_clicks + registrations) DESC
      LIMIT 200
    `);

    const events = raw.map((r) => {
      const row = r as [string, string | null, string | null, number, number];
      return {
        event_id: row[0],
        title: row[1] ?? '(untitled event)',
        pub: row[2] ?? null,
        card_clicks: Number(row[3]),
        registrations: Number(row[4]),
      };
    });

    return NextResponse.json({ ok: true, events, range_days: days });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
