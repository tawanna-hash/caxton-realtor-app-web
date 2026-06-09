/**
 * /c/[id]  GET
 *
 * Neutral proxy for ad creative images. Avoids the `/ads/` substring in
 * blob URLs which trips common ad-blocker filters (uBlock, AdBlock, Brave
 * Shields). The id is the ad_campaigns.id. We resolve to the creative's
 * blob_url and stream the bytes through so the browser sees a same-origin
 * URL with no blocker-matched pattern.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return new NextResponse('not found', { status: 404 });
  }

  const r = await getPool().query<{ blob_url: string }>(
    `SELECT cr.blob_url
       FROM ad_campaigns c
       JOIN ad_creatives cr ON cr.id = c.creative_id
      WHERE c.id = $1
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  if (!row?.blob_url) {
    return new NextResponse('not found', { status: 404 });
  }

  const upstream = await fetch(row.blob_url, { cache: 'no-store' });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('upstream error', { status: 502 });
  }

  const headers = new Headers();
  const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
  headers.set('content-type', ct);
  const len = upstream.headers.get('content-length');
  if (len) headers.set('content-length', len);
  // Cache aggressively at the edge; creatives are immutable per id.
  headers.set('cache-control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');

  return new NextResponse(upstream.body, { status: 200, headers });
}
