// app/api/inventory/pdf/route.ts
//
// Returns a downloadable PDF of all active move-in ready inventory
// and promotions across every builder/developer.

import { NextResponse } from 'next/server';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { generateInventoryPdf } from '@/lib/pdf/builder-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await listBuilderInventory({
    status: 'active',
    limit: 1000,
  });

  const bytes = await generateInventoryPdf({ rows });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="inventory-and-promotions.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
