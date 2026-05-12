// app/api/admin/inventory/route.ts
// Admin endpoint: list builder_inventory rows filtered by status.
// Returns rows + counts per status (for the tab indicators).
//
// Auth: mirrors the existing admin route pattern. The actual auth wiring
// (cookie check, admin role validation) is done by the route middleware /
// admin layout — this route assumes the request is already authenticated
// if it reaches here. If the project's admin auth pattern requires inline
// validation, this route should be updated to match.

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  ensureBuilderInventorySchema,
  type Status,
} from '@/lib/builder-inventory';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await ensureBuilderInventorySchema();

    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status') as Status | null;

    const VALID_STATUSES: Status[] = ['pending', 'active', 'rejected'];
    const status: Status =
      statusParam && VALID_STATUSES.includes(statusParam)
        ? statusParam
        : 'pending';

    const rows = await listBuilderInventory({ status, limit: 200 });

    // Fetch counts for all statuses in a single query.
    const countRows = (await sql`
      SELECT status, COUNT(*)::int AS count
      FROM builder_inventory
      GROUP BY status
    `) as { status: Status; count: number }[];

    const counts: Record<Status, number> = {
      pending: 0,
      active: 0,
      rejected: 0,
    };
    for (const r of countRows) counts[r.status] = r.count;

    return NextResponse.json({ rows, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/inventory] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
