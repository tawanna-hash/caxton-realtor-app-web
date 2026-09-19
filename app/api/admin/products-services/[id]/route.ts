// app/api/admin/products-services/[id]/route.ts
//
// GET    — single catalog item
// PATCH  — update allow-listed fields
// DELETE — hard delete (blocked if referenced by an agreement/invoice line — not tracked yet, so unrestricted)

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { PRODUCT_SERVICE_PATCHABLE_FIELDS, PRODUCT_SERVICE_TYPE_VALUES, type ProductService } from '@/lib/products-services';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT * FROM products_services WHERE id = ${id}`) as unknown as ProductService[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ product: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: 'get failed', detail: errMessage(err) }, { status: 500 });
  }
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const existing = (await sql`SELECT id FROM products_services WHERE id = ${id}`) as unknown as Array<{ id: string }>;
    if (existing.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const updated: string[] = [];
    for (const field of PRODUCT_SERVICE_PATCHABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field as keyof typeof body];

      if (field === 'item_type' && typeof raw === 'string' && !PRODUCT_SERVICE_TYPE_VALUES.has(raw as never)) continue;

      switch (field) {
        case 'name':                  await sql`UPDATE products_services SET name = ${raw as string}                            WHERE id = ${id}`; break;
        case 'sku':                   await sql`UPDATE products_services SET sku = ${raw as string | null}                       WHERE id = ${id}`; break;
        case 'item_type':             await sql`UPDATE products_services SET item_type = ${raw as string}                        WHERE id = ${id}`; break;
        case 'category':              await sql`UPDATE products_services SET category = ${raw as string | null}                  WHERE id = ${id}`; break;
        case 'market':                await sql`UPDATE products_services SET market = ${raw as string | null}                    WHERE id = ${id}`; break;
        case 'price_cents':           await sql`UPDATE products_services SET price_cents = ${raw as number | null}               WHERE id = ${id}`; break;
        case 'cost_cents':            await sql`UPDATE products_services SET cost_cents = ${raw as number | null}                WHERE id = ${id}`; break;
        case 'income_account':        await sql`UPDATE products_services SET income_account = ${raw as string | null}            WHERE id = ${id}`; break;
        case 'expense_account':       await sql`UPDATE products_services SET expense_account = ${raw as string | null}           WHERE id = ${id}`; break;
        case 'sales_description':     await sql`UPDATE products_services SET sales_description = ${raw as string | null}         WHERE id = ${id}`; break;
        case 'purchase_description':  await sql`UPDATE products_services SET purchase_description = ${raw as string | null}      WHERE id = ${id}`; break;
        case 'is_active':             await sql`UPDATE products_services SET is_active = ${Boolean(raw)}                         WHERE id = ${id}`; break;
      }
      updated.push(field);
    }

    if (updated.length === 0) return NextResponse.json({ error: 'no patchable fields' }, { status: 400 });
    await sql`UPDATE products_services SET updated_at = NOW() WHERE id = ${id}`;
    const rows = await sql`SELECT * FROM products_services WHERE id = ${id}`;
    return NextResponse.json({ product: rows[0], updated_fields: updated });
  } catch (err) {
    console.error('[admin/products-services PATCH]', errMessage(err));
    return NextResponse.json({ error: 'patch failed', detail: errMessage(err) }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT id FROM products_services WHERE id = ${id}`) as unknown as Array<{ id: string }>;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await sql`DELETE FROM products_services WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
});
