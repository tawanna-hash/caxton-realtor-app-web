// Clients whose account is inactive/archived must never receive email.
import { getSql } from '@/lib/db';

export async function isAdvertiserInactive(advertiserId: number | null | undefined): Promise<boolean> {
  if (advertiserId == null) return false;
  const sql = getSql();
  const rows = (await sql`SELECT status FROM advertisers WHERE id = ${advertiserId}`) as unknown as Array<{ status: string | null }>;
  const s = rows[0]?.status;
  return s === 'inactive' || s === 'archived';
}
