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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guessContentType(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'svg':  return 'image/svg+xml';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif':  return 'image/gif';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    default:     return 'application/octet-stream';
  }
}

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

  const blobUrl = row.blob_url;
  const headers = new Headers();
  // Cache aggressively at the edge; creatives are immutable per id.
  headers.set('cache-control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');

  // Relative paths point at files under public/ (house/fallback creatives).
  // Server-side fetch() can't resolve relative URLs, so read from disk.
  if (blobUrl.startsWith('/')) {
    try {
      const safeRel = blobUrl.replace(/\.\.+/g, '').replace(/^\/+/, '');
      const filePath = path.join(process.cwd(), 'public', safeRel);
      const bytes = await readFile(filePath);
      headers.set('content-type', guessContentType(blobUrl));
      headers.set('content-length', String(bytes.length));
      return new NextResponse(bytes, { status: 200, headers });
    } catch (err) {
      console.warn('[c/[id]] local creative read failed', { blobUrl, err: String(err) });
      return new NextResponse('not found', { status: 404 });
    }
  }

  // Absolute URL — stream from upstream (e.g. Vercel Blob storage).
  let upstream: Response;
  try {
    upstream = await fetch(blobUrl, { cache: 'no-store' });
  } catch (err) {
    console.warn('[c/[id]] upstream fetch threw', { blobUrl, err: String(err) });
    return new NextResponse('upstream error', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('upstream error', { status: 502 });
  }
  const ct = upstream.headers.get('content-type') ?? guessContentType(blobUrl);
  headers.set('content-type', ct);
  const len = upstream.headers.get('content-length');
  if (len) headers.set('content-length', len);

  return new NextResponse(upstream.body, { status: 200, headers });
}
