// app/api/admin/reports/event/route.ts
// Per-event engagement report for client-facing handoff.
//
// Query params:
//   event_id (required) — the event being reported on
//   days     (optional, default 30) — rolling window, clamped 1..365
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

  const eventId = req.nextUrl.searchParams.get('event_id');
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: 'Missing required param: event_id' },
      { status: 400 },
    );
  }

  const daysRaw = req.nextUrl.searchParams.get('days');
  const daysParsed = daysRaw ? parseInt(daysRaw, 10) : 30;
  const days = Number.isFinite(daysParsed) && daysParsed >= 1 && daysParsed <= 365
    ? daysParsed
    : 30;

  const eid = escSql(eventId);

  try {
    // 1. Event meta — title and pub pulled from card_clicked or register_clicked.
    //    event_register_clicked carries event_title; event_card_clicked carries it too.
    const metaRaw = await runHogQL(`
      SELECT
        coalesce(
          any(if(event = 'event_register_clicked', properties.event_title, NULL)),
          any(if(event = 'event_card_clicked', properties.event_title, NULL))
        ) AS title,
        any(properties.pub) AS pub
      FROM events
      WHERE event IN ('event_card_clicked', 'event_register_clicked', 'event_added_to_calendar', 'event_shared', 'event_directions_clicked')
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const metaRow = (metaRaw[0] as [string | null, string | null] | undefined);
    const eventMeta = {
      event_id: eventId,
      title: metaRow?.[0] ?? null,
      pub: metaRow?.[1] ?? null,
    };

    // 2. Card clicks (top-of-funnel opens)
    const cardRaw = await runHogQL(`
      SELECT count() FROM events
      WHERE event = 'event_card_clicked'
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const card_clicks = Number((cardRaw[0] as [number])?.[0] ?? 0);

    // 3. Registrations
    const regRaw = await runHogQL(`
      SELECT count() FROM events
      WHERE event = 'event_register_clicked'
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const registrations = Number((regRaw[0] as [number])?.[0] ?? 0);

    // 4. Calendar adds
    const calRaw = await runHogQL(`
      SELECT count() FROM events
      WHERE event = 'event_added_to_calendar'
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const calendar_adds = Number((calRaw[0] as [number])?.[0] ?? 0);

    // 5. Directions clicks
    const dirRaw = await runHogQL(`
      SELECT count() FROM events
      WHERE event = 'event_directions_clicked'
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
    `);
    const directions_clicks = Number((dirRaw[0] as [number])?.[0] ?? 0);

    // 6. Shares by channel
    const sharesRaw = await runHogQL(`
      SELECT properties.channel AS channel, count() AS total
      FROM events
      WHERE event = 'event_shared'
        AND properties.event_id = '${eid}'
        AND timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY channel
      ORDER BY total DESC
    `);
    const shares = sharesRaw.map((r) => {
      const row = r as [string, number];
      return { channel: row[0] ?? 'unknown', total: Number(row[1]) };
    });
    const shares_total = shares.reduce((sum, s) => sum + s.total, 0);

    return NextResponse.json({
      ok: true,
      report: {
        event: eventMeta,
        range_days: days,
        card_clicks,
        registrations,
        calendar_adds,
        directions_clicks,
        shares,
        shares_total,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
