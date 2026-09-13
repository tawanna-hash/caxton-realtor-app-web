// app/api/admin/products-services/import/route.ts
//
// One-shot importer for the QuickBooks "Products & Services" export.
// Upserts every row from lib/server/products-services-seed.json (parsed
// from ProductsServicesList_Caxton_Publications_Inc_9_12_2026.csv) into
// the products_services table, keyed on unique `name`.
//
// Safe to re-run: ON CONFLICT (name) DO UPDATE keeps the catalog in sync
// with the seed file rather than erroring on duplicates.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import seedRows from '@/lib/server/products-services-seed.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SeedRow = {
  name: string;
  sku: string | null;
  item_type: 'service' | 'non_inventory' | 'inventory' | 'bundle';
  category: string | null;
  market: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  income_account: string | null;
  expense_account: string | null;
  sales_description: string | null;
  purchase_description: string | null;
};

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  const rows = seedRows as SeedRow[];

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (const row of rows) {
    try {
      const result = (await sql`
        INSERT INTO products_services (
          name, sku, item_type, category, market,
          price_cents, cost_cents, income_account, expense_account,
          sales_description, purchase_description
        ) VALUES (
          ${row.name}, ${row.sku}, ${row.item_type}, ${row.category}, ${row.market},
          ${row.price_cents}, ${row.cost_cents}, ${row.income_account}, ${row.expense_account},
          ${row.sales_description}, ${row.purchase_description}
        )
        ON CONFLICT (name) DO UPDATE SET
          sku = EXCLUDED.sku,
          item_type = EXCLUDED.item_type,
          category = EXCLUDED.category,
          market = EXCLUDED.market,
          price_cents = EXCLUDED.price_cents,
          cost_cents = EXCLUDED.cost_cents,
          income_account = EXCLUDED.income_account,
          expense_account = EXCLUDED.expense_account,
          sales_description = EXCLUDED.sales_description,
          purchase_description = EXCLUDED.purchase_description,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `) as unknown as Array<{ inserted: boolean }>;
      if (result[0]?.inserted) inserted++; else updated++;
    } catch (err) {
      errors.push({ name: row.name, error: err instanceof Error ? err.message : 'unknown error' });
    }
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    inserted,
    updated,
    errors,
  });
});

export const GET = withAdminTracking(async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = seedRows as SeedRow[];
  return NextResponse.json({ ok: true, count: rows.length, preview: rows.slice(0, 5) });
});
