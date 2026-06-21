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
         OR (${filter} = 'verified' AND (addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'))
         OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                    AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid'))
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
         OR (${filter} = 'verified' AND (addr_status = 'Valid' OR COALESCE(email_override_status, email_status) = 'Valid'))
         OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                    AND (COALESCE(email_override_status, email_status) IS NULL OR COALESCE(email_override_status, email_status) <> 'Valid'))
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
  }

  return {
    promoted: eligible.length,
    rejected_unverified: unverified,
    rejected_duplicate: duplicate,
  };
}

/**
 * Reject (delete) holding contacts. Different code path from
 * deleteMailingContacts so callers can confirm the rejected rows were
 * actually in holding (mistakes shouldn't blow away active mailing
 * list rows).
 */
export async function rejectHoldingContacts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM mailing_contacts
     WHERE id = ANY(${ids}::uuid[])
       AND stage = 'holding'
     RETURNING id
  `) as unknown as Array<{ id: string }>;
  return rows.length;
}
