// app/api/admin/products-services/route.ts
//
// GET  — list catalog items (filterable by market/category/item_type/active).
// POST — create a new catalog item.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { PRODUCT_SERVICE_TYPE_VALUES, type ProductService } from '@/lib/products-services';
import { ensureProductsServicesCatalog } from '@/lib/server/products-services-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();
  const sql = getSql();
  await ensureProductsServicesCatalog();
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market');
  const category = searchParams.get('category');
  const activeOnly = searchParams.get('active') === '1';

  const rows = (await sql`
    SELECT * FROM products_services
    WHERE (${market}::text IS NULL OR market = ${market})
      AND (${category}::text IS NULL OR category = ${category})
      AND (${activeOnly}::boolean IS FALSE OR is_active = true)
    ORDER BY category NULLS LAST, name ASC
  `) as unknown as ProductService[];

  return NextResponse.json({ ok: true, products: rows });
});

export const POST = withAdminTracking(async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const itemType = PRODUCT_SERVICE_TYPE_VALUES.has(body.item_type) ? body.item_type : 'service';

  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      INSERT INTO products_services (
        name, sku, item_type, category, market,
        price_cents, cost_cents, income_account, expense_account,
        sales_description, purchase_description, is_active
      ) VALUES (
        ${name}, ${body.sku ?? null}, ${itemType}, ${body.category ?? null}, ${body.market ?? null},
        ${body.price_cents ?? null}, ${body.cost_cents ?? null},
        ${body.income_account ?? 'Advertising revenue'}, ${body.expense_account ?? null},
        ${body.sales_description ?? null}, ${body.purchase_description ?? null},
        ${body.is_active ?? true}
      )
      RETURNING *
    `) as unknown as ProductService[];
    return NextResponse.json({ ok: true, product: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    if (msg.includes('idx_products_services_name')) {
      return NextResponse.json({ error: `A product/service named "${name}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
