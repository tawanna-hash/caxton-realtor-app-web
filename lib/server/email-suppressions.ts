// lib/server/email-suppressions.ts
//
// Permanent-delete tombstone for emails. When an admin deletes a contact
// from the Mailing Hub we insert a row here keyed by lower(email) so:
//
//   1. publication-list + count queries exclude the email forever
//   2. the holding-stage upsert (ABOR / SABOR scraper) skips it on every
//      future sync — no more "I deleted them and they came back"
//   3. public subscribe forms can refuse to re-add it
//
// Suppressions are recoverable: the admin can lift one via
//   removeSuppression(email).

import { getSql } from '@/lib/db';

export type SuppressionReason =
  | 'admin_delete'      // explicit single-row delete in /admin/mailing
  | 'admin_bulk_delete' // bulk delete in /admin/mailing
  | 'holding_reject'    // rejected from the holding queue
  | 'manual';           // catch-all (admin added to suppressions directly)

export interface SuppressionRow {
  email: string;
  reason: string;
  source_table: string | null;
  source_id: string | null;
  source_snapshot: Record<string, unknown> | null;
  suppressed_by: string | null;
  suppressed_at: string; // ISO
}

function normEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!e) return null;
  // mirror the regex used in publication-list / counts
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/**
 * Add an email to the suppression list. Idempotent — if the email is
 * already suppressed, the row is left in place and the call is a no-op.
 * Returns true if a NEW row was created, false if it already existed
 * (or if the email was null / unparseable).
 */
export async function suppressEmail(args: {
  email: string | null | undefined;
  reason?: SuppressionReason;
  source_table?: string;
  source_id?: string;
  source_snapshot?: Record<string, unknown>;
  suppressed_by?: string;
}): Promise<boolean> {
  const email = normEmail(args.email);
  if (!email) return false;
  const sql = getSql();
  const rows = (await sql.query(
    `INSERT INTO email_suppressions
       (email, reason, source_table, source_id, source_snapshot, suppressed_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (email) DO NOTHING
     RETURNING email`,
    [
      email,
      args.reason ?? 'admin_delete',
      args.source_table ?? null,
      args.source_id ?? null,
      args.source_snapshot ? JSON.stringify(args.source_snapshot) : null,
      args.suppressed_by ?? null,
    ],
  )) as Array<{ email: string }>;
  return rows.length > 0;
}

/**
 * Suppress many emails in one query. The `rows` array is filtered to
 * keep only entries with a parseable email; empty/invalid entries are
 * silently dropped. Returns the number of NEW suppression rows created
 * (existing rows are left untouched).
 */
export async function suppressEmailsBatch(
  rows: Array<{
    email: string | null | undefined;
    source_id?: string;
    snapshot?: Record<string, unknown>;
  }>,
  opts: {
    reason?: SuppressionReason;
    source_table?: string;
    suppressed_by?: string;
  } = {},
): Promise<number> {
  const clean = rows
    .map((r) => ({
      email: normEmail(r.email),
      source_id: r.source_id ?? null,
      snapshot: r.snapshot ?? null,
    }))
    .filter((r): r is { email: string; source_id: string | null; snapshot: Record<string, unknown> | null } => r.email !== null);

  if (clean.length === 0) return 0;

  const sql = getSql();
  // Build parallel arrays for the unnest() insert.
  const emails = clean.map((r) => r.email);
  const sourceIds = clean.map((r) => r.source_id);
  const snapshots = clean.map((r) => (r.snapshot ? JSON.stringify(r.snapshot) : null));

  const inserted = (await sql.query(
    `
    INSERT INTO email_suppressions
      (email, reason, source_table, source_id, source_snapshot, suppressed_by)
    SELECT
      e.email,
      $2::text                                                   AS reason,
      $3::text                                                   AS source_table,
      e.source_id,
      CASE WHEN e.snapshot IS NULL THEN NULL ELSE e.snapshot::jsonb END AS source_snapshot,
      $4::text                                                   AS suppressed_by
    FROM unnest($1::text[], $5::text[], $6::text[])
      AS e(email, source_id, snapshot)
    ON CONFLICT (email) DO NOTHING
    RETURNING email
    `,
    [
      emails,
      opts.reason ?? 'admin_bulk_delete',
      opts.source_table ?? null,
      opts.suppressed_by ?? null,
      sourceIds,
      snapshots,
    ],
  )) as Array<{ email: string }>;
  return inserted.length;
}

/** Lift a suppression. Returns true if a row was removed. */
export async function removeSuppression(email: string | null | undefined): Promise<boolean> {
  const e = normEmail(email);
  if (!e) return false;
  const sql = getSql();
  const rows = (await sql.query(
    `DELETE FROM email_suppressions WHERE email = $1 RETURNING email`,
    [e],
  )) as Array<{ email: string }>;
  return rows.length > 0;
}

/** Cheap existence check for a single email. */
export async function isSuppressed(email: string | null | undefined): Promise<boolean> {
  const e = normEmail(email);
  if (!e) return false;
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT 1 FROM email_suppressions WHERE email = $1 LIMIT 1`,
    [e],
  )) as Array<unknown>;
  return rows.length > 0;
}

/**
 * Batch existence check. Returns the SET of emails (lower-cased) that
 * are currently suppressed. Callers should lower-case the inputs.
 */
export async function suppressedSubset(emails: string[]): Promise<Set<string>> {
  const clean = Array.from(
    new Set(emails.map((e) => normEmail(e)).filter((e): e is string => e !== null)),
  );
  if (clean.length === 0) return new Set();
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT email FROM email_suppressions WHERE email = ANY($1::text[])`,
    [clean],
  )) as Array<{ email: string }>;
  return new Set(rows.map((r) => r.email));
}

/** Admin-facing list. Paged, newest-first. */
export async function listSuppressions(opts: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<{ rows: SuppressionRow[]; total: number }> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = (opts.search ?? '').trim().toLowerCase();
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT email, reason, source_table, source_id, source_snapshot,
            suppressed_by, suppressed_at
       FROM email_suppressions
      WHERE ($1 = '' OR email LIKE '%' || $1 || '%')
      ORDER BY suppressed_at DESC
      LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  )) as SuppressionRow[];

  const totalRows = (await sql.query(
    `SELECT COUNT(*)::int AS n FROM email_suppressions
      WHERE ($1 = '' OR email LIKE '%' || $1 || '%')`,
    [q],
  )) as Array<{ n: number }>;

  return { rows, total: totalRows[0]?.n ?? 0 };
}
