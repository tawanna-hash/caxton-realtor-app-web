// app/api/admin/magazines/[id]/extract-all/route.ts
//
// The single entry point for auto-populating hotspots from a magazine PDF.
// Replaces the two separate endpoints from v1 (/import-pdf-links and
// /scan-page-text) with one call that runs all three extraction passes in
// parallel and inserts everything through the shared dedupe path.
//
// Passes:
//   1. PDF link annotations (embedded <a href>)
//   2. Text-layer scan (emails, phone numbers, plain-text URLs, bare domains)
//   3. QR-code decode from pre-rendered page images
//
// Idempotent: existing source='pdf_import' rows are wiped and re-inserted.
// Manual hotspots are never touched.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  extractPdfLinkAnnotations,
  extractPdfTextContacts,
  extractQrCodes,
  insertExtracted,
  type AdvertiserLite,
  type ExtractedHotspot,
} from '@/lib/server/hotspot-extractors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function isAdmin(): Promise<boolean> {
  try {
    return (await getCurrentAdmin()) !== null;
  } catch { return false; }
}

async function getAdminEmail(): Promise<string | null> {
  try {
    const admin = await getCurrentAdmin();
    return admin?.email ?? null;
  } catch { return null; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(_req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // 1. Load magazine essentials.
    const mags = await sql`
      SELECT id, reader_url, page_urls, page_count
      FROM magazines WHERE id = ${idNum}
    `;
    if (mags.length === 0) {
      return NextResponse.json({ error: 'magazine not found' }, { status: 404 });
    }
    const mag = mags[0];
    const readerUrl = String(mag.reader_url || '');
    const pageUrls = Array.isArray(mag.page_urls) ? (mag.page_urls as string[]) : [];
    const pageCount = Number(mag.page_count) || 0;

    if (!readerUrl || !/^https?:\/\//.test(readerUrl)) {
      return NextResponse.json({ error: 'magazine has no PDF reader_url' }, { status: 400 });
    }

    // 2. Fetch PDF + kick off QR scan in parallel.
    const pdfPromise = fetch(readerUrl, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error(`failed to download PDF: ${res.status}`);
      return res.arrayBuffer();
    });
    const qrPromise = pageUrls.length > 0
      ? extractQrCodes(pageUrls).catch((err) => {
          console.error('[extract-all] QR pass threw:', errMessage(err));
          return [] as ExtractedHotspot[];
        })
      : Promise.resolve([] as ExtractedHotspot[]);

    const [pdfBuffer, qrHits] = await Promise.all([pdfPromise, qrPromise]);

    // 3. Run PDF passes in parallel (both consume the same buffer).
    const [linkHits, textHits] = await Promise.all([
      extractPdfLinkAnnotations(pdfBuffer).catch((err) => {
        console.error('[extract-all] link pass threw:', errMessage(err));
        return [] as ExtractedHotspot[];
      }),
      extractPdfTextContacts(pdfBuffer).catch((err) => {
        console.error('[extract-all] text pass threw:', errMessage(err));
        return [] as ExtractedHotspot[];
      }),
    ]);

    // 4. Load advertisers for URL auto-matching.
    const advertisers = (await sql`
      SELECT id, name, slug FROM advertisers
    `) as unknown as AdvertiserLite[];

    // 5. Combined insert with wipe-then-reinsert. Order matters for
    //    dedupe: PDF link annotations are the most authoritative (they
    //    already have real coords) so they go first, then text, then QR.
    //    Within-batch dedupe means subsequent passes won't create a
    //    duplicate for the same identity on the same page.
    const combined: ExtractedHotspot[] = [...linkHits, ...textHits, ...qrHits];
    const result = await insertExtracted(sql, combined, {
      magazineId: idNum,
      adminEmail,
      advertisers,
      pageCount,
      wipeImports: true,
    });

    console.log(
      `[extract-all] mag=${idNum} link=${linkHits.length} text=${textHits.length} ` +
      `qr=${qrHits.length} inserted=${result.inserted} skipped=${result.skipped_duplicates} ` +
      `auto_linked=${result.auto_linked_advertisers}`,
    );

    // 6. Return fresh hotspot list + diagnostics.
    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, advertiser_id,
             is_published, source, z_index, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, z_index, id
    `) as unknown as Hotspot[];

    return NextResponse.json({
      hotspots: all,
      diagnostics: {
        findings: {
          pdf_links: linkHits.length,
          text_scan: textHits.length,
          qr_codes: qrHits.length,
        },
        inserted: result.inserted,
        skipped_duplicates: result.skipped_duplicates,
        auto_linked_advertisers: result.auto_linked_advertisers,
        by_origin: result.by_origin,
      },
    });
  } catch (err) {
    console.error('[extract-all] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'extraction failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
