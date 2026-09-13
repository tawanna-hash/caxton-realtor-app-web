// app/admin/products-services/page.tsx
//
// Native Products & Services catalog. Powers invoice
// and recurring-schedule line-item pickers.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { ProductService } from '@/lib/products-services';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureProductsServicesCatalog } from '@/lib/server/products-services-catalog';
import ProductsServicesClient from './ProductsServicesClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}

export default async function ProductsServicesPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  await ensureProductsServicesCatalog();
  const sql = getSql();

  const products = await sql`
    SELECT * FROM products_services
    ORDER BY category NULLS LAST, name ASC
  `.catch(() => [] as unknown[]);

  return <ProductsServicesClient initialProducts={products as unknown as ProductService[]} />;
}
