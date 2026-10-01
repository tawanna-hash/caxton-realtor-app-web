// lib/server/mailing/queries.ts
//
// Read-side helpers for the mailing module: list/search/sort, count by segment,
// per-segment stats, holding counts, audience source counts.

import { getSql } from '@/lib/db';
import { isMailingSegment, type MailingSegment } from './segments';
import { isSortableColumn, type MailingColumnId } from './columns';
import type { MailingContactRow } from './types';
import { isFilterableField } from './extra-fields';

// ============================================================

/**
 * List mailing contacts for one segment, with optional search + sort +
 * per-column exact-match filters + pagination. Search hits across name,
 * email, company, city, state, phone, license, ZIP, notes and the
 * directory-detail columns.
 *
 * Column names in ORDER BY / filters only ever come from the allow-lists
 * in columns.ts / extra-fields.ts, so building the SQL text is safe;
 * every value is a bound parameter.
 */
const SEARCH_COLS = [
  'first_name', 'last_name', 'email', 'company', 'city', 'state', 'zip',
  'license_number', 'title', 'address', 'notes', 'nrds_id', 'office_nrds_id',
  'county', 'preferred_name', 'designated_realtor', 'mail_city',
];

export async function listMailingContacts(opts: {
  segment: MailingSegment;
  search?: string;
  filter?: 'all' | 'verified' | 'pending';
  tagFilter?: string | null;
  fieldFilters?: Record<string, string>;
  sort?: MailingColumnId;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<{ rows: MailingContactRow[]; total: number }> {
  const sql = getSql();
  const search  = (opts.search ?? '').trim();
  const filter  = opts.filter ?? 'all';
  const tagFilter = (opts.tagFilter ?? '').trim() || null;
  const sort    = opts.sort && isSortableColumn(opts.sort) ? opts.sort : 'created_at';
  const dir     = opts.dir === 'asc' ? 'ASC' : 'DESC';
  const limit   = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset  = Math.max(opts.offset ?? 0, 0);

  const params: unknown[] = [opts.segment];
  const where: string[] = [`segment = $1`, `stage = 'mailing'`];
  if (filter === 'verified') {
    where.push(`(addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid')`);
  } else if (filter === 'pending') {
    where.push(`(addr_status IS NULL OR addr_status <> 'Valid')
      AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid')`);
  }
  if (tagFilter) {
    params.push(tagFilter);
    where.push(`tags @> jsonb_build_array($${params.length}::text)`);
  }
  for (const [col, val] of Object.entries(opts.fieldFilters ?? {})) {
    if (!isFilterableField(col)) continue;
    if (val === '__blank__') {
      where.push(`NULLIF(TRIM(${col}), '') IS NULL`);
    } else {
      params.push(val);
      where.push(`${col} = $${params.length}`);
    }
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    const ors = SEARCH_COLS.map((c) => `LOWER(COALESCE(${c}, '')) LIKE ${p}`);
    const digits = search.replace(/[^0-9]/g, '');
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      ors.push(`REGEXP_REPLACE(COALESCE(phone, '') || ' ' || COALESCE(mobile_phone, '') || ' ' || COALESCE(office_phone, ''), '[^0-9]', '', 'g') LIKE $${params.length}`);
    }
    where.push(`(${ors.join(' OR ')})`);
  }
  const whereSql = where.join(' AND ');

  const orderExpr = sort === 'created_at' ? 'created_at' : `LOWER(COALESCE(${sort}::text, ''))`;
  // Empty values sort last in both directions; id is a stable tiebreaker
  // so pagination never repeats or skips rows.
  const orderSql = sort === 'created_at'
    ? `created_at ${dir}, id ${dir}`
    : `(NULLIF(TRIM(${sort}::text), '') IS NULL) ASC, ${orderExpr} ${dir}, id ASC`;

  const rows = (await sql.query(
    `SELECT * FROM mailing_contacts WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${limit} OFFSET ${offset}`,
    params,
  )) as unknown as MailingContactRow[];
  const totalRow = (await sql.query(
    `SELECT COUNT(*)::int AS c FROM mailing_contacts WHERE ${whereSql}`,
    params,
  )) as unknown as Array<{ c: number }>;

  return { rows, total: totalRow[0]?.c ?? 0 };
}

/**
 * Distinct values (with counts) for filterable columns within one segment.
 * Powers the filter dropdowns on the Mailing Hub list pages.
 */
export async function mailingFacets(
  segment: MailingSegment,
  fields: string[],
): Promise<Record<string, Array<{ value: string; count: number }>>> {
  const sql = getSql();
  const out: Record<string, Array<{ value: string; count: number }>> = {};
  for (const col of fields) {
    if (!isFilterableField(col)) continue;
    const rows = (await sql.query(
      `SELECT ${col} AS value, COUNT(*)::int AS count
         FROM mailing_contacts
        WHERE segment = $1 AND stage = 'mailing' AND NULLIF(TRIM(${col}), '') IS NOT NULL
        GROUP BY ${col}
        ORDER BY count DESC, ${col} ASC
        LIMIT 300`,
      [segment],
    )) as unknown as Array<{ value: string; count: number }>;
    out[col] = rows;
  }
  return out;
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
    'realtyline-atx-print':  0,
    'newsline-sa-print':     0,
    'active-advertiser-atx': 0,
    'active-advertiser-sa':  0,
    'non-advertiser-atx':    0,
    'non-advertiser-sa':     0,
    'email-only-atx':        0,
    'email-only-sa':         0,
    'dallas-trec':           0,
    'fortworth-trec':        0,
    'houston-mailing':       0,
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

  // Manual Newsline San Antonio Contacts and any San Antonio segment use SABOR
  // (9110 IH-10 W) as the proximity anchor. All other mailing-stage
  // segments keep the Austin/Five-Points dual anchor.
  const useSaborAnchor =
    segment === 'manual-newsline' ||
    segment === 'newsline-sa-print' ||
    segment === 'active-advertiser-sa' ||
    segment === 'non-advertiser-sa';
  const rows = useSaborAnchor
    ? ((await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid')
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
            WHERE addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid')
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
            WHERE addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid')
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
            WHERE addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'
          )::int AS verified,
          COUNT(*) FILTER (
            WHERE (addr_status IS NULL OR addr_status <> 'Valid')
              AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid')
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
