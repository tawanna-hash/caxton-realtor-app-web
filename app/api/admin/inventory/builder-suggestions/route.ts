// app/api/admin/inventory/builder-suggestions/route.ts
// Admin-only builder/developer name suggestions for the inventory creation form.

import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseQuery } from '@/lib/server/schemas/_common';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const builderSuggestionQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();

  const { q, limit } = parseQuery(req, builderSuggestionQuerySchema);
  const match = `%${q}%`;

  // Builder and developer names are both valid values for this shared form
  // field. Preserve one canonical display value per case-insensitive name.
  const rows = await sql`
    SELECT DISTINCT ON (LOWER(name)) name
    FROM (
      SELECT TRIM(builder_name) AS name
      FROM builder_inventory
      WHERE NULLIF(TRIM(builder_name), '') IS NOT NULL

      UNION ALL

      SELECT TRIM(developer_name) AS name
      FROM builder_inventory
      WHERE NULLIF(TRIM(developer_name), '') IS NOT NULL
    ) candidate_names
    WHERE name ILIKE ${match}
    ORDER BY LOWER(name), name
    LIMIT ${limit}
  ` as { name: string }[];

  return NextResponse.json({ builders: rows.map((row) => row.name) });
});
