// app/api/admin/metrics/route.ts
// Admin endpoint: queries PostHog HogQL API for click telemetry rollups.
// Returns four buckets used by /admin/metrics:
//   1. event_totals — count of each event over last 7 days
//   2. filter_usage — inventory_filter_clicked breakdown by filter value
//   3. top_builders — builder_chip_clicked grouped by builder_name (30d)
//   4. top_inventory — inventory_card_clicked grouped by row_id + builder (30d)
//
// Auth: forwards admin cookie to droplet /admin/auth/me (same pattern as
// the other /api/admin/* routes).

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
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query },
      }),
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
      { ok: false, error: 'Server misconfigured: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing.' },
      { status: 500 },
    );
  }

  const isAdmin = await verifyAdmin(req.headers.get('cookie'));
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Event totals — last 7 days, by event name
    const eventTotalsRaw = await runHogQL(`
      SELECT event, count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL 7 DAY
        AND event IN (
          'inventory_filter_clicked',
          'builder_chip_clicked',
          'inventory_card_clicked',
          'builder_tab_clicked'
        )
      GROUP BY event
      ORDER BY total DESC
    `);
    const event_totals = eventTotalsRaw.map((row) => {
      const r = row as [string, number];
      return { event: r[0], total: Number(r[1]) };
    });

    // 2. Filter usage breakdown — last 7 days
    const filterUsageRaw = await runHogQL(`
      SELECT properties.filter AS filter, count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL 7 DAY
        AND event = 'inventory_filter_clicked'
      GROUP BY filter
      ORDER BY total DESC
    `);
    const filter_usage = filterUsageRaw.map((row) => {
      const r = row as [string, number];
      return { filter: r[0] ?? 'unknown', total: Number(r[1]) };
    });

    // 3. Top builders — last 30 days, builder_chip_clicked
    const topBuildersRaw = await runHogQL(`
      SELECT
        properties.builder_name AS builder_name,
        properties.source_page AS source_page,
        count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event = 'builder_chip_clicked'
      GROUP BY builder_name, source_page
      ORDER BY total DESC
      LIMIT 20
    `);
    const top_builders = topBuildersRaw.map((row) => {
      const r = row as [string, string, number];
      return { builder_name: r[0] ?? 'unknown', source_page: r[1] ?? '?', total: Number(r[2]) };
    });

    // 4. Top inventory cards — last 30 days
    const topInventoryRaw = await runHogQL(`
      SELECT
        properties.builder_name AS builder_name,
        properties.row_id AS row_id,
        properties.kind AS kind,
        properties.destination AS destination,
        count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
        AND event = 'inventory_card_clicked'
      GROUP BY builder_name, row_id, kind, destination
      ORDER BY total DESC
      LIMIT 30
    `);
    const top_inventory = topInventoryRaw.map((row) => {
      const r = row as [string, string, string, string, number];
      return {
        builder_name: r[0] ?? 'unknown',
        row_id: r[1] ?? '?',
        kind: r[2] ?? '?',
        destination: r[3] ?? '?',
        total: Number(r[4]),
      };
    });

    // 5. Time series — events per day, last 7 days, grouped by event.
    //    Used by the TimeSeriesChart component (Commit 4).
    const timeSeriesRaw = await runHogQL(`
      SELECT
        toDate(timestamp) AS day,
        event,
        count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL 7 DAY
        AND event IN (
          'inventory_filter_clicked',
          'builder_chip_clicked',
          'inventory_card_clicked',
          'builder_tab_clicked'
        )
      GROUP BY day, event
      ORDER BY day ASC
    `);
    const time_series = timeSeriesRaw.map((row) => {
      const r = row as [string, string, number];
      return { day: r[0], event: r[1], total: Number(r[2]) };
    });

    return NextResponse.json({
      ok: true,
      metrics: { event_totals, filter_usage, top_builders, top_inventory, time_series },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/metrics] error:', message);
    return NextResponse.json(
      { ok: false, error: 'Metrics query failed. Check Vercel logs.' },
      { status: 500 },
    );
  }
}
