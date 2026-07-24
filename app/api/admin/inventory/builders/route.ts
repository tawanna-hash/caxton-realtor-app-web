// app/api/admin/inventory/builders/route.ts
// Admin endpoint: per-builder public page visibility (enable/disable).
// Powers /admin/inventory/builders ("Advertiser Pages"). Toggling a builder
// off hides its rows from every public surface while keeping the data in
// builder_inventory (see builder_page_visibility join in lib/builder-inventory).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { neon } from '@neondatabase/serverless';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const patchSchema = z.object({
  builderName: z.string().trim().min(1).max(120),
  publicEnabled: z.boolean(),
});

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureBuilderInventorySchema();

  const rows = (await sql`
    SELECT
      b.builder_name                        AS builder_name,
      COUNT(*)::int                          AS total_count,
      COUNT(*) FILTER (WHERE b.status='active')::int AS active_count,
      COALESCE(v.public_enabled, true)       AS public_enabled
    FROM builder_inventory b
    LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
    GROUP BY b.builder_name, v.public_enabled
    ORDER BY b.builder_name ASC
  `) as {
    builder_name: string;
    total_count: number;
    active_count: number;
    public_enabled: boolean;
  }[];

  return NextResponse.json({ builders: rows });
});

export const PATCH = withErrorHandling(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();

  const body = await req.json();
  const { builderName, publicEnabled } = patchSchema.parse(body);

  // Upsert visibility. ON CONFLICT DO UPDATE so toggling back on works and
  // stamps updated_at. This is the one place that flips public_enabled.
  await sql`
    INSERT INTO builder_page_visibility (builder_name, public_enabled)
    VALUES (${builderName}, ${publicEnabled})
    ON CONFLICT (builder_name)
    DO UPDATE SET public_enabled = EXCLUDED.public_enabled, updated_at = NOW()
  `;

  return NextResponse.json({ builderName, publicEnabled });
});
