/**
 * DigitalOcean Managed Postgres pool. TRANSIENT — exists only so we can
 * complete the API merge without doing the cross-DB data migration in the
 * same change. Once `admins`, `realtors`, `password_reset_tokens`,
 * `admin_password_resets`, `admin_audit_log`, `email_log`, `magic_links`,
 * `giveaways`, `giveaway_rules`, `giveaway_entries`, `subscribers`,
 * `webauthn_credentials`, `notification_preferences` are all migrated to
 * Neon, delete this file and switch the callers to `lib/server/db/neon.ts`.
 *
 * Connection string env var: `DO_DATABASE_URL` (renamed from `DATABASE_URL`
 * which now points to Neon in the web app's env).
 */

import pg from 'pg';

declare global {
  var __doPool: pg.Pool | undefined;
}

export function getDoPool(): pg.Pool {
  if (globalThis.__doPool) return globalThis.__doPool;

  const connectionString = process.env.DO_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DO_DATABASE_URL is not set. This connection is required until the ' +
        'DigitalOcean Postgres data is migrated to Neon.',
    );
  }

  const pool = new pg.Pool({
    connectionString,
    // Keep low — every Lambda warms 1-3 connections. DO managed-pg standard
    // tier caps around ~20 total connections.
    max: 3,
    idleTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (err) => {
    console.error('[do-pool] unexpected error', err);
  });

  globalThis.__doPool = pool;
  return pool;
}

export async function doQuery<T = Record<string, unknown>>(
  text: string,
  values?: readonly unknown[],
): Promise<T[]> {
  const result = await getDoPool().query(text, values as unknown[] | undefined);
  return result.rows as T[];
}

export async function withDoTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDoPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
