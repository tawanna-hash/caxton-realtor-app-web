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

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseQuery } from '@/lib/server/schemas/_common';

const metricsQuerySchema = z.object({
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

export const GET = withErrorHandling(async (req: Request) => {
  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    throw new ApiError(500, 'Server misconfigured: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing.');
  }

  await requireAdmin();
  const { days } = parseQuery(req, metricsQuerySchema);

  {
    // 1. Event totals — last 7 days, by event name
    const eventTotalsRaw = await runHogQL(`
      SELECT event, count() AS total
      FROM events
      WHERE timestamp >= now() - INTERVAL ${days} DAY
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
      WHERE timestamp >= now() - INTERVAL ${days} DAY
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
      WHERE timestamp >= now() - INTERVAL ${days} DAY
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

    // 6. KPI summary — today / yesterday / last 7 days totals.
    //    Used by the KPITile components at the top of the dashboard.
    const kpiToday = await runHogQL(`
      SELECT count() FROM events
      WHERE toDate(timestamp) = today()
        AND event IN ('inventory_filter_clicked', 'builder_chip_clicked',
                      'inventory_card_clicked', 'builder_tab_clicked')
    `);
    const kpiYesterday = await runHogQL(`
      SELECT count() FROM events
      WHERE toDate(timestamp) = today() - 1
        AND event IN ('inventory_filter_clicked', 'builder_chip_clicked',
                      'inventory_card_clicked', 'builder_tab_clicked')
    `);
    const kpiWeek = await runHogQL(`
      SELECT count() FROM events
      WHERE timestamp >= now() - INTERVAL ${days} DAY
        AND event IN ('inventory_filter_clicked', 'builder_chip_clicked',
                      'inventory_card_clicked', 'builder_tab_clicked')
    `);
    const todayCount = Number((kpiToday[0] as [number])?.[0] ?? 0);
    const yesterdayCount = Number((kpiYesterday[0] as [number])?.[0] ?? 0);
    const weekCount = Number((kpiWeek[0] as [number])?.[0] ?? 0);
    const trendPct = yesterdayCount === 0
      ? (todayCount > 0 ? 100 : 0)
      : Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
    const kpi_summary = {
      today: todayCount,
      yesterday: yesterdayCount,
      week: weekCount,
      trend_pct: trendPct,
    };

    // 7. Pill engagement — Back/Share/Download/etc. across every surface
    //    that has a floating action pill (builder, communities,
    //    inventory, event, inventory_detail, magazine).
    //
    //    The events are surfaced under different names per surface; we
    //    map each to a (surface, action) tuple via a UNION query so the
    //    admin can see one consolidated table.
    const pillEngagementRaw = await runHogQL(`
      SELECT surface, action, count() AS total FROM (
        SELECT 'inventory'         AS surface, 'back'         AS action FROM events WHERE event = 'inventory_back_pill_clicked'        AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory'         AS surface, 'share'        AS action FROM events WHERE event = 'inventory_shared'                   AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory'         AS surface, 'download'     AS action FROM events WHERE event = 'inventory_download_pill_clicked'    AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory'         AS surface, 'save'        AS action FROM events WHERE event = 'inventory_saved'                   AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory'         AS surface, 'directions'  AS action FROM events WHERE event = 'inventory_directions_clicked'      AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory'         AS surface, 'contact'    AS action FROM events WHERE event = 'inventory_contact_clicked'       AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'back'         AS action FROM events WHERE event = 'communities_back_pill_clicked'      AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'share'        AS action FROM events WHERE event = 'communities_shared'                 AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'download'     AS action FROM events WHERE event = 'communities_download_pill_clicked'  AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'save'        AS action FROM events WHERE event = 'communities_saved'                 AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'contact'     AS action FROM events WHERE event = 'communities_contact_clicked'       AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities'       AS surface, 'directions'  AS action FROM events WHERE event = 'communities_directions_clicked'     AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'          AS surface, 'back'         AS action FROM events WHERE event = 'builder_back_pill_clicked'          AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'          AS surface, 'share'        AS action FROM events WHERE event = 'builder_shared'                     AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'          AS surface, 'download'     AS action FROM events WHERE event = 'builder_download_pill_clicked'      AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'          AS surface, 'save'        AS action FROM events WHERE event = 'builder_saved'                     AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'          AS surface, 'contact'    AS action FROM events WHERE event = 'builder_contact_clicked'       AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'             AS surface, 'back'         AS action FROM events WHERE event = 'event_back_pill_clicked'            AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'             AS surface, 'share'        AS action FROM events WHERE event = 'event_shared'                       AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'             AS surface, 'add_calendar' AS action FROM events WHERE event = 'event_added_to_calendar'            AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'             AS surface, 'directions'   AS action FROM events WHERE event = 'event_directions_clicked'           AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'             AS surface, 'register'     AS action FROM events WHERE event = 'event_register_clicked'             AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'inventory_detail'  AS surface, properties.action AS action FROM events WHERE event = 'inventory_floater_clicked'      AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'magazine'          AS surface, 'share'        AS action FROM events WHERE event = 'flipbook_shared'                    AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'magazine'          AS surface, 'download'     AS action FROM events WHERE event = 'flipbook_download_clicked'         AND timestamp >= now() - INTERVAL ${days} DAY
      )
      GROUP BY surface, action
      ORDER BY total DESC
    `);
    const pill_engagement = pillEngagementRaw.map((row) => {
      const r = row as [string, string, number];
      return { surface: r[0] ?? '?', action: r[1] ?? '?', total: Number(r[2]) };
    });

    // 8. Share breakdown — native vs copy across every share surface.
    const shareBreakdownRaw = await runHogQL(`
      SELECT surface, channel, count() AS total FROM (
        SELECT 'inventory'   AS surface, properties.channel AS channel FROM events WHERE event = 'inventory_shared'   AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'communities' AS surface, properties.channel AS channel FROM events WHERE event = 'communities_shared' AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'builders'    AS surface, properties.channel AS channel FROM events WHERE event = 'builder_shared'     AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'event'       AS surface, properties.channel AS channel FROM events WHERE event = 'event_shared'       AND timestamp >= now() - INTERVAL ${days} DAY
        UNION ALL
        SELECT 'magazine'    AS surface, properties.channel AS channel FROM events WHERE event = 'flipbook_shared'    AND timestamp >= now() - INTERVAL ${days} DAY
      )
      GROUP BY surface, channel
      ORDER BY total DESC
    `);
    const share_breakdown = shareBreakdownRaw.map((row) => {
      const r = row as [string, string, number];
      return { surface: r[0] ?? '?', channel: r[1] ?? 'unknown', total: Number(r[2]) };
    });

    return NextResponse.json({
      ok: true,
      metrics: {
        event_totals,
        filter_usage,
        top_builders,
        top_inventory,
        time_series,
        kpi_summary,
        pill_engagement,
        share_breakdown,
      },
    });
  }
})
