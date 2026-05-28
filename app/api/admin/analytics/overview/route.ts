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

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getServerApiBase } from '@/lib/server-api-base';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

// Fetch subscriber total from the droplet. pageSize=1 keeps the payload tiny;
// the response still carries the full `total`. Per-market counts come from two
// more cheap calls (market filter is supported by the list endpoint).
async function fetchSubscriberCounts(cookieHeader: string): Promise<{
  total: number | null;
  austin: number | null;
  san_antonio: number | null;
}> {
  async function countFor(market?: 'austin' | 'san_antonio'): Promise<number | null> {
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: '1' });
      if (market) qs.set('market', market);
      const r = await fetch(`${API_URL}/admin/subscribers?${qs.toString()}`, {
        method: 'GET',
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      });
      if (!r.ok) return null;
      const data = (await r.json()) as { total?: number };
      return typeof data.total === 'number' ? data.total : null;
    } catch {
      return null;
    }
  }
  const [total, austin, san_antonio] = await Promise.all([
    countFor(),
    countFor('austin'),
    countFor('san_antonio'),
  ]);
  return { total, austin, san_antonio };
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
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
      fetchSubscriberCounts(cookieHeader || ''),
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
  } catch (err: unknown) {
    console.error('[admin/analytics/overview] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'database error', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
