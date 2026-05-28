/**
 * Admin audit log writes. Inserts into DO Postgres `admin_audit_log`.
 *
 * The `entity_id` column is `uuid`, which is fine for admins/realtors/
 * giveaways/subscribers (all uuid PKs) but NOT for events (Neon SERIAL int).
 * For events callers pass `entityId: null` and put the numeric id in the
 * after_state payload — see logEventAudit().
 *
 * Once we widen entity_id to text post-migration, logEventAudit() can be
 * deleted in favor of the generic logAudit() with a string entity id.
 */

import { query } from './db/neon';
import { getRequestIp } from './auth/admin';

interface LogAuditInput {
  adminId: string;
  action: string;
  entityType: string;
  /** Must be a real UUID string. Pass null when the entity is not uuid-keyed. */
  entityId: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | null;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  const ip = input.ipAddress ?? (await getRequestIp());
  await query(
    `INSERT INTO admin_audit_log
       (admin_id, action, entity_type, entity_id, before_state, after_state, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.adminId,
      input.action,
      input.entityType,
      input.entityId,
      input.beforeState !== undefined ? JSON.stringify(input.beforeState) : null,
      input.afterState !== undefined ? JSON.stringify(input.afterState) : null,
      ip,
    ],
  );
}

/**
 * Convenience for events — the numeric event id is folded into after_state
 * because entity_id can't accept it. See file header for why.
 */
export async function logEventAudit(opts: {
  adminId: string;
  action: string;
  eventId: number | null;
  payload?: unknown;
  ipAddress?: string | null;
}): Promise<void> {
  const after =
    opts.eventId !== null
      ? { ...((opts.payload as object | undefined) ?? {}), event_id: opts.eventId }
      : opts.payload;
  await logAudit({
    adminId: opts.adminId,
    action: opts.action,
    entityType: 'event',
    entityId: null,
    afterState: after,
    ipAddress: opts.ipAddress,
  });
}
