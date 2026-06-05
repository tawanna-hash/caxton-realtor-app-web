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
    action:  z.enum(['count', 'distance', 'geocode', 'fb-status', 'geocode-events']).default('count'),
    segment: z.string().optional(),
    limit:   z.coerce.number().int().min(1).max(1000).default(100),
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

  // ───── action: geocode-events ─────
  // Geocode events that have a non-empty `location` but NULL lat/lng.
  if (action === 'geocode-events') {
    interface EventRow {
      id:       number;
      title:    string | null;
      location: string | null;
    }
    const rows = (await sql`
      SELECT id, title, location
        FROM events
       WHERE location IS NOT NULL
         AND location <> ''
         AND (lat IS NULL OR lng IS NULL)
       ORDER BY id DESC
       LIMIT ${limit}
    `) as unknown as EventRow[];

    interface EventOutcome {
      id:       number;
      title:    string | null;
      location: string | null;
      ok:       boolean;
      lat?:     number;
      lng?:     number;
      error?:   string;
    }
    const outcomes: EventOutcome[] = [];
    const sleep    = (ms: number) => new Promise(r => setTimeout(r, ms));
    const deadline = Date.now() + 270_000;
    let firstEvt   = true;
    let aborted: number | null = null;

    for (const [idx, ev] of rows.entries()) {
      if (Date.now() > deadline) { aborted = idx; break; }
      if (!firstEvt) await sleep(1100); // Nominatim throttle
      firstEvt = false;
      try {
        const geo = await geocodeAddress({ address: ev.location ?? '' });
        if (geo.ok && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
          await sql`
            UPDATE events
               SET lat = ${geo.lat}::double precision,
                   lng = ${geo.lon}::double precision,
                   updated_at = NOW()
             WHERE id = ${ev.id}
          `;
          outcomes.push({
            id:       ev.id,
            title:    ev.title,
            location: ev.location,
            ok:       true,
            lat:      geo.lat,
            lng:      geo.lon,
          });
        } else {
          outcomes.push({
            id:       ev.id,
            title:    ev.title,
            location: ev.location,
            ok:       false,
            error:    geo.ok ? 'no coords' : geo.error,
          });
        }
      } catch (err) {
        outcomes.push({
          id:       ev.id,
          title:    ev.title,
          location: ev.location,
          ok:       false,
          error:    err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok_count   = outcomes.filter(o => o.ok).length;
    const fail_count = outcomes.length - ok_count;
    const remaining  = (await sql`
      SELECT COUNT(*)::text AS pending
        FROM events
       WHERE location IS NOT NULL
         AND location <> ''
         AND (lat IS NULL OR lng IS NULL)
    `) as unknown as Array<{ pending: string }>;

    return NextResponse.json({
      action:        'geocode-events',
      scanned:       outcomes.length,
      fetched:       rows.length,
      aborted_at:    aborted,
      ok_count,
      fail_count,
      still_pending: remaining[0]?.pending ?? '0',
      outcomes,
    });
  }

  // ───── action: fb-status ─────
  if (action === 'fb-status') {
    const social = (await sql`
      SELECT COUNT(*)::text                                       AS total,
             COUNT(*) FILTER (WHERE is_active = TRUE)::text       AS active,
             COUNT(*) FILTER (WHERE refreshed_at IS NULL)::text   AS never_refreshed,
             MIN(refreshed_at)::text                              AS oldest_refresh,
             MAX(refreshed_at)::text                              AS newest_refresh,
             MIN(posted_at)::text                                 AS oldest_post,
             MAX(posted_at)::text                                 AS newest_post
        FROM featured_social_posts
    `) as unknown as Array<Record<string, string>>;

    const eventsCounts = (await sql`
      SELECT COUNT(*)::text                                                AS total,
             COUNT(*) FILTER (WHERE hidden = TRUE)::text                   AS hidden,
             COUNT(*) FILTER (WHERE hidden = TRUE AND external_source = 'facebook-llm')::text  AS pending_fb,
             COUNT(*) FILTER (WHERE external_source = 'facebook-llm')::text                   AS fb_total
        FROM events
    `) as unknown as Array<Record<string, string>>;

    const unscanned = (await sql`
      SELECT COUNT(*)::text AS unscanned
        FROM featured_social_posts p
       WHERE p.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM events e WHERE e.source_post_id = p.id
         )
    `) as unknown as Array<Record<string, string>>;

    const recentPosts = (await sql`
      SELECT id, pub, posted_at, refreshed_at,
             LEFT(COALESCE(message, ''), 80) AS message_preview,
             permalink_url
        FROM featured_social_posts
       WHERE is_active = TRUE
       ORDER BY posted_at DESC NULLS LAST
       LIMIT 5
    `) as unknown as Array<Record<string, unknown>>;

    return NextResponse.json({
      action:        'fb-status',
      featured_social_posts: social[0] ?? null,
      events:        eventsCounts[0] ?? null,
      unscanned_active_posts: unscanned[0] ?? null,
      gemini_key_set: !!process.env.GEMINI_API_KEY,
      facebook_token_set: !!process.env.FACEBOOK_PAGE_TOKEN || !!process.env.FACEBOOK_ACCESS_TOKEN || !!process.env.FB_ACCESS_TOKEN,
      recent_active_posts: recentPosts,
    });
  }

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

  // Sequential to respect Nominatim's 1 req/sec usage policy. A failing
  // row may trigger up to 3 Nominatim calls (full → city → zip), so we
  // throttle between rows AND keep batches small.
  // ~100 rows worst-case = ~300s; we abort early at 270s to be safe.
  const sleep    = (ms: number) => new Promise(r => setTimeout(r, ms));
  const deadline = Date.now() + 270_000;
  let firstRow   = true;
  let abortedAt: number | null = null;
  for (const [idx, row] of rows.entries()) {
    if (Date.now() > deadline) { abortedAt = idx; break; }
    if (!firstRow) {
      // Conservative throttle for the Nominatim fallback path.
      await sleep(1100);
    }
    firstRow = false;
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
    scanned:       outcomes.length,
    fetched:       rows.length,
    aborted_at:    abortedAt,
    ok_count,
    fail_count,
    before,
    after,
    outcomes,
  });
});
