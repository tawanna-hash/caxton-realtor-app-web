// app/api/magazines/[id]/hotspots/route.ts
//
// Public read-only: returns all published hotspots for a magazine.
// Used by the reader on the consumer app. No auth — published hotspots
// are part of the magazine, same trust level as the PDF itself.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { toPublicHotspot, type Hotspot } from '@/lib/hotspots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Light caching so a busy magazine doesn't slam the DB on every page view.
// Revalidates on the server every 5 minutes; the response body still streams
// fresh per request via SWR semantics on the CDN.
export const revalidate = 300;

type RouteCtx = { params: Promise<{ id: string }> };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name,
             is_published, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
        AND is_published = true
      ORDER BY page_idx, id
    `) as unknown as Hotspot[];
    return NextResponse.json({
      hotspots: rows.map(toPublicHotspot),
    });
  } catch (err: unknown) {
    console.error('[api/magazines/[id]/hotspots] query failed:', errMessage(err));
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
