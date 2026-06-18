/**
 * /api/admin/notifications/stats
 *   GET — count active push subscribers (overall + by market) so the admin
 *         compose modal can show "Reaches ~N devices" before sending.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT
      COALESCE(market, 'unspecified') AS bucket,
      COUNT(*)::int AS n
    FROM push_subscriptions
    WHERE revoked_at IS NULL
    GROUP BY bucket
  `) as unknown as Array<{ bucket: string; n: number }>;

  const byMarket: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byMarket[r.bucket] = r.n;
    total += r.n;
  }

  return NextResponse.json({
    total,
    austin: byMarket['austin'] || 0,
    san_antonio: byMarket['san_antonio'] || 0,
    unspecified: byMarket['unspecified'] || 0,
  });
});
