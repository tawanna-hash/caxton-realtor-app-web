// app/api/communities/route.ts
//
// Public read-only list endpoint for the Communities directory.
// Mirrors what /communities renders on the web — active rows where home_type
// is 'community' OR null (legacy aggregated rows), shaped for the iOS app's
// native FlatList.
//
// Query params:
//   - pub:    realtyline | newsline | austin | san_antonio | all | both
//   - builder: optional exact builder_name match
//   - limit:  default 100, max 200
//
// Phase 2 of the iOS app uses this instead of WebView-loading /communities.

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  type Publication as DbPublication,
} from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PUB_ALIAS: Record<string, DbPublication | 'all'> = {
  austin: 'realtyline',
  san_antonio: 'newsline',
  realtyline: 'realtyline',
  newsline: 'newsline',
  'realtyline-houston': 'realtyline-houston',
  'realtyline-dallas': 'realtyline-dallas',
  all: 'all',
  both: 'both',
};

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('pub') ?? 'realtyline').toLowerCase();
  const pub = PUB_ALIAS[raw];
  if (!pub) {
    return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
  }

  const builder = req.nextUrl.searchParams.get('builder') ?? undefined;
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 200);

  try {
    const rows = await listBuilderInventory({
      publication: pub,
      status: 'active',
      homeType: 'isNullOrCommunity',
      builderName: builder,
      limit,
    });

    // Shape: a leaner row (drop submitter PII and admin fields).
    const communities = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      featured: r.featured,
      publication: r.publication,
      builderName: r.builderName,
      title: r.title,
      city: r.city,
      state: r.state,
      description: r.description,
      bedsMin: r.bedsMin,
      bedsMax: r.bedsMax,
      bathsMin: r.bathsMin,
      bathsMax: r.bathsMax,
      sqftMin: r.sqftMin,
      sqftMax: r.sqftMax,
      priceMin: r.priceMin,
      priceMax: r.priceMax,
      sourceUrl: r.sourceUrl,
      thumbnailUrl: r.thumbnailUrl,
      flyerPdfUrl: r.flyerPdfUrl,
      tags: r.tags,
      communityName: r.communityName,
      homeType: r.homeType,
      galleryUrls: r.galleryUrls,
    }));

    return NextResponse.json({ communities });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[api/communities] query failed:', message);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
