/**
 * Subscribers (realtors) store — DO Postgres (transient).
 * Migrate to Neon by swapping query / exec / withNeonTransaction.
 */

import { query, withNeonTransaction } from './db/neon';
import { EDITABLE_FIELDS } from './schemas/subscribers';
import { logger } from './logger';

// Postgres error codes for schema drift that should be tolerated
// when cascade-deleting subscribers in environments where optional
// satellite tables/columns may not exist yet.
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isMissingSchemaError(err: unknown): err is { code: string } {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

// -----------------------------------------------------------------------------
// List + detail
// -----------------------------------------------------------------------------

export interface ListSubscribersOptions {
  page: number;
  pageSize: number;
  market?: 'austin' | 'san_antonio';
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  /** Filter by unified verification status. 'unverified' = no row exists. */
  verified?: string;
}

// Allowlist guards the dynamic ORDER BY against injection. Anything not in
// this set silently falls back to created_at DESC.
const SUBSCRIBER_SORT_ALLOWLIST = new Set([
  'created_at', 'last_app_open_at', 'last_login_at',
  'email', 'first_name', 'last_name', 'market', 'city',
]);

export interface ListSubscribersResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  subscribers: Record<string, unknown>[];
}

const VERIFIED_FILTER_VALUES = new Set(['valid','invalid','risky','unknown','pending','unverified']);

export async function listSubscribers(
  opts: ListSubscribersOptions,
): Promise<ListSubscribersResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.market) {
    params.push(opts.market);
    where.push(`r.market = $${params.length}`);
  }
  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const i = params.length;
    where.push(`(r.email ILIKE $${i} OR r.first_name ILIKE $${i} OR r.last_name ILIKE $${i})`);
  }
  // Verified-status filter. 'unverified' selects rows with NO entry in
  // email_verifications; any other status filters on that column.
  if (opts.verified && VERIFIED_FILTER_VALUES.has(opts.verified)) {
    if (opts.verified === 'unverified') {
      where.push(`ev.status IS NULL`);
    } else {
      params.push(opts.verified);
      where.push(`ev.status = $${params.length}`);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (opts.page - 1) * opts.pageSize;

  const countRows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
       FROM realtors r
       LEFT JOIN email_verifications ev ON ev.email = lower(r.email)
       ${whereSql}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  const sortCol = (opts.sort && SUBSCRIBER_SORT_ALLOWLIST.has(opts.sort)) ? opts.sort : 'created_at';
  const sortDir = opts.dir === 'asc' ? 'ASC' : 'DESC';
  params.push(opts.pageSize, offset);
  // LEFT JOIN the unified email_verifications lookup so the UI can render
  // a status badge next to each row's email column. `r.*` is aliased so
  // the table prefix doesn't break existing field consumers downstream.
  const listSql = `
    SELECT
      r.id, r.email, r.first_name, r.last_name, r.market,
      r.license_type, r.trec_license_number, r.nmls_license_number, r.title,
      r.mobile, r.city, r.state, r.zip,
      r.birthday_month, r.birthday_day,
      r.fb_handle, r.ig_handle, r.li_handle,
      r.subscriptions, r.status,
      r.created_at, r.last_login_at, r.last_app_open_at,
      ev.status      AS email_verification_status,
      ev.sub_status  AS email_verification_reason,
      ev.verified_at AS email_verified_at
    FROM realtors r
    LEFT JOIN email_verifications ev ON ev.email = lower(r.email)
    ${whereSql}
    ORDER BY r.${sortCol} ${sortDir} NULLS LAST, r.id ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const rows = await query(listSql, params);

  return {
    page: opts.page,
    pageSize: opts.pageSize,
    total,
    totalPages: Math.ceil(total / opts.pageSize),
    subscribers: rows,
  };
}

export const EXPORT_COLUMNS = [
  'id',
  'email',
  'first_name',
  'last_name',
  'market',
  'license_type',
  'trec_license_number',
  'nmls_license_number',
  'title',
  'mobile',
  'mailing_address',
  'mailing_address_2',
  'city',
  'state',
  'zip',
  'birthday_month',
  'birthday_day',
  'fb_handle',
  'ig_handle',
  'li_handle',
  'subscriptions',
  'status',
  'master_list_consent_at',
  'master_list_consent_text',
  'master_list_consent_ip',
  'mobile_sms_consent_at',
  'mobile_sms_consent_text',
  'birthday_consent_at',
  'created_at',
  'updated_at',
  'last_login_at',
  'last_app_open_at',
  'email_verified_at',
] as const;

export async function listAllSubscribersForExport(): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT ${EXPORT_COLUMNS.join(', ')} FROM realtors ORDER BY created_at DESC`,
  );
}

