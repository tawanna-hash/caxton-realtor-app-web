// app/api/admin/metrics/trending/route.ts
// Admin endpoint: PostHog HogQL rollups for the trending ticker.
// Returns:
//   - totals: impressions, clicks, dismissals, navs
//   - ctr, dismissal_rate
//   - top_items: per trending_id (headline, impressions, clicks, ctr)
//   - by_market: realtyline vs newsline split
//
// Same auth / error pattern as /api/admin/metrics.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseQuery } from '@/lib/server/schemas/_common';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = 'https://us.posthog.com';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

export const GET = withAdminTracking(async (req: Request) => {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new ApiError(500, 'Server misconfigured: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing.');
  }

  await requireAdmin();
  const { days } = parseQuery(req, querySchema);

  // 1. Totals per event
  const totalsRaw = await runHogQL(`
    SELECT event, count() AS total
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN (
        'trending_impression',
        'trending_click',
        'trending_dismissed',
        'trending_nav',
        'trending_loaded'
      )
    GROUP BY event
  `);
  const totalsMap: Record<string, number> = {};
  totalsRaw.forEach((row) => {
    const r = row as [string, number];
    totalsMap[r[0]] = Number(r[1]);
  });
  const impressions = totalsMap['trending_impression'] ?? 0;
  const clicks = totalsMap['trending_click'] ?? 0;
  const dismissals = totalsMap['trending_dismissed'] ?? 0;
  const navs = totalsMap['trending_nav'] ?? 0;
  const loaded = totalsMap['trending_loaded'] ?? 0;

  const ctr = impressions === 0 ? 0 : Math.round((clicks / impressions) * 1000) / 10;
  const dismissal_rate = impressions === 0 ? 0 : Math.round((dismissals / impressions) * 1000) / 10;

  // 2. Top items — per trending_id, joined by headline
  const topItemsRaw = await runHogQL(`
    SELECT
      properties.trending_id AS trending_id,
      any(properties.headline) AS headline,
      countIf(event = 'trending_impression') AS impressions,
      countIf(event = 'trending_click') AS clicks,
      countIf(event = 'trending_dismissed') AS dismissals
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN ('trending_impression', 'trending_click', 'trending_dismissed')
      AND properties.trending_id IS NOT NULL
    GROUP BY trending_id
    ORDER BY impressions DESC
    LIMIT 20
  `);
  const top_items = topItemsRaw.map((row) => {
    const r = row as [string, string, number, number, number];
    const impr = Number(r[2]);
    const clk = Number(r[3]);
    return {
      trending_id: r[0] ?? '?',
      headline: r[1] ?? '(no headline)',
      impressions: impr,
      clicks: clk,
      dismissals: Number(r[4]),
      ctr: impr === 0 ? 0 : Math.round((clk / impr) * 1000) / 10,
    };
  });

  // 3. Split by market
  const byMarketRaw = await runHogQL(`
    SELECT
      properties.market AS market,
      countIf(event = 'trending_impression') AS impressions,
      countIf(event = 'trending_click') AS clicks
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN ('trending_impression', 'trending_click')
      AND properties.market IS NOT NULL
    GROUP BY market
    ORDER BY impressions DESC
  `);
  const by_market = byMarketRaw.map((row) => {
    const r = row as [string, number, number];
    const impr = Number(r[1]);
    const clk = Number(r[2]);
    return {
      market: r[0] ?? 'unknown',
      impressions: impr,
      clicks: clk,
      ctr: impr === 0 ? 0 : Math.round((clk / impr) * 1000) / 10,
    };
  });

  return NextResponse.json({
    ok: true,
    metrics: {
      totals: { impressions, clicks, dismissals, navs, loaded },
      ctr,
      dismissal_rate,
      top_items,
      by_market,
      days,
    },
  });
});
