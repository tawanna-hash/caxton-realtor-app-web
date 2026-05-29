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

  const rows = await listBuilderInventory({
    status: 'active',
    builderName,
    limit: 500,
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
