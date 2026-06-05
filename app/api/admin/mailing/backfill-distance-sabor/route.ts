import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ANCHOR_SABOR } from '@/lib/geocode';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorizedByBearer(req: Request): boolean {
  const secret = process.env.BACKFILL_TOKEN;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// ────────────────────────────────────────────────────────────────────
// One-shot backfill of distance_sabor_mi (with diagnostic mode).
//
// POST  /api/admin/mailing/backfill-distance-sabor
//   body:  { "dryRun": true|false,
//            "segment"?: string,
//            "diagnose"?: boolean   // returns city-level + null-lat counts
//          }
// ────────────────────────────────────────────────────────────────────

const bodySchema = z
  .object({
    dryRun:   z.boolean().default(true),
    segment:  z.string().optional(),
    diagnose: z.boolean().default(false),
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

interface SaCityRow {
  city:                  string | null;
  state:                 string | null;
  count:                 string;
  has_lat:               string;
  has_distance_sabor:    string;
  min_distance:          string | null;
  max_distance:          string | null;
}

interface SaSampleRow {
  id:                  string;
  first_name:          string | null;
  last_name:           string | null;
  company:             string | null;
  city:                string | null;
  state:               string | null;
  zip:                 string | null;
  lat:                 number | null;
  lon:                 number | null;
  distance_sabor_mi:   number | null;
  distance_abor_mi:    number | null;
}

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await getCurrentAdmin();
  if (!admin && !authorizedByBearer(req)) {
    throw new ApiError(401, 'unauthorized');
  }
  await ensureSchema();
  const sql = getSql();

  const body = await parseJson(req, bodySchema);
  const dryRun   = body.dryRun !== false; // default true
  const segment  = body.segment?.trim() || null;
  const diagnose = body.diagnose === true;

  // Diagnostic counts BEFORE any write — now includes NULL lat/lon
  // and total to help us see if rows simply weren't geocoded.
  const before = (await sql`
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

  if (diagnose) {
    // City-level breakdown for San Antonio / Bexar area rows.
    const sa_cities = (await sql`
      SELECT city,
             state,
             COUNT(*)::text                                                AS count,
             COUNT(*) FILTER (WHERE lat IS NOT NULL)::text                 AS has_lat,
             COUNT(*) FILTER (WHERE distance_sabor_mi IS NOT NULL)::text   AS has_distance_sabor,
             MIN(distance_sabor_mi)::text                                  AS min_distance,
             MAX(distance_sabor_mi)::text                                  AS max_distance
        FROM mailing_contacts
       WHERE stage = 'mailing'
         AND segment = 'manual-newsline'
         AND (LOWER(city) LIKE '%san antonio%' OR LOWER(state) = 'tx')
       GROUP BY city, state
       ORDER BY count::int DESC
       LIMIT 20
    `) as unknown as SaCityRow[];

    // Sample rows that look like Chicago Title / NRP from the screenshot.
    const sa_sample = (await sql`
      SELECT id, first_name, last_name, company, city, state, zip,
             lat, lon, distance_sabor_mi, distance_abor_mi
        FROM mailing_contacts
       WHERE stage = 'mailing'
         AND segment = 'manual-newsline'
         AND (
           LOWER(company) LIKE '%chicago title%'
           OR LOWER(company) LIKE '%nrp group%'
           OR last_name IN ('Bratton','Nisbet','Markwardt','Crane','Tomblin','Becker','Guerrero','Ramirez','Baize','Castillo','Hicks','Klesel')
         )
       ORDER BY company NULLS LAST, last_name NULLS LAST
       LIMIT 30
    `) as unknown as SaSampleRow[];

    return NextResponse.json({
      dryRun:        true,
      diagnose:      true,
      anchor:        ANCHOR_SABOR,
      segmentFilter: segment,
      before,
      sa_cities,
      sa_sample,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun:        true,
      anchor:        ANCHOR_SABOR,
      segmentFilter: segment,
      before,
    });
  }

  // ───── Apply backfill ─────
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

  const after = (await sql`
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

  return NextResponse.json({
    dryRun:        false,
    anchor:        ANCHOR_SABOR,
    segmentFilter: segment,
    updated_count: updated.length,
    before,
    after,
  });
});
