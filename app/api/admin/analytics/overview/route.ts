// app/api/admin/analytics/overview/route.ts
//
// Phase 6b: cross-system "at a glance" KPIs for the strip atop /admin/analytics.
// Pure-Postgres KPIs (fast) run in one batch; the subscriber total comes from
// the droplet API (subscribers don't live in Neon). Both run in parallel.
//
// Returns:
//   subscribers:      { total, austin, san_antonio }   (austin/san_antonio may be null if unavailable)
//   magazineClicks30d: number                            (hotspot clicks in the last 30 days)
//   publishedHotspots: number                            (currently published hotspots)
//   linkedAdvertisers: number                            (advertisers with >=1 linked hotspot)
//   topAdvertiser:    { name, clicks } | null            (most-clicked advertiser, 30 days)
//
// Auth: forwards the admin cookie to the droplet /admin/auth/me, same as the
// rest of /api/admin/*.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { query } from '@/lib/server/db/neon';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Subscriber totals in a single grouped query (previously five listSubscribers
// calls = ten queries, which made this endpoint take ~3s). email_verifications
// is keyed by email, so the old join never changed the counts.
async function fetchSubscriberCounts(): Promise<{
  total: number | null;
  austin: number | null;
  san_antonio: number | null;
  houston: number | null;
  dallas: number | null;
}> {
  try {
    const rows = await query<{ total: number; austin: number; san_antonio: number; houston: number; dallas: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE market = 'austin')::int AS austin,
              COUNT(*) FILTER (WHERE market = 'san_antonio')::int AS san_antonio,
              COUNT(*) FILTER (WHERE market = 'houston')::int AS houston,
              COUNT(*) FILTER (WHERE market = 'dallas')::int AS dallas
         FROM realtors`,
      [],
    );
    const r = rows[0];
    return { total: r?.total ?? null, austin: r?.austin ?? null, san_antonio: r?.san_antonio ?? null, houston: r?.houston ?? null, dallas: r?.dallas ?? null };
  } catch {
    return { total: null, austin: null, san_antonio: null, houston: null, dallas: null };
  }
}

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  {
    const sql = getSql();

    // Run the Postgres rollups and the droplet subscriber fetch in parallel.
    const [
      clicks30dRows,
      publishedRows,
      linkedAdvRows,
      topAdvRows,
      subscribers,
    ] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS n
        FROM magazine_hotspot_clicks
        WHERE occurred_at >= NOW() - INTERVAL '30 days'
      ` as unknown as Promise<Array<{ n: number }>>,
      sql`
        SELECT COUNT(*)::int AS n
        FROM magazine_hotspots
        WHERE is_published = true
      ` as unknown as Promise<Array<{ n: number }>>,
      sql`
        SELECT COUNT(DISTINCT advertiser_id)::int AS n
        FROM magazine_hotspots
        WHERE advertiser_id IS NOT NULL
      ` as unknown as Promise<Array<{ n: number }>>,
      sql`
        SELECT a.name AS name, COUNT(c.id)::int AS clicks
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON h.id = c.hotspot_id
        JOIN advertisers a ON a.id = h.advertiser_id
        WHERE c.occurred_at >= NOW() - INTERVAL '30 days'
        GROUP BY a.name
        ORDER BY clicks DESC
        LIMIT 1
      ` as unknown as Promise<Array<{ name: string; clicks: number }>>,
      fetchSubscriberCounts(),
    ]);

    const topAdvertiser = topAdvRows.length > 0
      ? { name: topAdvRows[0].name, clicks: topAdvRows[0].clicks }
      : null;

    return NextResponse.json({
      subscribers,
      magazineClicks30d: clicks30dRows[0]?.n ?? 0,
      publishedHotspots: publishedRows[0]?.n ?? 0,
      linkedAdvertisers: linkedAdvRows[0]?.n ?? 0,
      topAdvertiser,
    });
  }
});
