/**
 * Neon SQL helpers for server code. Wraps `@neondatabase/serverless`.
 *
 * For tagged-template queries: `import { getSql } from '@/lib/db'` already
 * works app-wide and is the right choice for most reads.
 *
 * This module adds:
 *   - `getPool()`: a `pg.Pool`-style client (via @neondatabase/serverless's
 *     `Pool` export) for code that needs `query(text, values)` parameterized
 *     queries or a real transaction. Cached on globalThis so it survives
 *     warm-instance reuse.
 *   - `withNeonTransaction(fn)`: convenience wrapper to run a callback inside
 *     a BEGIN/COMMIT/ROLLBACK using a checked-out client.
 */

import { Pool, type PoolClient } from '@neondatabase/serverless';

function getConnectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    // Don't echo env var names back to clients via 500 bodies.
    // The real reason is logged for operators.
    console.error(
      '[neon] No Postgres connection string found. Expected DATABASE_URL or POSTGRES_URL.',
    );
    throw new Error('Database not configured');
  }
  return url;
}

// Cache the Pool on globalThis so warm Lambda instances reuse it.
declare global {
  var __neonPool: Pool | undefined;
}

export function getPool(): Pool {
  if (globalThis.__neonPool) return globalThis.__neonPool;
  const pool = new Pool({
    connectionString: getConnectionString(),
    // Fail fast on cold-boot if Neon is slow to wake; better a 500 than a
    // hung serverless function eating a full Vercel timeout.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
  // Without this listener, an emitted pool-level 'error' (e.g. an idle
  // client dropped by Neon during a brownout) becomes an unhandled
  // EventEmitter error and crashes the function.
  pool.on('error', (err: Error) => {
    console.error('[neon-pool] idle client error', err);
  });
  globalThis.__neonPool = pool;
  return pool;
}

export async function withNeonTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Convenience: run a single parameterized query and return rows.
 * Use this when the existing tagged-template `getSql()` doesn't fit.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  values?: readonly unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, values as unknown[] | undefined);
  return result.rows as T[];
}

/**
 * Like `query` but also returns the affected row count. Use this for
 * UPDATE/DELETE/INSERT when you need to detect 'not found' / 'no-op'.
 */
export async function exec<T = Record<string, unknown>>(
  text: string,
  values?: readonly unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query(text, values as unknown[] | undefined);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}
