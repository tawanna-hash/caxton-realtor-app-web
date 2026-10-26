// Compact full row set for the public inventory browser. The page renders the
// first screenful server-side and the browser fetches the rest from here once
// it is interactive. Scoped to the visitor's active publication (cookie).

import { NextResponse } from 'next/server';
import { listBuilderInventoryCached } from '@/lib/builder-inventory';
import { compactRow } from '@/lib/inventory-compact';
import { getServerPub } from '@/lib/publication';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pub = await getServerPub();
  const rows = await listBuilderInventoryCached({
    status: 'active',
    publication: pub,
    limit: 1000,
  });
  return NextResponse.json(
    { rows: rows.map(compactRow) },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}
