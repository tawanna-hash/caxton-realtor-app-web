// app/api/inventory/pdf/route.ts
//
// Returns a downloadable PDF of the active move-in ready inventory and
// promotions for the active market. Honors the same query params the
// InventoryBrowser syncs to the URL (builder, beds, baths, pmin, pmax, city,
// promo) so "Download results" exports exactly what the user sees filtered.
//
// Filter parsing/matching is shared with the client via @/lib/inventory-filters
// so the PDF always mirrors the on-screen results.

import { NextResponse } from 'next/server';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { generateInventoryPdf } from '@/lib/pdf/builder-pdf';
import { getServerPub } from '@/lib/publication';
import { matchesFilter, parseFilters } from '@/lib/inventory-filters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
) {
  const url = new URL(req.url);
  const params: Record<string, string | string[] | undefined> = {};
  url.searchParams.forEach((value, key) => {
    // parseFilters only reads single values; keep the first for each key.
    if (params[key] === undefined) params[key] = value;
  });
  const { filters } = parseFilters(params);

  const pub = await getServerPub();
  const rows = await listBuilderInventory({
    status: 'active',
    publication: pub,
    limit: 1000,
  });

  const filtered = filters
    ? rows.filter((r) => matchesFilter(r, filters))
    : rows;

  const bytes = await generateInventoryPdf({ rows: filtered });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="inventory-and-promotions.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
