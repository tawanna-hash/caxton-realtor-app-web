// app/api/admin/magazines/[id]/gif/route.ts
//
// Generate (or return the cached URL of) an animated GIF preview for a
// magazine. Three variants are supported via the `?variant=` query
// param: 'full', 'teaser', 'pingpong'.
//
//  - On first request for a variant, we render the GIF from the magazine's
//    page images, upload it to Vercel Blob, persist the resulting URL,
//    and return it.
//  - On subsequent requests, we just return the cached URL.
//  - `?force=1` re-renders even if a cached URL exists (useful when the
//    page images have been re-uploaded).
//
// Auth: admin only.
// Runtime: Node (sharp + gifenc need it). Long-running so we extend the
// maxDuration to the Vercel Hobby/Pro cap.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { buildMagazineGif, type GifVariant } from '@/lib/magazine-gif';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// GIF rendering can take 10-40s for a 20-page issue. Vercel caps at 60s
// on Pro plans, 10s on Hobby — bump to the max our plan allows.
export const maxDuration = 60;

const VARIANTS: GifVariant[] = ['full', 'teaser', 'pingpong'];

const COLUMN_BY_VARIANT: Record<GifVariant, 'gif_full_url' | 'gif_teaser_url' | 'gif_pingpong_url'> = {
  full: 'gif_full_url',
  teaser: 'gif_teaser_url',
  pingpong: 'gif_pingpong_url',
};

type RouteCtx = { params: Promise<{ id: string }> };

type MagazineRow = {
  id: number;
  publication: string | null;
  year: number;
  month: number;
  issue_label: string;
  page_urls: string[] | null;
  gif_full_url: string | null;
  gif_teaser_url: string | null;
  gif_pingpong_url: string | null;
};

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const variantParam = (url.searchParams.get('variant') || '').toLowerCase() as GifVariant;
  if (!VARIANTS.includes(variantParam)) {
    return NextResponse.json(
      { error: 'invalid variant', allowed: VARIANTS },
      { status: 400 },
    );
  }
  const force = url.searchParams.get('force') === '1';

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, publication, year, month, issue_label, page_urls,
             gif_full_url, gif_teaser_url, gif_pingpong_url
        FROM magazines
       WHERE id = ${idNum}
       LIMIT 1
    `) as unknown as MagazineRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'magazine not found' }, { status: 404 });
    }
    const mag = rows[0];

    // Short-circuit: cached URL exists and force not requested.
    const column = COLUMN_BY_VARIANT[variantParam];
    const cached = mag[column];
    if (cached && !force) {
      return NextResponse.json({ url: cached, cached: true, variant: variantParam });
    }

    if (!mag.page_urls || mag.page_urls.length === 0) {
      return NextResponse.json(
        { error: 'magazine has no page images to render' },
        { status: 400 },
      );
    }

    // Generate + upload.
    const slug = `${mag.publication || 'magazine'}-${mag.issue_label || `${mag.year}-${String(mag.month).padStart(2, '0')}`}`;
    const gifUrl = await buildMagazineGif({
      magazineId: mag.id,
      variant: variantParam,
      pageUrls: mag.page_urls,
      slug,
    });

    // Persist the URL on the magazine row. Use parameterized SQL with a
    // hard-coded column name (we picked it from a fixed allow-list above)
    // so we don't open an injection vector.
    if (column === 'gif_full_url') {
      await sql`UPDATE magazines SET gif_full_url     = ${gifUrl} WHERE id = ${idNum}`;
    } else if (column === 'gif_teaser_url') {
      await sql`UPDATE magazines SET gif_teaser_url   = ${gifUrl} WHERE id = ${idNum}`;
    } else {
      await sql`UPDATE magazines SET gif_pingpong_url = ${gifUrl} WHERE id = ${idNum}`;
    }

    return NextResponse.json({ url: gifUrl, cached: false, variant: variantParam });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/magazines/gif POST]', message);
    return NextResponse.json({ error: 'render failed', detail: message }, { status: 500 });
  }
});
