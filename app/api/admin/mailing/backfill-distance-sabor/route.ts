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
// One-shot backfill of distance_sabor_mi.
//
// The `distance_sabor_mi` column was added in commit d1c3ea6 along
// with new geocoding behavior, but existing rows that were geocoded
// before that commit have NULL distance_sabor_mi even though their
// lat/lon are populated. As a result, the Manual Newsline page shows
// "—" in the Proximity column for every San Antonio row instead of
// the expected "Near SABOR" / "Outside 60 mi · SABOR" badge.
//
// This endpoint recomputes the great-circle distance from each
// already-geocoded row to SABOR HQ using Postgres-native Haversine,
// matching the formula in lib/geocode.ts (Earth radius 3958.7613 mi).
//
// POST  /api/admin/mailing/backfill-distance-sabor
//   body:  { "dryRun": true|false, "segment"?: string }   (default dryRun=true)
//
// Dry-run is the default — returns row counts without writing.
// Pass {"dryRun": false} to actually persist the backfill.
// ────────────────────────────────────────────────────────────────────

const bodySchema = z
  .object({
    dryRun:  z.boolean().default(true),
    segment: z.string().optional(),
  })
  .partial()
  .default({});

const EARTH_RADIUS_MI = 3958.7613;

interface CountRow {
  segment:        string;
  geocoded:       string;
  missing_sabor:  string;
}

export const POST = withErrorHandling(async (req: Request) => {
  // Accept either an admin session cookie OR a one-shot bearer token
  // (BACKFILL_TOKEN env var) so this can run from a non-browser context.
  const admin = await getCurrentAdmin();
  if (!admin && !authorizedByBearer(req)) {
    throw new ApiError(401, 'unauthorized');
  }
  await ensureSchema();
  const sql = getSql();

  const body = await parseJson(req, bodySchema);
  const dryRun  = body.dryRun !== false; // default true
  const segment = body.segment?.trim() || null;

  // Diagnostic counts BEFORE any write.
  const before = (await sql`
    SELECT segment,
           COUNT(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::text                                       AS geocoded,
           COUNT(*) FILTER (WHERE distance_sabor_mi IS NULL AND lat IS NOT NULL AND lon IS NOT NULL)::text          AS missing_sabor
      FROM mailing_contacts
     WHERE stage = 'mailing'
       AND (${segment}::text IS NULL OR segment = ${segment}::text)
     GROUP BY segment
     ORDER BY segment
  `) as unknown as CountRow[];

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
             POWER(SIN(RADIANS(lon - ${ANCHOR_SABOR.lon}::double precision) / 2), 2)
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
           COUNT(*) FILTER (WHERE distance_sabor_mi IS NULL AND lat IS NOT NULL AND lon IS NOT NULL)::text          AS missing_sabor
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
