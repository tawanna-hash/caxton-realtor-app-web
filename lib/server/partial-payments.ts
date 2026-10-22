import { getSql } from '@/lib/db';

let ready: Promise<void> | null = null;

/**
 * Per-client switch for paying a different amount than the full invoice or full
 * balance. Off for everyone; seeded ON once, only for Choice Home Warranty.
 */
function ensureColumn(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = getSql();
      const exists = (await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'advertisers' AND column_name = 'allow_partial_payments'
      `) as unknown as unknown[];
      if (exists.length === 0) {
        await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS allow_partial_payments BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`UPDATE advertisers SET allow_partial_payments = TRUE WHERE name ILIKE 'Choice Home Warranty%' OR company ILIKE 'Choice Home Warranty%'`;
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function canPayPartial(advertiserId: number | null | undefined): Promise<boolean> {
  if (!advertiserId) return false;
  await ensureColumn();
  const rows = (await getSql()`SELECT allow_partial_payments FROM advertisers WHERE id = ${advertiserId}`) as unknown as Array<{ allow_partial_payments: boolean }>;
  return rows[0]?.allow_partial_payments === true;
}
