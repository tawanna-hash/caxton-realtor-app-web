// app/api/builders/route.ts
//
// Public read-only list endpoint for the Builders directory.
// Returns each builder's distinct name + counts (communities, inventory, promotions)
// for a given publication. Used by the iOS app's native Builders screen
// (Phase 2 — replaces the WebView hub).
//
// Query params:
//   - pub:         realtyline | newsline | austin | san_antonio | all | both
//   - developers:  true = only developers, false = only builders, omitted = both
//
// Each builder summary includes isDeveloper (true for master-planned
// communities like Santa Rita Ranch / La Cima that aggregate many builders).

import { NextRequest, NextResponse } from 'next/server';
import {
  listBuilderInventory,
  type Publication as DbPublication,
} from '@/lib/builder-inventory';
import { summarizeBuilders, type BuilderSummary } from '@/lib/builder-summary';

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

export type { BuilderSummary };

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
      limit: 5000,
    });

    let builders = summarizeBuilders(rows);

    // Filter by developer/builder if requested.
    const devParam = req.nextUrl.searchParams.get('developers');
    if (devParam === 'true') {
      builders = builders.filter((b) => b.isDeveloper);
    } else if (devParam === 'false') {
      builders = builders.filter((b) => !b.isDeveloper);
    }

    return NextResponse.json({ builders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[api/builders] query failed:', message);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
