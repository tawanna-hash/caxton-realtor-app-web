// lib/server/mailing/holding.ts
//
// Holding-stage contacts: list/search, verify flags, promote to mailing,
// reject. Used by the "ABOR Members" admin UI + Vercel cron.

import { getSql } from '@/lib/db';
import { isSortableColumn, type MailingColumnId } from './columns';
import type { MailingContactRow, VerifyStatus } from './types';

// ============================================================

export interface HoldingListResult {
  rows: MailingContactRow[];
  total: number;
}

/**
 * List holding contacts with optional filter:
 *   filter='all'       → everyone in holding
 *   filter='verified'  → at least one of addr/email verified
 *   filter='pending'   → neither addr nor email verified yet
 */
export async function listHoldingContacts(opts: {
  search?: string;
  filter?: 'all' | 'verified' | 'pending';
  source?: string;
  sort?: MailingColumnId;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<HoldingListResult> {
  const sql = getSql();
  const search = (opts.search ?? '').trim();
  const search_like = search ? `%${search.toLowerCase()}%` : null;
  const filter = opts.filter ?? 'all';
  const source = (opts.source ?? '').trim() || null;
  const sort = opts.sort && isSortableColumn(opts.sort) ? opts.sort : 'created_at';
  const dir = opts.dir === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  // Filter predicate baked into the WHERE clause as a portable bool.
  // We pass `filter` as a parameter and let Postgres branch.
  const rows = (await sql`
    SELECT * FROM mailing_contacts
     WHERE stage = 'holding'
       AND (
         ${filter} = 'all'
         OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
         OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                    AND (email_status IS NULL OR email_status <> 'Valid'))
       )
       AND (
         ${source}::text IS NULL
         OR external_source = ${source}
       )
       AND (
         ${search_like}::text IS NULL
         OR LOWER(COALESCE(first_name, '')) LIKE ${search_like}
         OR LOWER(COALESCE(last_name, ''))  LIKE ${search_like}
         OR LOWER(COALESCE(email, ''))      LIKE ${search_like}
         OR LOWER(COALESCE(company, ''))    LIKE ${search_like}
         OR LOWER(COALESCE(city, ''))       LIKE ${search_like}
         OR LOWER(COALESCE(license_number, '')) LIKE ${search_like}
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
       CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'asc'  THEN created_at                        END ASC,
       CASE WHEN ${sort} = 'created_at'  AND ${dir} = 'desc' THEN created_at                        END DESC,
       created_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `) as unknown as MailingContactRow[];

  const totalRow = (await sql`
    SELECT COUNT(*)::int AS c FROM mailing_contacts
     WHERE stage = 'holding'
       AND (
         ${filter} = 'all'
         OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
         OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                    AND (email_status IS NULL OR email_status <> 'Valid'))
       )
       AND (
         ${source}::text IS NULL
         OR external_source = ${source}
       )
       AND (
         ${search_like}::text IS NULL
         OR LOWER(COALESCE(first_name, '')) LIKE ${search_like}
         OR LOWER(COALESCE(last_name, ''))  LIKE ${search_like}
         OR LOWER(COALESCE(email, ''))      LIKE ${search_like}
         OR LOWER(COALESCE(company, ''))    LIKE ${search_like}
         OR LOWER(COALESCE(city, ''))       LIKE ${search_like}
         OR LOWER(COALESCE(license_number, '')) LIKE ${search_like}
         OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
       )
  `) as unknown as Array<{ c: number }>;
  return { rows, total: totalRow[0]?.c ?? 0 };
}

/**
 * Mark a holding row as having its address verified. Used by the
 * "Mark Verified" button and bulk-verify flow.
 */
export async function markAddrVerified(id: string, status: VerifyStatus = 'Valid'): Promise<boolean> {
  const sql = getSql();
  const ts = status === 'Valid' ? new Date().toISOString() : null;
  const rows = (await sql`
    UPDATE mailing_contacts
       SET addr_status = ${status},
           addr_verified_at = ${ts}
     WHERE id = ${id}
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

export async function markEmailVerified(id: string, status: VerifyStatus = 'Valid'): Promise<boolean> {
  const sql = getSql();
  const ts = status === 'Valid' ? new Date().toISOString() : null;
  const rows = (await sql`
    UPDATE mailing_contacts
       SET email_status = ${status},
           email_verified_at = ${ts}
     WHERE id = ${id}
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

export interface PromoteResult {
  promoted: number;
  rejected_unverified: number;
  rejected_duplicate: number;
}

/**
 * Promote one or more holding rows to stage='mailing'. Rows are only
 * promoted if at least one of (addr_status, email_status) is 'Valid'
 * AND the email (when present) doesn't already exist in the active
 * mailing list. Returns counts so the caller can report results.
 */
export async function promoteHoldingContacts(ids: string[]): Promise<PromoteResult> {
  if (ids.length === 0) return { promoted: 0, rejected_unverified: 0, rejected_duplicate: 0 };
  const sql = getSql();
  // Fetch the candidate rows.
  const candidates = (await sql`
    SELECT id, email, addr_status, email_status
      FROM mailing_contacts
     WHERE id = ANY(${ids}::uuid[])
       AND stage = 'holding'
  `) as unknown as Array<{
    id: string;
    email: string | null;
    addr_status: VerifyStatus | null;
    email_status: VerifyStatus | null;
  }>;

  let unverified = 0;
  let duplicate = 0;
  const eligible: string[] = [];

  for (const row of candidates) {
    if (row.addr_status !== 'Valid' && row.email_status !== 'Valid') {
      unverified += 1;
      continue;
    }
    if (row.email) {
      const dup = (await sql`
        SELECT id FROM mailing_contacts
         WHERE stage = 'mailing'
           AND LOWER(email) = LOWER(${row.email})
         LIMIT 1
      `) as unknown as Array<{ id: string }>;
      if (dup.length > 0) {
        duplicate += 1;
        continue;
      }
    }
    eligible.push(row.id);
  }

  if (eligible.length > 0) {
    await sql`
      UPDATE mailing_contacts
         SET stage = 'mailing',
             promoted_at = NOW()
       WHERE id = ANY(${eligible}::uuid[])
    `;
    // ABoR / Austin holding rows historically came in with segment='realtor'.
    // Now that the three Austin print lists are merged into a single
    // 'realtyline-atx-print' segment, promote those rows into the merged
    // segment and tag them as 'non-advertiser' so the combined list keeps
    // them distinguishable from active advertisers.
    await sql`
      UPDATE mailing_contacts
         SET segment = 'realtyline-atx-print',
             tags = COALESCE((
               SELECT jsonb_agg(DISTINCT t)
                 FROM jsonb_array_elements_text(
                   COALESCE(tags, '[]'::jsonb) || '["non-advertiser"]'::jsonb
                 ) AS t
             ), '[]'::jsonb)
       WHERE id = ANY(${eligible}::uuid[])
         AND stage = 'mailing'
         AND segment = 'realtor'
    `;
    // After promotion, auto-route any rows that landed without a
    // mailing address into the email-only segment for their market.
    // realtyline-atx-print is Austin-anchored, anything ABOR-derived
    // → email-only-atx; SABOR-derived rows already carry a SA segment
    // so they route to email-only-sa.
    await sql`
      UPDATE mailing_contacts
         SET segment = CASE
           WHEN segment IN ('active-advertiser-sa','non-advertiser-sa','manual-newsline','newsline-sa-print')
             THEN 'email-only-sa'
           ELSE 'email-only-atx'
         END
       WHERE id = ANY(${eligible}::uuid[])
         AND stage = 'mailing'
         AND email IS NOT NULL
         AND length(trim(email)) > 0
         AND lower(trim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         AND (address IS NULL OR length(trim(address)) = 0)
         AND (city    IS NULL OR length(trim(city))    = 0)
         AND (state   IS NULL OR length(trim(state))   = 0)
         AND (zip     IS NULL OR length(trim(zip))     = 0)
    `;
  }

  return {
    promoted: eligible.length,
    rejected_unverified: unverified,
    rejected_duplicate: duplicate,
  };
}

/**
 * Same as rejectHoldingContacts but also returns the email + source
 * metadata of every deleted row so the caller can write a permanent
 * suppression entry. We RETURNING the columns we need so the snapshot
 * and the delete are atomic — no risk of the row being modified between
 * the SELECT and the DELETE.
 */
export async function rejectHoldingContactsWithSnapshot(ids: string[]): Promise<{
  removed: number;
  rows: Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    segment: string | null;
    external_id: string | null;
    external_source: string | null;
  }>;
}> {
  if (ids.length === 0) return { removed: 0, rows: [] };
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE id = ANY(${ids}::uuid[])
       AND stage = 'holding'
     RETURNING id, email, first_name, last_name, segment, external_id, external_source
  `) as unknown as Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    segment: string | null;
    external_id: string | null;
    external_source: string | null;
  }>;
  return { removed: rows.length, rows };
}
