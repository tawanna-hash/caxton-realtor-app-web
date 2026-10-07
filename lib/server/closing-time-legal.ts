import { query } from '@/lib/server/db/neon';

// Bump when the Terms, Privacy Policy or Important Notices change materially; everyone is asked to agree again.
export const CLOSING_TIME_LEGAL_VERSION = '2026-10-07';

let schemaPromise: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_legal_acceptances (
        realtor_id UUID NOT NULL REFERENCES realtors(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip TEXT,
        user_agent TEXT,
        PRIMARY KEY (realtor_id, version)
      )
    `);
  })().catch((e) => { schemaPromise = null; throw e; });
  return schemaPromise;
}

export async function getLegalAcceptance(realtorId: string): Promise<{ accepted: boolean; version: string; acceptedAt: string | null }> {
  await ensureSchema();
  const rows = await query<{ accepted_at: string }>(
    `SELECT accepted_at FROM closing_time_legal_acceptances WHERE realtor_id = $1 AND version = $2`,
    [realtorId, CLOSING_TIME_LEGAL_VERSION],
  );
  return { accepted: rows.length > 0, version: CLOSING_TIME_LEGAL_VERSION, acceptedAt: rows[0] ? new Date(rows[0].accepted_at).toISOString() : null };
}

export async function recordLegalAcceptance(realtorId: string, ip: string | null, userAgent: string | null): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO closing_time_legal_acceptances (realtor_id, version, ip, user_agent) VALUES ($1,$2,$3,$4) ON CONFLICT (realtor_id, version) DO NOTHING`,
    [realtorId, CLOSING_TIME_LEGAL_VERSION, ip, userAgent?.slice(0, 300) ?? null],
  );
}
