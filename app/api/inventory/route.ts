// app/api/inventory/route.ts
//
// Public read-only list endpoint for builder inventory (per-home listings
// and promotions). Returns rows with home_type IN ('plan', 'showcase',
// 'listing') by default; pass kind=promotion to switch to promotional rows.
//
// Used by the iOS app's native Inventory + Promotions screens (Phase 2).
//
// Query params:
//   - pub:       realtyline | newsline | austin | san_antonio | all | both
//   - kind:      listing | promotion  (default: listing)
//   - builder:   optional exact builder_name filter
//   - developer: optional exact developer_name filter
//   - limit:     default 100, max 200

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  type Publication as DbPublication,
  type Kind,
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

  const rawKind = req.nextUrl.searchParams.get('kind') ?? 'listing';
  const kind: Kind = rawKind === 'promotion' ? 'promotion' : 'listing';

  const builder = req.nextUrl.searchParams.get('builder') ?? undefined;
  const developer = req.nextUrl.searchParams.get('developer') ?? undefined;
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1), 200);

  try {
    // For 'listing' we want per-home rows (not 'community' aggregates).
    // listBuilderInventory doesn't have a "not community" filter, so we pull
    // all listing rows and filter client-side. The status filter + limit keep
    // this cheap.
    const rows = await listBuilderInventory({
      publication: pub,
      status: 'active',
      kind,
      builderName: builder,
      developerName: developer,
      limit: kind === 'listing' ? Math.min(limit * 2, 400) : limit,
    });

    const filtered =
      kind === 'listing'
        ? rows.filter((r) => r.homeType !== 'community').slice(0, limit)
        : rows;

    const items = filtered.map((r) => ({
      id: r.id,
      kind: r.kind,
      featured: r.featured,
      publication: r.publication,
      builderName: r.builderName,
      developerName: r.developerName,
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
      promoType: r.promoType,
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      sourceUrl: r.sourceUrl,
      thumbnailUrl: r.thumbnailUrl,
      flyerPdfUrl: r.flyerPdfUrl,
      tags: r.tags,
      address: r.address,
      readyDate: r.readyDate,
      planName: r.planName,
      communityName: r.communityName,
      homeType: r.homeType,
      galleryUrls: r.galleryUrls,
      extraDetails: r.extraDetails,
    }));

    return NextResponse.json({ items, kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[api/inventory] query failed:', message);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
