// app/api/builders/route.ts
//
// Public read-only list endpoint for the Builders directory.
// Returns each builder's distinct name + counts (communities, inventory, promotions)
// for a given publication. Used by the iOS app's native Builders screen
// (Phase 2 — replaces the WebView hub).
//
// Pub aliasing: accepts both the web app's slugs (realtyline / newsline) and
// the iOS internal codes (austin / san_antonio). Maps to the DB publication
// values used by builder_inventory.

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  type Publication as DbPublication,
} from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PUB_ALIAS: Record<string, DbPublication | 'all'> = {
  // iOS internal codes
  austin: 'realtyline',
  san_antonio: 'newsline',
  // Web slugs
  realtyline: 'realtyline',
  newsline: 'newsline',
  'realtyline-houston': 'realtyline-houston',
  'realtyline-dallas': 'realtyline-dallas',
  // Special
  all: 'all',
  both: 'both',
};

type BuilderSummary = {
  name: string;
  slug: string;
  communitiesCount: number;
  inventoryCount: number;
  promotionsCount: number;
  totalCount: number;
  thumbnailUrl: string | null;
  cities: string[];
};

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('pub') ?? 'realtyline').toLowerCase();
  const pub = PUB_ALIAS[raw];
  if (!pub) {
    return NextResponse.json({ error: 'invalid publication' }, { status: 400 });
  }

  try {
    // One query, sliced in-memory. Active rows only; reasonable cap.
    const rows = await listBuilderInventory({
      publication: pub,
      status: 'active',
      limit: 500,
    });

    // Aggregate by builder_name.
    const byBuilder = new Map<string, BuilderSummary>();
    for (const r of rows) {
      const key = r.builderName.trim();
      if (!key || key.toLowerCase() === 'test') continue;
      let s = byBuilder.get(key);
      if (!s) {
        s = {
          name: key,
          slug: builderNameToSlug(key),
          communitiesCount: 0,
          inventoryCount: 0,
          promotionsCount: 0,
          totalCount: 0,
          thumbnailUrl: null,
          cities: [],
        };
        byBuilder.set(key, s);
      }
      s.totalCount += 1;
      if (r.kind === 'promotion') s.promotionsCount += 1;
      else if (r.homeType === 'community') s.communitiesCount += 1;
      else s.inventoryCount += 1;

      // Capture first non-null thumbnail (featured rows sort first, so this is
      // already the best candidate from the listBuilderInventory ordering).
      if (!s.thumbnailUrl && r.thumbnailUrl) {
        s.thumbnailUrl = r.thumbnailUrl;
      }
      if (r.city && !s.cities.includes(r.city)) {
        s.cities.push(r.city);
      }
    }

    const builders = Array.from(byBuilder.values()).sort((a, b) => {
      // Builders with more rows first, then alpha.
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ builders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[api/builders] query failed:', message);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
