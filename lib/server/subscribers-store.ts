/**
 * Subscribers (realtors) store — DO Postgres (transient).
 * Migrate to Neon by swapping query / exec / withNeonTransaction.
 */

import { query, withNeonTransaction } from './db/neon';
import { EDITABLE_FIELDS } from './schemas/subscribers';

// -----------------------------------------------------------------------------
// List + detail
// -----------------------------------------------------------------------------

export interface ListSubscribersOptions {
  page: number;
  pageSize: number;
  market?: 'austin' | 'san_antonio';
  q?: string;
}

export interface ListSubscribersResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  subscribers: Record<string, unknown>[];
}

export async function listSubscribers(
  opts: ListSubscribersOptions,
): Promise<ListSubscribersResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.market) {
    params.push(opts.market);
    where.push(`market = $${params.length}`);
  }
  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const i = params.length;
    where.push(`(email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (opts.page - 1) * opts.pageSize;

  const countRows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM realtors ${whereSql}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  params.push(opts.pageSize, offset);
  const listSql = `
    SELECT
      id, email, first_name, last_name, market,
      license_type, trec_license_number, nmls_license_number, title,
      mobile, city, state, zip,
      birthday_month, birthday_day,
      fb_handle, ig_handle, li_handle,
      subscriptions, status,
      created_at, last_login_at, last_app_open_at
    FROM realtors
    ${whereSql}
    ORDER BY created_at DESC
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

    const r1 = await client.query('UPDATE email_log SET realtor_id = NULL WHERE realtor_id = $1', [id]);
    counts.email_log_nulled = r1.rowCount ?? 0;
    const r2 = await client.query(
      'UPDATE giveaways SET winner_realtor_id = NULL WHERE winner_realtor_id = $1',
      [id],
    );
    counts.giveaways_nulled = r2.rowCount ?? 0;

    const r3 = await client.query('DELETE FROM event_rsvps WHERE realtor_id = $1', [id]);
    counts.event_rsvps = r3.rowCount ?? 0;
    const r4 = await client.query(
      'DELETE FROM notification_deliveries WHERE realtor_id = $1',
      [id],
    );
    counts.notification_deliveries = r4.rowCount ?? 0;

    if (deletedEmail) {
      const r5 = await client.query('DELETE FROM magic_links WHERE email = $1', [
        deletedEmail.toLowerCase(),
      ]);
      counts.magic_links = r5.rowCount ?? 0;
    }

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

