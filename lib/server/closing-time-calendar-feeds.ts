import { randomBytes } from 'crypto';
import { query } from '@/lib/server/db/neon';

/**
 * Private, per-agent Closing Time calendar subscription tokens. Calendar
 * apps can't sign in, so the feed URL carries an unguessable token. Agents
 * can reset it at any time, which immediately invalidates the old link.
 */

let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS closing_time_calendar_feeds (
        realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_fetched_at TIMESTAMPTZ
      )
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidFeedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

export async function getOrCreateCalendarFeedToken(realtorId: string): Promise<string> {
  await ensureSchema();
  const existing = await query<{ token: string }>(
    'SELECT token FROM closing_time_calendar_feeds WHERE realtor_id = $1 LIMIT 1',
    [realtorId],
  );
  if (existing[0]) return existing[0].token;
  const rows = await query<{ token: string }>(
    `INSERT INTO closing_time_calendar_feeds (realtor_id, token)
     VALUES ($1, $2)
     ON CONFLICT (realtor_id) DO UPDATE SET realtor_id = EXCLUDED.realtor_id
     RETURNING token`,
    [realtorId, newToken()],
  );
  return rows[0].token;
}

export async function resetCalendarFeedToken(realtorId: string): Promise<string> {
  await ensureSchema();
  const rows = await query<{ token: string }>(
    `INSERT INTO closing_time_calendar_feeds (realtor_id, token)
     VALUES ($1, $2)
     ON CONFLICT (realtor_id) DO UPDATE SET token = EXCLUDED.token, rotated_at = NOW()
     RETURNING token`,
    [realtorId, newToken()],
  );
  return rows[0].token;
}

export async function findRealtorIdByFeedToken(token: string): Promise<string | null> {
  if (!isValidFeedToken(token)) return null;
  await ensureSchema();
  const rows = await query<{ realtor_id: string }>(
    `UPDATE closing_time_calendar_feeds
     SET last_fetched_at = NOW()
     WHERE token = $1
     RETURNING realtor_id`,
    [token],
  );
  return rows[0]?.realtor_id ?? null;
}
