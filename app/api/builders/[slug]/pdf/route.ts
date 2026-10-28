// app/api/builders/[slug]/pdf/route.ts
//
// Returns a downloadable PDF summarizing a single builder's communities,
// move-in-ready homes, and promotions.

import { NextResponse } from 'next/server';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { slugToBuilderName } from '@/lib/builder-slug-server';
import { generateBuilderPdf } from '@/lib/pdf/builder-pdf';
import { builderNameToSlug } from '@/lib/builder-slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { slug } = await params;
  const builderName = await slugToBuilderName(slug);
  if (!builderName) {
    return NextResponse.json({ error: 'Builder not found' }, { status: 404 });
  }

  // A developer's rows (e.g. La Cima) carry the real builder in builder_name
  // and the developer in developer_name, so pull both and de-duplicate.
  const [byBuilder, byDeveloper] = await Promise.all([
    listBuilderInventory({ status: 'active', builderName, limit: 500 }),
    listBuilderInventory({ status: 'active', developerName: builderName, limit: 500 }),
  ]);
  const seen = new Set<number>();
  const rows = byDeveloper.concat(byBuilder).filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const bytes = await generateBuilderPdf({
    builderName,
    publication: 'realtyline',
    rows,
  });

  const filename = `${builderNameToSlug(builderName)}-listings.pdf`;
  // pdf-lib returns Uint8Array; wrap in Buffer for NextResponse body.
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
