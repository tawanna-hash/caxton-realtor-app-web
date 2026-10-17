import { getSql } from '@/lib/db';
import seedRows from '@/lib/server/products-services-seed.json';
import repriceRows from '@/lib/server/products-services-reprice-2026-10.json';

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

export async function ensureProductsServicesCatalog() {
  const sql = getSql();
  const countRows = await sql`SELECT count(*)::int AS count FROM products_services` as unknown as Array<{ count: number }>;
  const rows = seedRows as SeedRow[];

  // One-time 21% print rate increase (rounded to $5). Only touches rows still at the
  // old list price, so any price an admin edited by hand is left alone. Safe to
  // run repeatedly: once a row is repriced it no longer matches from_cents.
  await sql`
    UPDATE products_services p
       SET price_cents = r.to_cents, updated_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(repriceRows)}::jsonb)
           AS r(name text, from_cents int, to_cents int)
     WHERE p.name = r.name AND p.price_cents = r.from_cents
  `;

  if ((countRows[0]?.count ?? 0) >= rows.length) return;

  for (const row of rows) {
    await sql`
      INSERT INTO products_services (
        name, sku, item_type, category, market,
        price_cents, cost_cents, income_account, expense_account,
        sales_description, purchase_description, is_active
      ) VALUES (
        ${row.name}, ${row.sku}, ${row.item_type}, ${row.category}, ${row.market},
        ${row.price_cents}, ${row.cost_cents}, ${row.income_account}, ${row.expense_account},
        ${row.sales_description}, ${row.purchase_description}, true
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
        is_active = true,
        updated_at = now()
    `;
  }
}
