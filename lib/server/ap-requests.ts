// Accounts-payable requests: the client sends their AP contact a pay-only link.
import { getSql } from '@/lib/db';

export type ApStatus = 'sent' | 'opened' | 'paid';
export type ApRequest = { id: number; agreement_id: string; email: string; status: ApStatus; sent_at: string; opened_at: string | null; paid_at: string | null };

let ready = false;
async function ensure() {
  if (ready) return;
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS agreement_ap_requests (
    id serial PRIMARY KEY,
    agreement_id text NOT NULL,
    email text NOT NULL,
    status text NOT NULL DEFAULT 'sent',
    sent_at timestamptz NOT NULL DEFAULT now(),
    opened_at timestamptz,
    paid_at timestamptz,
    session_id text)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ap_requests_agreement ON agreement_ap_requests(agreement_id)`;
  ready = true;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const map = (r: Record<string, unknown>): ApRequest => ({
  id: Number(r.id), agreement_id: String(r.agreement_id), email: String(r.email), status: r.status as ApStatus,
  sent_at: iso(r.sent_at) as string, opened_at: iso(r.opened_at), paid_at: iso(r.paid_at),
});

export async function recentApRequest(agreementId: string, minutes: number): Promise<boolean> {
  await ensure();
  const rows = (await getSql()`SELECT 1 FROM agreement_ap_requests WHERE agreement_id = ${agreementId} AND sent_at > now() - make_interval(mins => ${minutes}) LIMIT 1`) as unknown[];
  return rows.length > 0;
}

export async function createApRequest(agreementId: string, email: string): Promise<void> {
  await ensure();
  await getSql()`INSERT INTO agreement_ap_requests (agreement_id, email) VALUES (${agreementId}, ${email})`;
}

export async function latestApRequest(agreementId: string): Promise<ApRequest | null> {
  await ensure();
  const rows = (await getSql()`SELECT * FROM agreement_ap_requests WHERE agreement_id = ${agreementId} ORDER BY id DESC LIMIT 1`) as unknown as Array<Record<string, unknown>>;
  return rows[0] ? map(rows[0]) : null;
}

export async function markApOpened(agreementId: string): Promise<void> {
  await ensure();
  await getSql()`UPDATE agreement_ap_requests SET status = 'opened', opened_at = now()
    WHERE id = (SELECT max(id) FROM agreement_ap_requests WHERE agreement_id = ${agreementId}) AND status = 'sent'`;
}

export async function markApPaid(agreementId: string, sessionId: string): Promise<void> {
  await ensure();
  await getSql()`UPDATE agreement_ap_requests SET status = 'paid', paid_at = now(), session_id = ${sessionId}
    WHERE id = (SELECT max(id) FROM agreement_ap_requests WHERE agreement_id = ${agreementId})`;
}

export async function apStatusFor(ids: string[]): Promise<Record<string, ApRequest>> {
  await ensure();
  if (!ids.length) return {};
  const rows = (await getSql()`SELECT DISTINCT ON (agreement_id) * FROM agreement_ap_requests WHERE agreement_id = ANY(${ids}) ORDER BY agreement_id, id DESC`) as unknown as Array<Record<string, unknown>>;
  return Object.fromEntries(rows.map((r) => [String(r.agreement_id), map(r)]));
}
