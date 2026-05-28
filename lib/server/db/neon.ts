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
    throw new Error(
      'No Postgres connection string found. Expected DATABASE_URL or POSTGRES_URL.',
    );
  }
  return url;
}

// Cache the Pool on globalThis so warm Lambda instances reuse it.
declare global {
  var __neonPool: Pool | undefined;
}

export function getPool(): Pool {
  if (globalThis.__neonPool) return globalThis.__neonPool;
  const pool = new Pool({ connectionString: getConnectionString() });
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
