// app/api/admin/analytics/hotspot-performance/route.ts
//
// Phase 6c: rankings for the "Hotspot performance" section on /admin/analytics.
// Two 30-day rollups, Postgres only:
//   topAdvertisers: [{ name, clicks, hotspots }]   ordered by clicks desc
//   topHotspots:    [{ id, label, advertiserName, publicationLabel, issueLabel, page, clicks }]
//
// Auth + SQL patterns match /api/admin/analytics/overview and the advertiser
// drill-down (publication -> label mapping reused).

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

function publicationLabel(pub: string | null): string {
  if (pub === 'austin') return 'RealtyLine';
  if (pub === 'san_antonio') return 'Newsline SA';
  return '—';
}

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const [advRows, hotspotRows] = await Promise.all([
      // Top advertisers by clicks (30d), with count of distinct hotspots that fired.
      sql`
        SELECT
          a.name AS name,
          COUNT(c.id)::int AS clicks,
          COUNT(DISTINCT h.id)::int AS hotspots
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON h.id = c.hotspot_id
        JOIN advertisers a ON a.id = h.advertiser_id
        WHERE c.occurred_at >= NOW() - INTERVAL '30 days'
        GROUP BY a.name
        ORDER BY clicks DESC, a.name ASC
        LIMIT 10
      ` as unknown as Promise<Array<{ name: string; clicks: number; hotspots: number }>>,
      // Top hotspots by clicks (30d), labeled with magazine + advertiser context.
      sql`
        SELECT
          h.id AS id,
          h.label AS label,
          h.advertiser_name AS advertiser_name,
          m.publication AS publication,
          m.issue_label AS issue_label,
          h.page_idx AS page_idx,
          COUNT(c.id)::int AS clicks
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON h.id = c.hotspot_id
        LEFT JOIN magazines m ON m.id = h.magazine_id
        WHERE c.occurred_at >= NOW() - INTERVAL '30 days'
        GROUP BY h.id, h.label, h.advertiser_name, m.publication, m.issue_label, h.page_idx
        ORDER BY clicks DESC, h.id ASC
        LIMIT 10
      ` as unknown as Promise<Array<{
        id: number;
        label: string | null;
        advertiser_name: string | null;
        publication: string | null;
        issue_label: string | null;
        page_idx: number;
        clicks: number;
      }>>,
    ]);

    const topAdvertisers = advRows.map((r) => ({
      name: r.name,
      clicks: r.clicks,
      hotspots: r.hotspots,
    }));

    const topHotspots = hotspotRows.map((r) => ({
      id: r.id,
      label: r.label,
      advertiserName: r.advertiser_name,
      publicationLabel: publicationLabel(r.publication),
      issueLabel: r.issue_label || `#${r.id}`,
      page: r.page_idx + 1, // 1-based for display
      clicks: r.clicks,
    }));

    return NextResponse.json({ topAdvertisers, topHotspots });
  } catch (err: unknown) {
    console.error('[admin/analytics/hotspot-performance] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'database error', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
