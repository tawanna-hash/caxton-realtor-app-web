// app/api/admin/inventory/route.ts
// Admin endpoint: list builder_inventory rows filtered by status.
// Returns rows + counts per status (for the tab indicators).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listBuilderInventory,
  ensureBuilderInventorySchema,
  type Status,
} from '@/lib/builder-inventory';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { parseQuery } from '@/lib/server/schemas/_common';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listInventoryQuerySchema = z.object({
  status: z.enum(['pending', 'active', 'rejected']).default('pending'),
  // Raised from 200 to 2000 on 2026-06-22 because the active queue grew past
  // 200 (currently ~666) and newly-created promotions were getting hidden
  // behind the older listings in the truncated window.
  limit:  z.coerce.number().int().min(1).max(2000).default(2000),
});

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();

  const { status, limit } = parseQuery(req, listInventoryQuerySchema);

  const rows = await listBuilderInventory({ status, limit });

  // Counts for the tab badges — single query across all statuses.
  const countRows = (await sql`
    SELECT status, COUNT(*)::int AS count
    FROM builder_inventory
    GROUP BY status
  `) as { status: Status; count: number }[];

  const counts: Record<Status, number> = { pending: 0, active: 0, rejected: 0 };
  for (const r of countRows) counts[r.status] = r.count;

  return NextResponse.json({ rows, counts });
});
