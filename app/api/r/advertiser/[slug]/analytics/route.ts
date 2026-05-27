// app/api/r/advertiser/[slug]/analytics/route.ts
//
// Public analytics endpoint. Returns same shape as the admin one
// but only includes PUBLISHED hotspots (drafts hidden from advertisers).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { grantCookieName, isCookieGrantValid } from '@/lib/advertiser-grants';
import { ensurePublicationColumn } from '@/lib/publication-theme';
import type { Advertiser } from '@/lib/advertisers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const t = url.searchParams.get('t');

  try {
    await ensureSchema();
    await ensurePublicationColumn();
    const sql = getSql();

    const advRows = (await sql`
      SELECT * FROM advertisers WHERE slug = ${slug}
    `) as unknown as Advertiser[];
    if (advRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const advertiser = advRows[0];

    const cookieValue = req.cookies.get(grantCookieName(advertiser.id))?.value;
    const cookieOk = await isCookieGrantValid(advertiser.id, cookieValue);
    const tokenOk = !!t && t === advertiser.share_token;

    const authorized = advertiser.requires_email_gate
      ? cookieOk
      : (tokenOk || cookieOk);
    if (!authorized) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const defaultFrom = new Date(today);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    defaultFrom.setUTCHours(0, 0, 0, 0);

    let from: Date;
    let to: Date;
    try {
      from = url.searchParams.get('from')
        ? new Date(url.searchParams.get('from')!)
        : defaultFrom;
      to = url.searchParams.get('to')
        ? new Date(url.searchParams.get('to')!)
        : today;
      if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error('invalid date');
      if (from > to) throw new Error('from > to');
    } catch (err) {
      return NextResponse.json(
        { error: 'invalid date range', detail: errMessage(err) },
        { status: 400 },
      );
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const summaryRows = (await sql`
      SELECT
        COUNT(c.id)::int AS total_clicks,
        COUNT(DISTINCT c.session_id)::int AS unique_sessions
      FROM magazine_hotspot_clicks c
      JOIN magazine_hotspots h ON c.hotspot_id = h.id
      WHERE h.advertiser_id = ${advertiser.id}
        AND h.is_published = true
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
    `) as unknown as Array<{ total_clicks: number; unique_sessions: number }>;

    const hotspotCountRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM magazine_hotspots
      WHERE advertiser_id = ${advertiser.id} AND is_published = true
    `) as unknown as Array<{ count: number }>;

    const dailyRows = (await sql`
      WITH dates AS (
        SELECT generate_series(${fromIso}::date, ${toIso}::date, '1 day'::interval)::date AS d
      ),
      counts AS (
        SELECT DATE(c.occurred_at) AS d, COUNT(*)::int AS clicks
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON c.hotspot_id = h.id
        WHERE h.advertiser_id = ${advertiser.id}
          AND h.is_published = true
          AND c.occurred_at >= ${fromIso}
          AND c.occurred_at <= ${toIso}
        GROUP BY DATE(c.occurred_at)
      )
      SELECT dates.d::text AS date, COALESCE(counts.clicks, 0)::int AS clicks
      FROM dates LEFT JOIN counts ON dates.d = counts.d
      ORDER BY dates.d ASC
    `) as unknown as Array<{ date: string; clicks: number }>;

    const topDayRows = (await sql`
      SELECT DATE(c.occurred_at)::text AS date, COUNT(*)::int AS clicks
      FROM magazine_hotspot_clicks c
      JOIN magazine_hotspots h ON c.hotspot_id = h.id
      WHERE h.advertiser_id = ${advertiser.id}
        AND h.is_published = true
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
      GROUP BY DATE(c.occurred_at)
      ORDER BY clicks DESC, date DESC
      LIMIT 1
    `) as unknown as Array<{ date: string; clicks: number }>;

    const hotspotRows = (await sql`
      SELECT
        h.page_idx,
        h.label,
        h.config->>'url' AS config_url,
        h.magazine_id,
        m.publication,
        m.issue_label,
        COUNT(c.id)::int AS clicks,
        COUNT(DISTINCT c.session_id)::int AS unique_sessions
      FROM magazine_hotspots h
      LEFT JOIN magazines m ON h.magazine_id = m.id
      LEFT JOIN magazine_hotspot_clicks c ON c.hotspot_id = h.id
        AND c.occurred_at >= ${fromIso}
        AND c.occurred_at <= ${toIso}
      WHERE h.advertiser_id = ${advertiser.id}
        AND h.is_published = true
      GROUP BY h.id, m.publication, m.issue_label
      ORDER BY clicks DESC, h.id
    `) as unknown as Array<{
      page_idx: number;
      label: string | null;
      config_url: string | null;
      magazine_id: number;
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
      advertiser: {
        id: advertiser.id,
        name: advertiser.name,
        slug: advertiser.slug,
        publication: advertiser.publication,
      },
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
        magazine_label: [
          r.publication === 'austin' ? 'RealtyLine'
            : r.publication === 'san_antonio' ? 'Newsline SA'
            : 'Magazine',
          r.issue_label || `#${r.magazine_id}`,
        ].join(' · '),
        page_idx: r.page_idx,
        label: r.label,
        config_url: r.config_url,
        clicks: r.clicks,
        unique_sessions: r.unique_sessions,
      })),
    });
  } catch (err) {
    console.error('[r/advertiser/:slug/analytics]', errMessage(err));
    return NextResponse.json(
      { error: 'analytics failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
