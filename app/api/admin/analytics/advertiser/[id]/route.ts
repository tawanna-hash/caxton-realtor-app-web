// app/api/admin/analytics/advertiser/[id]/route.ts
//
// GET /api/admin/analytics/advertiser/:id?from=ISO&to=ISO
//
// Returns full analytics for one advertiser over a date range:
//  - Summary stats (total / unique / hotspot count / avg-per-day / top day)
//  - Daily click series (zero-filled with generate_series)
//  - Per-hotspot breakdown (joined with magazines for issue label)
//
// Default range: last 30 days inclusive.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import type { Advertiser } from '@/lib/advertisers';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseQuery } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rangeQuerySchema = z.object({
  from: z.string().optional(),
  to:   z.string().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withAdminTracking(async (req: Request, ctx: RouteCtx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    throw new ApiError(400, 'invalid id');
  }

  // Parse date range from query, default = last 30 days inclusive.
  const { from: fromRaw, to: toRaw } = parseQuery(req, rangeQuerySchema);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  defaultFrom.setUTCHours(0, 0, 0, 0);

  const from = fromRaw ? new Date(fromRaw) : defaultFrom;
  const to   = toRaw   ? new Date(toRaw)   : today;
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new ApiError(400, 'invalid date range', { detail: 'invalid date' });
  }
  if (from > to) {
    throw new ApiError(400, 'invalid date range', { detail: 'from must be before to' });
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  {
    await ensureSchema();
    const sql = getSql();

    // 1. Advertiser row
    const advRows = (await sql`
      SELECT id, name, slug, share_token, contact_email,
             requires_email_gate, created_at, updated_at
      FROM advertisers WHERE id = ${idNum}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      throw new ApiError(404, 'advertiser not found');
    }
    const advertiser = advRows[0];

    // 2. Summary clicks + unique sessions
    const summaryRows = (await sql`
      SELECT
        COUNT(c.id)::int AS total_clicks,
        COUNT(DISTINCT c.session_id)::int AS unique_sessions
      FROM magazine_hotspot_clicks c
      JOIN magazine_hotspots h ON c.hotspot_id = h.id
      WHERE h.advertiser_id = ${idNum}
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
    `) as unknown as Array<{ total_clicks: number; unique_sessions: number }>;

    // 3. Hotspot count (regardless of date range)
    const hotspotCountRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM magazine_hotspots
      WHERE advertiser_id = ${idNum}
    `) as unknown as Array<{ count: number }>;

    // 4. Daily series, zero-filled via generate_series
    const dailyRows = (await sql`
      WITH dates AS (
        SELECT generate_series(
          ${fromIso}::date,
          ${toIso}::date,
          '1 day'::interval
        )::date AS d
      ),
      counts AS (
        SELECT DATE(c.occurred_at) AS d, COUNT(*)::int AS clicks
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON c.hotspot_id = h.id
        WHERE h.advertiser_id = ${idNum}
          AND c.occurred_at >= ${fromIso}
          AND c.occurred_at <= ${toIso}
        GROUP BY DATE(c.occurred_at)
      )
      SELECT
        dates.d::text AS date,
        COALESCE(counts.clicks, 0)::int AS clicks
      FROM dates
      LEFT JOIN counts ON dates.d = counts.d
      ORDER BY dates.d ASC
    `) as unknown as Array<{ date: string; clicks: number }>;

    // 5. Top day
    const topDayRows = (await sql`
      SELECT DATE(c.occurred_at)::text AS date, COUNT(*)::int AS clicks
      FROM magazine_hotspot_clicks c
      JOIN magazine_hotspots h ON c.hotspot_id = h.id
      WHERE h.advertiser_id = ${idNum}
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
      GROUP BY DATE(c.occurred_at)
      ORDER BY clicks DESC, date DESC
      LIMIT 1
    `) as unknown as Array<{ date: string; clicks: number }>;

    // 6. Hotspot breakdown
    const hotspotRows = (await sql`
      SELECT
        h.id AS hotspot_id,
        h.magazine_id,
        h.page_idx,
        h.label,
        h.type,
        h.config->>'url' AS config_url,
        h.is_published,
        m.publication,
        m.issue_label,
        COUNT(c.id)::int AS clicks,
        COUNT(DISTINCT c.session_id)::int AS unique_sessions
      FROM magazine_hotspots h
      LEFT JOIN magazines m ON h.magazine_id = m.id
      LEFT JOIN magazine_hotspot_clicks c ON c.hotspot_id = h.id
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
      WHERE h.advertiser_id = ${idNum}
      GROUP BY h.id, m.publication, m.issue_label, m.sort_date
      ORDER BY m.sort_date DESC NULLS LAST, h.page_idx ASC, h.id ASC
    `) as unknown as Array<{
      hotspot_id: number;
      magazine_id: number;
      page_idx: number;
      label: string | null;
      type: string;
      config_url: string | null;
      is_published: boolean;
      publication: string | null;
      issue_label: string | null;
      clicks: number;
      unique_sessions: number;
    }>;

    const totalClicks = summaryRows[0]?.total_clicks ?? 0;
    const uniqueSessions = summaryRows[0]?.unique_sessions ?? 0;
    const hotspotCount = hotspotCountRows[0]?.count ?? 0;
    const dayCount = Math.max(dailyRows.length, 1);
    const avgClicksPerDay = Math.round((totalClicks / dayCount) * 10) / 10;

    return NextResponse.json({
      advertiser,
      range: { from: fromIso, to: toIso },
      summary: {
        total_clicks: totalClicks,
        unique_sessions: uniqueSessions,
        hotspot_count: hotspotCount,
        avg_clicks_per_day: avgClicksPerDay,
        top_day: topDayRows[0] || null,
      },
      daily_clicks: dailyRows,
      hotspot_breakdown: hotspotRows.map((r) => ({
        hotspot_id: r.hotspot_id,
        magazine_id: r.magazine_id,
        magazine_label: [
          r.publication === 'austin' ? 'RealtyLine'
            : r.publication === 'san_antonio' ? 'Newsline San Antonio'
            : 'Magazine',
          r.issue_label || `#${r.magazine_id}`,
        ].join(' · '),
        page_idx: r.page_idx,
        label: r.label,
        type: r.type,
        config_url: r.config_url,
        is_published: r.is_published,
        clicks: r.clicks,
        unique_sessions: r.unique_sessions,
      })),
    });
  }
});