export async function getSubscriberById(
  id: string,
): Promise<Record<string, unknown> | null> {
  const rows = await query('SELECT * FROM realtors WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getSubscriberLoginInfo(
  id: string,
): Promise<{ id: string; email: string; first_name: string | null } | null> {
  const rows = await query<{ id: string; email: string; first_name: string | null }>(
    'SELECT id, email, first_name FROM realtors WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// Patch
// -----------------------------------------------------------------------------

export interface PatchSubscriberResult {
  subscriber: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
}

export async function patchSubscriber(
  id: string,
  updates: Record<string, unknown>,
): Promise<{ ok: true; result: PatchSubscriberResult } | { ok: false; reason: 'not_found' }> {
  const existingRows = await query('SELECT * FROM realtors WHERE id = $1', [id]);
  if (existingRows.length === 0) return { ok: false, reason: 'not_found' };
  const before = existingRows[0]!;

  const setClauses: string[] = [];
  const params: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in updates) {
      params.push(updates[field]);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return { ok: true, result: { subscriber: before, changed: {} } };
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);
  const updateSql = `UPDATE realtors SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
  const updatedRows = await query(updateSql, params);
  const after = updatedRows[0]!;

  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in updates) {
      const b = (before as Record<string, unknown>)[field];
      const a = (after as Record<string, unknown>)[field];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        changed[field] = { before: b, after: a };
      }
    }
  }

  return { ok: true, result: { subscriber: after, changed } };
}

// -----------------------------------------------------------------------------
// Deactivate
// -----------------------------------------------------------------------------

export async function deactivateSubscriber(id: string): Promise<
  | { ok: true; subscriber: Record<string, unknown>; changed: boolean }
  | { ok: false; reason: 'not_found' }
> {
  const existingRows = await query<{ id: string; status: string }>(
    'SELECT id, status FROM realtors WHERE id = $1',
    [id],
  );
  if (existingRows.length === 0) return { ok: false, reason: 'not_found' };
  const before = existingRows[0]!;

  if (before.status === 'inactive') {
    return { ok: true, subscriber: before, changed: false };
  }

  const updatedRows = await query(
    `UPDATE realtors SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  return { ok: true, subscriber: updatedRows[0]!, changed: true };
}

// -----------------------------------------------------------------------------
// Delete (cascade-aware, transaction)
// -----------------------------------------------------------------------------

export interface DeleteSubscriberCounts {
  event_rsvps: number;
  notification_deliveries: number;
  magic_links: number;
  email_log_nulled: number;
  giveaways_nulled: number;
}

export interface DeleteSubscriberSuccess {
  ok: true;
  email: string | null;
  counts: DeleteSubscriberCounts;
}

export async function deleteSubscriberCascade(
  id: string,
): Promise<DeleteSubscriberSuccess | { ok: false; reason: 'not_found' }> {
  return withNeonTransaction(async (client) => {
    const { rows: existingRows } = await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM realtors WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (existingRows.length === 0) {
      return { ok: false as const, reason: 'not_found' as const };
    }
    const deletedEmail = existingRows[0]!.email;
    const counts: DeleteSubscriberCounts = {
      event_rsvps: 0,
      notification_deliveries: 0,
      magic_links: 0,
      email_log_nulled: 0,
      giveaways_nulled: 0,
    };

    // Each optional satellite-table touch runs in its own SAVEPOINT so that
    // a missing table/column in this environment (schema drift) does NOT
    // abort the whole outer transaction. Postgres aborts the entire tx on
    // any error unless we roll back to a savepoint first.
    async function runStep(
      label: string,
      sql: string,
      params: unknown[],
    ): Promise<number> {
      const sp = `sp_${label}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        const r = await client.query(sql, params);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        return r.rowCount ?? 0;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        if (isMissingSchemaError(err)) {
          logger.warn(
            { err, step: label, id },
            '[deleteSubscriberCascade] skipping step — missing table/column',
          );
          return 0;
        }
        throw err;
      }
    }

    counts.email_log_nulled = await runStep(
      'email_log_null',
      'UPDATE email_log SET realtor_id = NULL WHERE realtor_id = $1',
      [id],
    );
    counts.giveaways_nulled = await runStep(
      'giveaways_null',
      'UPDATE giveaways SET winner_realtor_id = NULL WHERE winner_realtor_id = $1',
      [id],
    );
    counts.event_rsvps = await runStep(
      'event_rsvps_del',
      'DELETE FROM event_rsvps WHERE realtor_id = $1',
      [id],
    );
    counts.notification_deliveries = await runStep(
      'notif_deliveries_del',
      'DELETE FROM notification_deliveries WHERE realtor_id = $1',
      [id],
    );

    if (deletedEmail) {
      counts.magic_links = await runStep(
        'magic_links_del',
        'DELETE FROM magic_links WHERE email = $1',
        [deletedEmail.toLowerCase()],
      );
    }

    // Best-effort cleanup of other satellite tables that may or may not be
    // wired up with ON DELETE CASCADE in this environment. Counts not
    // surfaced — these are belt-and-suspenders.
    await runStep(
      'giveaway_entries_del',
      'DELETE FROM giveaway_entries WHERE realtor_id = $1',
      [id],
    );
    await runStep(
      'mailchimp_subs_del',
      'DELETE FROM mailchimp_subscriptions WHERE realtor_id = $1',
      [id],
    );
    await runStep(
      'notif_prefs_del',
      'DELETE FROM notification_preferences WHERE realtor_id = $1',
      [id],
    );
    await runStep(
      'push_subs_del',
      'DELETE FROM push_subscriptions WHERE realtor_id = $1',
      [id],
    );

    await client.query('DELETE FROM realtors WHERE id = $1', [id]);

    return { ok: true as const, email: deletedEmail, counts };
  });
}

// -----------------------------------------------------------------------------
// CSV helper (exported for the export.csv route)
// -----------------------------------------------------------------------------

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v))
    return '"' + v.map((x) => String(x).replace(/"/g, '""')).join('; ') + '"';
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

