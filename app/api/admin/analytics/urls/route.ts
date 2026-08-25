// app/api/admin/analytics/urls/route.ts
//
// URL rollup analytics. Aggregates magazine_hotspot_clicks by the outbound
// URL (domain + path, query string stripped) so publisher / partner / any
// destination link can be measured without needing an advertisers row.
//
// This is the data source for /admin/analytics/urls. Complements the
// per-advertiser analytics at /admin/analytics/advertiser/[id]: those roll
// up by advertiser identity, this one rolls up by URL identity — useful
// when the destination isn't in the CRM (RealtyLine masthead, ABoR /
// UnlockMLS, external partners, campaign landing pages, etc.).
//
// Query params:
//   from            ISO date (default: 30 days ago)
//   to              ISO date (default: now)
//   publication     'austin' | 'san_antonio' | omitted for all
//   magazineId      restrict to a single magazine (int)
//   page            1-based page number (default 1)
//   pageSize        rows per page (default 50, max 200)
//
// Response shape:
//   { rows: UrlRollupRow[], total: number, page, pageSize, from, to }

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface UrlRollupRow {
  url_key: string;             // domain + path, no query, no fragment
  display_url: string;         // https://<url_key>
  clicks: number;              // total click events in range
  unique_sessions: number;     // distinct session_id in range
  magazines: number;           // distinct magazine_ids where this URL appeared
  hotspots: number;            // distinct hotspot rows with this URL
  first_click_at: string | null;
  last_click_at: string | null;
}

function parseDate(v: string | null, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function clampInt(v: string | null, def: number, min: number, max: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// SQL fragment that normalizes magazine_hotspots.config->>'url' into a
// dedupe key: lowercase, no scheme, no www., no query, no fragment, no
// trailing slash. Kept as a constant so the two queries below share the
// exact same expression and Postgres can plan them identically.
//
// Steps (innermost first):
//   1. lower(url)
//   2. strip fragment  (#...)
//   3. strip query     (?...)
//   4. strip scheme    (http:// or https://)
//   5. strip leading www.
//   6. drop trailing slash
const URL_KEY_SQL = `
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(h.config->>'url'), '#.*$', ''),
          '\\?.*$', ''
        ),
        '^https?://', ''
      ),
      '^www\\.', ''
    ),
    '/+$', ''
  )
`;

export const GET = withAdminTracking(async (req: NextRequest) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const url = new URL(req.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(url.searchParams.get('from'), defaultFrom);
  const to = parseDate(url.searchParams.get('to'), now);
  const publication = url.searchParams.get('publication'); // 'austin' | 'san_antonio' | null
  const magazineIdRaw = url.searchParams.get('magazineId');
  const magazineId = magazineIdRaw ? parseInt(magazineIdRaw, 10) : null;
  const page = clampInt(url.searchParams.get('page'), 1, 1, 10000);
  const pageSize = clampInt(url.searchParams.get('pageSize'), 50, 1, 200);
  const offset = (page - 1) * pageSize;

  // Build the WHERE clause with positional params. sql.query() is the neon
  // driver's escape hatch for dynamic SQL — cleaner than composing nested
  // tagged templates when the WHERE varies by filter presence.
  const where: string[] = [
    `c.occurred_at >= $1`,
    `c.occurred_at <= $2`,
    `h.type = 'link'`,
    `h.config ? 'url'`,
  ];
  const params: unknown[] = [from.toISOString(), to.toISOString()];

  if (publication === 'austin' || publication === 'san_antonio') {
    params.push(publication);
    where.push(`m.publication = $${params.length}`);
  }
  if (magazineId && Number.isFinite(magazineId)) {
    params.push(magazineId);
    where.push(`h.magazine_id = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  // Count of distinct url_keys for pagination.
  const totalRes = await sql.query(
    `
      SELECT COUNT(*)::int AS total FROM (
        SELECT ${URL_KEY_SQL} AS url_key
        FROM magazine_hotspot_clicks c
        JOIN magazine_hotspots h ON h.id = c.hotspot_id
        LEFT JOIN magazines m ON m.id = h.magazine_id
        WHERE ${whereSql}
        GROUP BY 1
      ) t
    `,
    params,
  ) as unknown as { rows: Array<{ total: number }> };
  const total = totalRes.rows[0]?.total ?? 0;

  // Paginated rollup query — same filters, same URL_KEY_SQL.
  const pageSizeParam = params.length + 1;
  const offsetParam = params.length + 2;
  const dataParams = [...params, pageSize, offset];

  const dataRes = await sql.query(
    `
      SELECT
        ${URL_KEY_SQL}                             AS url_key,
        COUNT(*)::int                              AS clicks,
        COUNT(DISTINCT c.session_id)::int          AS unique_sessions,
        COUNT(DISTINCT h.magazine_id)::int         AS magazines,
        COUNT(DISTINCT h.id)::int                  AS hotspots,
        MIN(c.occurred_at)                         AS first_click_at,
        MAX(c.occurred_at)                         AS last_click_at
      FROM magazine_hotspot_clicks c
      JOIN magazine_hotspots h ON h.id = c.hotspot_id
      LEFT JOIN magazines m ON m.id = h.magazine_id
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY clicks DESC, url_key ASC
      LIMIT $${pageSizeParam} OFFSET $${offsetParam}
    `,
    dataParams,
  ) as unknown as {
    rows: Array<{
      url_key: string;
      clicks: number;
      unique_sessions: number;
      magazines: number;
      hotspots: number;
      first_click_at: string | Date | null;
      last_click_at: string | Date | null;
    }>;
  };

  const out: UrlRollupRow[] = dataRes.rows.map((r) => ({
    url_key: r.url_key,
    display_url: r.url_key ? `https://${r.url_key}` : '',
    clicks: r.clicks,
    unique_sessions: r.unique_sessions,
    magazines: r.magazines,
    hotspots: r.hotspots,
    first_click_at: r.first_click_at ? new Date(r.first_click_at).toISOString() : null,
    last_click_at: r.last_click_at ? new Date(r.last_click_at).toISOString() : null,
  }));

  return NextResponse.json({
    rows: out,
    total,
    page,
    pageSize,
    from: from.toISOString(),
    to: to.toISOString(),
  });
});
