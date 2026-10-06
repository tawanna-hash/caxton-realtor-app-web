import { randomUUID } from 'crypto';
import { query } from '@/lib/server/db/neon';

/**
 * Deal-level events that happen outside the browser (emails, signatures, uploads, people added, deadline alerts).
 * Each is copied into the deal's Audit Trail the next time the agent has the deal open, then marked audited.
 */
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS closing_time_audit_events (
      id UUID PRIMARY KEY, realtor_id UUID NOT NULL, deal_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), audited BOOLEAN NOT NULL DEFAULT FALSE)`);
    await query(`CREATE INDEX IF NOT EXISTS closing_time_audit_events_deal_idx ON closing_time_audit_events (realtor_id, deal_id, audited, created_at)`);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/** Never throws: an audit write must not break the email, signature or upload it describes. */
export async function logDealEvent(realtorId: string, dealId: string, kind: string, message: string): Promise<void> {
  try {
    await ensure();
    await query(`INSERT INTO closing_time_audit_events (id, realtor_id, deal_id, kind, message) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), realtorId, dealId, kind.slice(0, 40), message.slice(0, 560)]);
  } catch { /* ignore */ }
}

export async function listUnauditedEvents(realtorId: string, dealId: string): Promise<{ id: string; message: string; createdAt: string }[]> {
  await ensure();
  const rows = await query<{ id: string; message: string; created_at: Date | string }>(`SELECT id, message, created_at FROM closing_time_audit_events WHERE realtor_id=$1 AND deal_id=$2 AND audited=FALSE ORDER BY created_at ASC LIMIT 100`, [realtorId, dealId]);
  return rows.map((r) => ({ id: r.id, message: r.message, createdAt: new Date(r.created_at).toISOString() }));
}

export async function markEventsAudited(realtorId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await ensure();
  await query(`UPDATE closing_time_audit_events SET audited=TRUE WHERE realtor_id=$1 AND id = ANY($2::uuid[])`, [realtorId, ids]);
}

/** Deadline alerts (email, push, text) are claimed in their own table; copy a sent one into the audit feed. */
export async function logDeadlineDelivery(deliveryId: string): Promise<void> {
  try {
    await ensure();
    const rows = await query<{ realtor_id: string; deal_id: string; deadline_key: string; deadline_date: string | Date; channel: string; trigger_offset_days: number }>(
      `SELECT realtor_id, deal_id, deadline_key, deadline_date, channel, trigger_offset_days FROM agent_command_center_deadline_deliveries WHERE id=$1::uuid`, [deliveryId]);
    const r = rows[0];
    if (!r) return;
    const channel = r.channel === 'web_push' ? 'Push notification' : r.channel === 'sms' ? 'Text message' : 'Email';
    const date = new Date(r.deadline_date).toISOString().slice(0, 10);
    await logDealEvent(r.realtor_id, r.deal_id, 'deadline_alert', `${channel} deadline alert sent: ${r.deadline_key.replace(/[-_]/g, ' ')} due ${date} (${r.trigger_offset_days === 0 ? 'day of' : `${r.trigger_offset_days} day${r.trigger_offset_days === 1 ? '' : 's'} before`})`);
  } catch { /* ignore */ }
}
