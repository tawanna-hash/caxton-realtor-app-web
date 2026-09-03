// app/api/admin/inventory/builders/route.ts
// Admin endpoint: per-builder public page visibility (enable/disable).
// Powers /admin/inventory/builders ("Advertiser Pages"). Toggling a builder
// off hides its rows from every public surface while keeping the data in
// builder_inventory (see builder_page_visibility join in lib/builder-inventory).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  builderName: z.string().trim().min(1).max(120),
  publicEnabled: z.boolean(),
});

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  await ensureBuilderInventorySchema();
  const sql = getSql();

  const inventoryRows = (await sql`
    SELECT
      b.builder_name                        AS builder_name,
      b.developer_name                      AS developer_name,
      COUNT(*)::int                          AS total_count,
      COUNT(*) FILTER (WHERE b.status='active')::int AS active_count,
      COALESCE(v.public_enabled, true)       AS public_enabled,
      BOOL_OR(b.builder_name = b.developer_name) AS is_developer
    FROM builder_inventory b
    LEFT JOIN builder_page_visibility v ON v.builder_name = b.builder_name
    GROUP BY b.builder_name, b.developer_name, v.public_enabled
    ORDER BY b.builder_name ASC
  `) as {
    builder_name: string;
    developer_name: string | null;
    total_count: number;
    active_count: number;
    public_enabled: boolean;
    is_developer: boolean;
  }[];

  const partnerRows = (await sql`
    SELECT
      a.id,
      a.name,
      COALESCE(v.public_enabled, true) AS public_enabled
    FROM advertisers a
    LEFT JOIN builder_page_visibility v
      ON LOWER(TRIM(v.builder_name)) = LOWER(TRIM(a.name))
    WHERE COALESCE(a.status, 'advertiser') IN ('advertiser', 'active')
    ORDER BY a.name ASC
  `) as {
    id: number;
    name: string;
    public_enabled: boolean;
  }[];

  const partnersByName = new Map(
    partnerRows.map((partner) => [partner.name.trim().toLowerCase(), partner]),
  );
  const inventoryNames = new Set(
    inventoryRows.map((row) => row.builder_name.trim().toLowerCase()),
  );

  const builders = inventoryRows.map((row) => {
    const partner = partnersByName.get(row.builder_name.trim().toLowerCase());
    return {
      ...row,
      advertiser_id: partner?.id ?? null,
      is_advertising_partner: Boolean(partner),
      public_enabled: partner?.public_enabled ?? row.public_enabled,
    };
  });

  for (const partner of partnerRows) {
    if (inventoryNames.has(partner.name.trim().toLowerCase())) continue;
    builders.push({
      builder_name: partner.name,
      developer_name: null,
      total_count: 0,
      active_count: 0,
      public_enabled: partner.public_enabled,
      is_developer: false,
      advertiser_id: partner.id,
      is_advertising_partner: true,
    });
  }

  builders.sort((a, b) => a.builder_name.localeCompare(b.builder_name));
  return NextResponse.json({ builders });
});

export const PATCH = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();
  const sql = getSql();

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

export const DELETE = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureBuilderInventorySchema();
  const sql = getSql();

  const url = new URL(req.url);
  const builderName = url.searchParams.get('builderName');
  if (!builderName) throw new Error('builderName query param required');

  // Delete all rows for this builder from builder_inventory.
  const deleted = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${builderName}
    RETURNING id
  `;

  // Also remove the visibility entry.
  await sql`
    DELETE FROM builder_page_visibility
    WHERE builder_name = ${builderName}
  `;

  return NextResponse.json({ builderName, deleted: deleted.length });
});
