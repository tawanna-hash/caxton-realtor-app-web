// Clients whose account is inactive/archived must not receive marketing or sales email.
// Billing email is the exception: an archived client who still owes money must keep
// getting invoices and payment links (see isBillingEmailBlocked).
import { getSql } from '@/lib/db';

export async function isAdvertiserInactive(advertiserId: number | null | undefined): Promise<boolean> {
  if (advertiserId == null) return false;
  const sql = getSql();
  const rows = (await sql`SELECT status FROM advertisers WHERE id = ${advertiserId}`) as unknown as Array<{ status: string | null }>;
  const s = rows[0]?.status;
  return s === 'inactive' || s === 'archived';
}

/**
 * Guard for invoice / payment-link email. Archived or inactive clients are only blocked
 * when they owe nothing; any client with an unpaid (sent or overdue) invoice must still be
 * sent payment requests.
 */
export async function isBillingEmailBlocked(advertiserId: number | null | undefined): Promise<boolean> {
  if (!(await isAdvertiserInactive(advertiserId))) return false;
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 FROM invoices
     WHERE advertiser_id = ${advertiserId} AND status IN ('sent', 'overdue')
     LIMIT 1
  `) as unknown as unknown[];
  return rows.length === 0;
}
