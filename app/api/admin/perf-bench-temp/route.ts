// TEMPORARY diagnostic endpoint — benchmarks neon() HTTP driver vs pooled Pool
// client on the real production DATABASE_URL. Admin-gated. Delete after use.
import { NextResponse } from 'next/server';
import { neon, Pool } from '@neondatabase/serverless';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('no connection string');
  return url;
}

async function timeIt(label: string, fn: () => Promise<unknown>, iterations: number) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return { label, times, avg: times.reduce((a, b) => a + b, 0) / times.length, min: Math.min(...times), max: Math.max(...times) };
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ITER = 8;
  const results: Record<string, unknown> = {};

  // --- HTTP driver (current production approach) ---
  const sql = neon(getUrl());
  results.http_single_query = await timeIt('http_single_query', async () => {
    await sql`SELECT 1`;
  }, ITER);

  results.http_sequential_4x = await timeIt('http_sequential_4x', async () => {
    await sql`SELECT 1`;
    await sql`SELECT 2`;
    await sql`SELECT 3`;
    await sql`SELECT 4`;
  }, ITER);

  results.http_parallel_4x = await timeIt('http_parallel_4x', async () => {
    await Promise.all([sql`SELECT 1`, sql`SELECT 2`, sql`SELECT 3`, sql`SELECT 4`]);
  }, ITER);

  // --- Pooled driver (candidate) ---
  const pool = new Pool({ connectionString: getUrl() });
  try {
    results.pool_single_query = await timeIt('pool_single_query', async () => {
      const client = await pool.connect();
      try { await client.query('SELECT 1'); } finally { client.release(); }
    }, ITER);

    // Reuse a single client across "sequential 4x" to reflect pooling's real advantage:
    // no new connection per query when queries share a request lifecycle.
    results.pool_sequential_4x_shared_client = await timeIt('pool_sequential_4x_shared_client', async () => {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        await client.query('SELECT 2');
        await client.query('SELECT 3');
        await client.query('SELECT 4');
      } finally {
        client.release();
      }
    }, ITER);

    results.pool_parallel_4x = await timeIt('pool_parallel_4x', async () => {
      await Promise.all([
        pool.query('SELECT 1'),
        pool.query('SELECT 2'),
        pool.query('SELECT 3'),
        pool.query('SELECT 4'),
      ]);
    }, ITER);
  } finally {
    await pool.end();
  }

  return NextResponse.json({ iterations: ITER, results });
}
