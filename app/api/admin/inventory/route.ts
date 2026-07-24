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
  status: z.enum(['pending', 'active', 'rejected', 'expired']).default('pending'),
  // Scope the list + counts to one kind so the split Inventory / Promotions
  // admin pages each fetch only their own rows.
  kind: z.enum(['listing', 'promotion']).optional(),
  // Raised from 200 to 2000 on 2026-06-22 because the active queue grew past
  // 200 (currently ~666) and newly-created promotions were getting hidden
  // behind the older listings in the truncated window.
  limit:  z.coerce.number().int().min(1).max(2000).default(2000),
});

export const GET = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();

  const { status, kind, limit } = parseQuery(req, listInventoryQuerySchema);

  // includeDisabledBuilders:true so disabled advertiser pages (e.g. Newmark)
  // remain visible/manageable in admin even though they're hidden publicly.
  const rows = await listBuilderInventory({ status, kind: kind ?? undefined, limit, includeDisabledBuilders: true });

  // Counts for the tab badges — scoped to the requested kind when present so
  // each split page (Inventory vs Promotions) shows only its own counts.
  const countRows = kind
    ? (await sql`
        SELECT status, COUNT(*)::int AS count
        FROM builder_inventory
        WHERE kind = ${kind}
        GROUP BY status
      `) as { status: Status; count: number }[]
    : (await sql`
        SELECT status, COUNT(*)::int AS count
        FROM builder_inventory
        GROUP BY status
      `) as { status: Status; count: number }[];

  const counts: Record<Status, number> = { pending: 0, active: 0, rejected: 0, expired: 0 };
  for (const r of countRows) counts[r.status] = r.count;

  return NextResponse.json({ rows, counts });
});
