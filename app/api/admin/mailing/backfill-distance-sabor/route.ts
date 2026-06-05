import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ANCHOR_SABOR, geocodeAddress } from '@/lib/geocode';
import { persistGeocode, type MailingContactRow } from '@/lib/mailing';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

function authorizedByBearer(req: Request): boolean {
  const secret = process.env.BACKFILL_TOKEN;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// ────────────────────────────────────────────────────────────────────
// One-shot backfill of distance_sabor_mi (and lat/lon when needed).
//
// Two modes:
//   1) action='count'    — diagnostic counts, no writes (default)
//   2) action='distance' — recompute distance_sabor_mi for rows that
//                          already have lat/lon (Postgres Haversine)
//   3) action='geocode'  — geocode rows missing lat/lon via Census,
//                          then persistGeocode (writes all 3 distances)
//
// POST /api/admin/mailing/backfill-distance-sabor
//   body: { action?: 'count'|'distance'|'geocode',
//           segment?: string,
//           limit?: number   // max rows per geocode call (default 200) }
// ────────────────────────────────────────────────────────────────────

const bodySchema = z
  .object({
    action:  z.enum(['count', 'distance', 'geocode']).default('count'),
    segment: z.string().optional(),
    limit:   z.coerce.number().int().min(1).max(1000).default(200),
  })
  .partial()
  .default({});

const EARTH_RADIUS_MI = 3958.7613;

interface CountRow {
  segment:        string;
  geocoded:       string;
  missing_sabor:  string;
  null_latlon:    string;
  total:          string;
}

async function getCounts(
  sql: ReturnType<typeof getSql>,
  segment: string | null,
): Promise<CountRow[]> {
  return (await sql`
    SELECT segment,
           COUNT(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::text                                       AS geocoded,
           COUNT(*) FILTER (WHERE distance_sabor_mi IS NULL AND lat IS NOT NULL AND lon IS NOT NULL)::text          AS missing_sabor,
           COUNT(*) FILTER (WHERE lat IS NULL OR lon IS NULL)::text                                                AS null_latlon,
           COUNT(*)::text                                                                                          AS total
      FROM mailing_contacts
     WHERE stage = 'mailing'
       AND (${segment}::text IS NULL OR segment = ${segment}::text)
     GROUP BY segment
     ORDER BY segment
  `) as unknown as CountRow[];
}

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await getCurrentAdmin();
  if (!admin && !authorizedByBearer(req)) {
    throw new ApiError(401, 'unauthorized');
  }
  await ensureSchema();
  const sql = getSql();

  const body    = await parseJson(req, bodySchema);
  const action  = body.action  ?? 'count';
  const segment = body.segment?.trim() || null;
  const limit   = body.limit   ?? 200;

  const before = await getCounts(sql, segment);

  // ───── action: count ─────
  if (action === 'count') {
    return NextResponse.json({
      action:  'count',
      anchor:  ANCHOR_SABOR,
      segment,
      before,
    });
  }

  // ───── action: distance ─────
  // Recompute distance_sabor_mi for rows with lat/lon but NULL distance.
  if (action === 'distance') {
    const updated = (await sql`
      UPDATE mailing_contacts
         SET distance_sabor_mi = ${EARTH_RADIUS_MI}::double precision * 2 * ASIN(LEAST(1, SQRT(
               POWER(SIN(RADIANS(lat - ${ANCHOR_SABOR.lat}::double precision) / 2), 2) +
               COS(RADIANS(${ANCHOR_SABOR.lat}::double precision)) * COS(RADIANS(lat)) *
               POWER(SIN(RADIANS(lon - (${ANCHOR_SABOR.lon}::double precision)) / 2), 2)
             )))
       WHERE stage = 'mailing'
         AND lat IS NOT NULL
         AND lon IS NOT NULL
         AND distance_sabor_mi IS NULL
         AND (${segment}::text IS NULL OR segment = ${segment}::text)
     RETURNING id
    `) as unknown as { id: string }[];

    const after = await getCounts(sql, segment);
    return NextResponse.json({
      action:        'distance',
      anchor:        ANCHOR_SABOR,
      segment,
      updated_count: updated.length,
      before,
      after,
    });
  }

  // ───── action: geocode ─────
  // Pull rows missing lat/lon with a non-empty address; geocode each via
  // Census; persistGeocode writes lat/lon + all three distances.
  const rows = (await sql`
    SELECT *
      FROM mailing_contacts
     WHERE stage = 'mailing'
       AND (lat IS NULL OR lon IS NULL)
       AND address IS NOT NULL
       AND address <> ''
       AND (${segment}::text IS NULL OR segment = ${segment}::text)
     ORDER BY updated_at DESC NULLS LAST
     LIMIT ${limit}
  `) as unknown as MailingContactRow[];

  interface Outcome {
    id:      string;
    name:    string;
    address: string;
    city:    string | null;
    state:   string | null;
    ok:      boolean;
    lat?:    number;
    lon?:    number;
    error?:  string;
  }
  const outcomes: Outcome[] = [];

  // Sequential to be polite to Census + stay under maxDuration.
  // Each Census call ~500ms; 200 rows ≈ 100s.
  for (const row of rows) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || (row.company ?? '(no name)');
    try {
      const geo = await geocodeAddress({
        address: row.address ?? '',
        city:    row.city,
        state:   row.state,
        zip:     row.zip,
      });
      if (geo.ok && geo.lat !== undefined && geo.lon !== undefined) {
        await persistGeocode(
          row.id,
          geo.lat,
          geo.lon,
          geo.distAbor ?? 0,
          geo.distFivePoints ?? 0,
          geo.distSabor ?? 0,
        );
        outcomes.push({
          id:      row.id,
          name,
          address: row.address ?? '',
          city:    row.city,
          state:   row.state,
          ok:      true,
          lat:     geo.lat,
          lon:     geo.lon,
        });
      } else {
        outcomes.push({
          id:      row.id,
          name,
          address: row.address ?? '',
          city:    row.city,
          state:   row.state,
          ok:      false,
          error:   geo.ok ? 'no coords' : geo.error,
        });
      }
    } catch (err) {
      outcomes.push({
        id:      row.id,
        name,
        address: row.address ?? '',
        city:    row.city,
        state:   row.state,
        ok:      false,
        error:   err instanceof Error ? err.message : String(err),
      });
    }
  }

  const ok_count   = outcomes.filter(o => o.ok).length;
  const fail_count = outcomes.length - ok_count;
  const after      = await getCounts(sql, segment);

  return NextResponse.json({
    action:        'geocode',
    anchor:        ANCHOR_SABOR,
    segment,
    scanned:       rows.length,
    ok_count,
    fail_count,
    before,
    after,
    outcomes,
  });
});
