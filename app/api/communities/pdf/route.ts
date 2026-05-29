// app/api/communities/pdf/route.ts
//
// Returns a downloadable PDF listing all active builder/developer
// communities (home_type='community'), grouped by builder.

import { NextResponse } from 'next/server';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { generateCommunitiesPdf } from '@/lib/pdf/builder-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await listBuilderInventory({
    status: 'active',
    limit: 1000,
  });

  const bytes = await generateCommunitiesPdf({ rows });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="new-home-communities.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
