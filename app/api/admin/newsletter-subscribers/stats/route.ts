/**
 * GET /api/admin/newsletter-subscribers/stats?days=30
 *
 * Aggregated metrics for the newsletter_subscribers table. Used by the
 * /admin/metrics page to surface signup velocity, source mix, and pub split.
 *
 * Returns:
 *   {
 *     totals: { active, unsubscribed, total },
 *     last_7_days: number,
 *     last_30_days: number,
 *     time_series: { date: 'YYYY-MM-DD', count: number }[],   // daily signups
 *     by_source: { source: string, count: number }[],
 *     by_publication: { publication: string, count: number }[]
 *   }
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get('days') || '30');
  const days = Math.min(365, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));

  const sql = getSql();

  const totalsRows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed,
      COUNT(*)::int AS total
    FROM newsletter_subscribers
  `) as Array<{ active: number; unsubscribed: number; total: number }>;
  const totals = totalsRows[0] ?? { active: 0, unsubscribed: 0, total: 0 };

  const recentRows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30
    FROM newsletter_subscribers
  `) as Array<{ last_7: number; last_30: number }>;
  const last7 = recentRows[0]?.last_7 ?? 0;
  const last30 = recentRows[0]?.last_30 ?? 0;

  // Daily signup buckets over the requested window. We generate the date
  // spine via generate_series so empty days return 0 instead of being missing.
  const timeSeries = (await sql`
    WITH spine AS (
      SELECT generate_series(
        (CURRENT_DATE - (${days - 1} || ' days')::interval)::date,
        CURRENT_DATE,
        '1 day'::interval
      )::date AS d
    )
    SELECT
      to_char(spine.d, 'YYYY-MM-DD') AS date,
      COALESCE(COUNT(ns.id), 0)::int AS count
    FROM spine
    LEFT JOIN newsletter_subscribers ns
      ON ns.created_at::date = spine.d
    GROUP BY spine.d
    ORDER BY spine.d ASC
  `) as Array<{ date: string; count: number }>;

  const bySource = (await sql`
    SELECT source, COUNT(*)::int AS count
    FROM newsletter_subscribers
    GROUP BY source
    ORDER BY count DESC
    LIMIT 20
  `) as Array<{ source: string; count: number }>;

  const byPub = (await sql`
    SELECT publication, COUNT(*)::int AS count
    FROM newsletter_subscribers
    GROUP BY publication
    ORDER BY count DESC
  `) as Array<{ publication: string; count: number }>;

  return NextResponse.json({
    totals,
    last_7_days: last7,
    last_30_days: last30,
    days,
    time_series: timeSeries,
    by_source: bySource,
    by_publication: byPub,
  });
});
