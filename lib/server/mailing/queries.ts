// lib/server/mailing/queries.ts
//
// Read-side helpers for the mailing module: list/search/sort, count by segment,
// per-segment stats, holding counts, audience source counts.

import { getSql } from '@/lib/db';
import { isMailingSegment, type MailingSegment } from './segments';
import { isSortableColumn, type MailingColumnId } from './columns';
import type { MailingContactRow } from './types';

// ============================================================

/**
 * List mailing contacts for one segment, with optional search + sort +
 * pagination. Search hits across name, email, company, city, state, phone.
 */
export async function listMailingContacts(opts: {
  segment: MailingSegment;
  search?: string;
  filter?: 'all' | 'verified' | 'pending';
  sort?: MailingColumnId;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<{ rows: MailingContactRow[]; total: number }> {
  const sql = getSql();
  const segment = opts.segment;
  const search  = (opts.search ?? '').trim();
  const filter  = opts.filter ?? 'all';
  const sort    = opts.sort && isSortableColumn(opts.sort) ? opts.sort : 'created_at';
  const dir     = opts.dir === 'asc' ? 'asc' : 'desc';
  const limit   = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset  = Math.max(opts.offset ?? 0, 0);

  // Neon driver doesn't allow dynamic ORDER BY column names, so we
  // expand the small allow-listed set into a switch.
  const search_like = search ? `%${search.toLowerCase()}%` : null;

  const rows = search_like
    ? (await sql`
        SELECT * FROM mailing_contacts
         WHERE segment = ${segment}
           AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )
           AND (
             LOWER(COALESCE(first_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(last_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(email, ''))     LIKE ${search_like}
             OR LOWER(COALESCE(company, ''))   LIKE ${search_like}
             OR LOWER(COALESCE(city, ''))      LIKE ${search_like}
             OR LOWER(COALESCE(state, ''))     LIKE ${search_like}
             OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
           )
         ORDER BY
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'asc'  THEN LOWER(COALESCE(first_name, ''))  END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'desc' THEN LOWER(COALESCE(first_name, ''))  END DESC NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'asc'  THEN LOWER(COALESCE(last_name, ''))   END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'desc' THEN LOWER(COALESCE(last_name, ''))   END DESC NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(email, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'desc' THEN LOWER(COALESCE(email, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'asc'  THEN LOWER(COALESCE(company, ''))     END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'desc' THEN LOWER(COALESCE(company, ''))     END DESC NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'asc'  THEN LOWER(COALESCE(city, ''))        END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'desc' THEN LOWER(COALESCE(city, ''))        END DESC NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(state, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'desc' THEN LOWER(COALESCE(state, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'asc'  THEN created_at                        END ASC,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'desc' THEN created_at                        END DESC,
           created_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `) as unknown as MailingContactRow[]
    : (await sql`
        SELECT * FROM mailing_contacts
         WHERE segment = ${segment}
           AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )
         ORDER BY
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'asc'  THEN LOWER(COALESCE(first_name, ''))  END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'first_name'  AND ${dir} = 'desc' THEN LOWER(COALESCE(first_name, ''))  END DESC NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'asc'  THEN LOWER(COALESCE(last_name, ''))   END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'last_name'   AND ${dir} = 'desc' THEN LOWER(COALESCE(last_name, ''))   END DESC NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(email, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'email'       AND ${dir} = 'desc' THEN LOWER(COALESCE(email, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'asc'  THEN LOWER(COALESCE(company, ''))     END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'company'     AND ${dir} = 'desc' THEN LOWER(COALESCE(company, ''))     END DESC NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'asc'  THEN LOWER(COALESCE(city, ''))        END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'city'        AND ${dir} = 'desc' THEN LOWER(COALESCE(city, ''))        END DESC NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'asc'  THEN LOWER(COALESCE(state, ''))       END ASC  NULLS LAST,
           CASE WHEN ${sort} = 'state'       AND ${dir} = 'desc' THEN LOWER(COALESCE(state, ''))       END DESC NULLS LAST,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'asc'  THEN created_at                        END ASC,
           CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'desc' THEN created_at                        END DESC,
           created_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `) as unknown as MailingContactRow[];

  const totalRow = search_like
    ? (await sql`
        SELECT COUNT(*)::int AS c FROM mailing_contacts
         WHERE segment = ${segment}
           AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )
           AND (
             LOWER(COALESCE(first_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(last_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(email, ''))     LIKE ${search_like}
             OR LOWER(COALESCE(company, ''))   LIKE ${search_like}
             OR LOWER(COALESCE(city, ''))      LIKE ${search_like}
             OR LOWER(COALESCE(state, ''))     LIKE ${search_like}
             OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
           )
      `) as unknown as Array<{ c: number }>
    : (await sql`
        SELECT COUNT(*)::int AS c FROM mailing_contacts
         WHERE segment = ${segment}
           AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )
      `) as unknown as Array<{ c: number }>;

  return { rows, total: totalRow[0]?.c ?? 0 };
}

export async function countBySegment(): Promise<Record<MailingSegment | 'total', number>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT segment, COUNT(*)::int AS c
      FROM mailing_contacts
     WHERE stage = 'mailing'
     GROUP BY segment
  `) as unknown as Array<{ segment: MailingSegment; c: number }>;
  const out: Record<MailingSegment | 'total', number> = {
    total: 0,
    'manual-newsline':       0,
    realtor:                 0,
    'active-advertiser-atx': 0,
    'active-advertiser-sa':  0,
    'non-advertiser-atx':    0,
    'non-advertiser-sa':     0,
  };
  for (const r of rows) {
    if (isMailingSegment(r.segment)) {
      out[r.segment] = r.c;
      out.total += r.c;
    }
  }
  return out;
}

/**
 * Per-segment KPI stats for the segment detail page (mailing stage only).
 * Mirrors the ABOR Members (countHolding) shape but scoped to a single
 * segment within stage='mailing'.
 */
export type SegmentStats = {
  total:    number;
  verified: number;
  pending:  number;
  near:     number;
  far:      number;
};

export async function segmentStats(segment: MailingSegment): Promise<SegmentStats> {
  const sql = getSql();
  // 60mi radius. Kept inline (not imported) so this file stays free of
  // the geocode module's runtime deps.
  const NEAR_MI = 60;

  // Manual Newsline Contacts and any San Antonio segment use SABOR
  // (9110 IH-10 W) as the proximity anchor. All other mailing-stage
  // segments keep the Austin/Five-Points dual anchor.
  const useSaborAnchor =
    segment === 'manual-newsline' ||
    segment === 'active-advertiser-sa' ||
    segment === 'non-advertiser-sa';
  const rows = useSaborAnchor
    ? ((await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE addr_status = 'Valid' OR email_status = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (email_status IS NULL OR email_status <> 'Valid')
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE distance_sabor_mi IS NOT NULL
              AND distance_sabor_mi <= ${NEAR_MI}
          )::int AS near,
          COUNT(*) FILTER (
            WHERE distance_sabor_mi IS NOT NULL
              AND distance_sabor_mi >  ${NEAR_MI}
          )::int AS far
        FROM mailing_contacts
        WHERE stage = 'mailing' AND segment = ${segment}
      `) as unknown as Array<{
        total: number; verified: number; pending: number; near: number; far: number;
      }>)
    : ((await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE addr_status = 'Valid' OR email_status = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (email_status IS NULL OR email_status <> 'Valid')
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE (distance_abor_mi       IS NOT NULL AND distance_abor_mi       <= ${NEAR_MI})
               OR (distance_fivepoints_mi IS NOT NULL AND distance_fivepoints_mi <= ${NEAR_MI})
          )::int AS near,
          COUNT(*) FILTER (
            WHERE distance_abor_mi       IS NOT NULL
              AND distance_fivepoints_mi IS NOT NULL
              AND distance_abor_mi       >  ${NEAR_MI}
              AND distance_fivepoints_mi >  ${NEAR_MI}
          )::int AS far
        FROM mailing_contacts
        WHERE stage = 'mailing' AND segment = ${segment}
      `) as unknown as Array<{
        total: number; verified: number; pending: number; near: number; far: number;
      }>);
  return {
    total:    rows[0]?.total    ?? 0,
    verified: rows[0]?.verified ?? 0,
    pending:  rows[0]?.pending  ?? 0,
    near:     rows[0]?.near     ?? 0,
    far:      rows[0]?.far      ?? 0,
  };
}

/**
 * Total count of contacts currently sitting in the holding stage,
 * across all segments. Powers the Holding Contacts KPI tile.
 */
export async function countHolding(source?: string): Promise<{
  total: number;
  verified: number;
  pending: number;
  near: number;
  far: number;
}> {
  const sql = getSql();
  // 60mi radius. Kept inline (not imported) so this file stays free of
  // the geocode module's runtime deps.
  const NEAR_MI = 60;
  // SABOR members get measured against the San Antonio Board of REALTORS
  // HQ anchor only (distance_sabor_mi). All other holding sources fall
  // back to the Austin-area ABoR / Five Points pair.
  const rows = source === 'ramco-sabor'
    ? ((await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE addr_status = 'Valid' OR email_status = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (email_status IS NULL OR email_status <> 'Valid')
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE distance_sabor_mi IS NOT NULL
              AND distance_sabor_mi <= ${NEAR_MI}
          )::int AS near,
          COUNT(*) FILTER (
            WHERE distance_sabor_mi IS NOT NULL
              AND distance_sabor_mi >  ${NEAR_MI}
          )::int AS far
        FROM mailing_contacts
        WHERE stage = 'holding'
          AND external_source = ${source}
      `) as unknown as Array<{
        total: number; verified: number; pending: number; near: number; far: number;
      }>)
    : ((await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE addr_status = 'Valid' OR email_status = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (email_status IS NULL OR email_status <> 'Valid')
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE (distance_abor_mi       IS NOT NULL AND distance_abor_mi       <= ${NEAR_MI})
               OR (distance_fivepoints_mi IS NOT NULL AND distance_fivepoints_mi <= ${NEAR_MI})
          )::int AS near,
          COUNT(*) FILTER (
            WHERE distance_abor_mi       IS NOT NULL
              AND distance_fivepoints_mi IS NOT NULL
              AND distance_abor_mi       >  ${NEAR_MI}
              AND distance_fivepoints_mi >  ${NEAR_MI}
          )::int AS far
        FROM mailing_contacts
        WHERE stage = 'holding'
          AND (${source}::text IS NULL OR external_source = ${source})
      `) as unknown as Array<{
        total: number; verified: number; pending: number; near: number; far: number;
      }>);
  return {
    total:    rows[0]?.total    ?? 0,
    verified: rows[0]?.verified ?? 0,
    pending:  rows[0]?.pending  ?? 0,
    near:     rows[0]?.near     ?? 0,
    far:      rows[0]?.far      ?? 0,
  };
}

/**
 * Headline KPI counts for the Mailing List HUB. Each value is scoped to
 * its own source so the tiles match what the dedicated page renders.
 *
 * - aborMembers: holding rows from ABoR (UnlockMLS) only.
 * - saborMembers: holding rows from SABOR (RAMCO) only.
 * - appSubscribers: rows in the `realtors` table (newsletter signups).
 */
export async function countAudienceSources(): Promise<{
  aborMembers:    number;
  saborMembers:   number;
  appSubscribers: number;
}> {
  const sql = getSql();
  const [aborRow] = (await sql`
    SELECT COUNT(*)::int AS c
      FROM mailing_contacts
     WHERE stage = 'holding' AND external_source = 'unlockmls'
  `) as unknown as Array<{ c: number }>;
  const [saborRow] = (await sql`
    SELECT COUNT(*)::int AS c
      FROM mailing_contacts
     WHERE stage = 'holding' AND external_source = 'ramco-sabor'
  `) as unknown as Array<{ c: number }>;
  // App subscribers live in the `realtors` table (newsletter signups
  // from realtynewsnow.app). Wrapped in a try/catch so a missing/empty
  // table doesn't blow up the whole HUB page.
  let appSubscribers = 0;
  try {
    const [subRow] = (await sql`
      SELECT COUNT(*)::int AS c FROM realtors
    `) as unknown as Array<{ c: number }>;
    appSubscribers = subRow?.c ?? 0;
  } catch {
    appSubscribers = 0;
  }
  return {
    aborMembers:    aborRow?.c  ?? 0,
    saborMembers:   saborRow?.c ?? 0,
    appSubscribers,
  };
}
