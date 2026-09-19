// app/api/admin/magazines/[id]/extract-page/route.ts
//
// Extract hotspots for ONE page of a magazine. Reuses the same four
// extraction passes as /extract-all but throws away hits for every other
// page before inserting.
//
// Trade-off: this still fetches the full PDF and runs the link/text passes
// across every page (they parse the whole document in one shot), then
// filters. The QR pass and the Gemini logo pass are the only ones with
// obvious per-page cost, and we scope both to the target page's URL to
// keep the call cheap when the user just wants to re-extract page 4.
//
// Wipe is scoped to just this page (source='pdf_import' AND page_idx = N)
// so re-runs on one page never touch rows on other pages, and edited-
// imports on this page also survive because their source is 'manual'.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  extractPdfLinkAnnotations,
  extractPdfTextContacts,
  extractQrCodes,
  extractLogoMatches,
  buildMastheadHotspots,
  insertExtracted,
  type AdvertiserLite,
  type ExtractedHotspot,
} from '@/lib/server/hotspot-extractors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One page's worth of work: at most one Gemini vision call + one PDF parse.
// 120s is plenty and cheaper to allocate than the all-pages 300s ceiling.
export const maxDuration = 120;

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

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail();

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: { page_idx?: number };
  try { body = await req.json(); } catch { body = {}; }
  const pageIdx = Number(body.page_idx);
  if (!Number.isInteger(pageIdx) || pageIdx < 0) {
    return NextResponse.json({ error: 'invalid page_idx' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const mags = await sql`
      SELECT id, reader_url, page_urls, page_count, publication
      FROM magazines WHERE id = ${idNum}
    `;
    if (mags.length === 0) {
      return NextResponse.json({ error: 'magazine not found' }, { status: 404 });
    }
    const mag = mags[0];
    const readerUrl = String(mag.reader_url || '');
    const pageUrls = Array.isArray(mag.page_urls) ? (mag.page_urls as string[]) : [];
    const pageCount = Number(mag.page_count) || 0;
    const publication = String(mag.publication || '').toLowerCase();

    if (!readerUrl || !/^https?:\/\//.test(readerUrl)) {
      return NextResponse.json({ error: 'magazine has no PDF reader_url' }, { status: 400 });
    }
    if (pageIdx >= pageCount) {
      return NextResponse.json({ error: 'page_idx out of range' }, { status: 400 });
    }

    // Scope the per-page passes (QR + logo) to just the target page's URL.
    // Both extractors key page_idx off the array index, so we build a
    // sparse array where only the target index is populated. Empty-string
    // slots are skipped internally, keeping the output page_idx correct
    // without any post-hoc remapping.
    const pageUrl = pageUrls[pageIdx];
    const sparsePageUrls: string[] = new Array(pageCount).fill('');
    if (pageUrl) sparsePageUrls[pageIdx] = pageUrl;

    // Fetch PDF + QR scan in parallel.
    const pdfPromise = fetch(readerUrl, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error(`failed to download PDF: ${res.status}`);
      return res.arrayBuffer();
    });
    const qrPromise = pageUrl
      ? extractQrCodes(sparsePageUrls).catch((err) => {
          console.error('[extract-page] QR pass threw:', errMessage(err));
          return [] as ExtractedHotspot[];
        })
      : Promise.resolve([] as ExtractedHotspot[]);

    const [pdfBuffer, qrHits] = await Promise.all([pdfPromise, qrPromise]);

    const [linkHits, textHits] = await Promise.all([
      extractPdfLinkAnnotations(pdfBuffer).catch((err) => {
        console.error('[extract-page] link pass threw:', errMessage(err));
        return [] as ExtractedHotspot[];
      }),
      extractPdfTextContacts(pdfBuffer).catch((err) => {
        console.error('[extract-page] text pass threw:', errMessage(err));
        return [] as ExtractedHotspot[];
      }),
    ]);

    const advertisers = (await sql`
      SELECT id, name, slug, avatar_url, website FROM advertisers
    `) as unknown as AdvertiserLite[];

    // Logo pass on just this page. Reuses the same sparse array as QR.
    const logoHits = await extractLogoMatches(pdfBuffer, sparsePageUrls, advertisers).catch((err) => {
      console.error('[extract-page] logo pass threw:', errMessage(err));
      return [] as ExtractedHotspot[];
    });

    // Filter every pass to just this page. Insertion order (link > text >
    // qr > logo > masthead) matches extract-all so within-batch dedupe
    // picks the same winner.
    const mastheadHits = pageIdx === 0 ? buildMastheadHotspots(publication) : [];
    const combined: ExtractedHotspot[] = [
      ...linkHits.filter((r) => r.page_idx === pageIdx),
      ...textHits.filter((r) => r.page_idx === pageIdx),
      ...qrHits.filter((r) => r.page_idx === pageIdx),
      ...logoHits.filter((r) => r.page_idx === pageIdx),
      ...mastheadHits,
    ];

    const result = await insertExtracted(sql, combined, {
      magazineId: idNum,
      adminEmail,
      advertisers,
      pageCount,
      wipeImports: false,
      wipeImportsForPages: [pageIdx],
    });

    console.log(
      `[extract-page] mag=${idNum} page=${pageIdx} combined=${combined.length} ` +
      `inserted=${result.inserted} skipped=${result.skipped_duplicates} ` +
      `auto_linked=${result.auto_linked_advertisers}`,
    );

    // Return the full updated hotspot list — the admin UI already knows
    // how to swap its entire hotspots array with a fresh one, and this
    // keeps ordering + z_index consistent with what other endpoints return.
    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, advertiser_id,
             is_published, source, was_imported, z_index,
             created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, z_index, id
    `) as unknown as Hotspot[];

    return NextResponse.json({
      hotspots: all,
      diagnostics: {
        page_idx: pageIdx,
        findings: {
          pdf_links: linkHits.filter((r) => r.page_idx === pageIdx).length,
          text_scan: textHits.filter((r) => r.page_idx === pageIdx).length,
          qr_codes: qrHits.filter((r) => r.page_idx === pageIdx).length,
          logo_matches: logoHits.filter((r) => r.page_idx === pageIdx).length,
          masthead: mastheadHits.length,
        },
        inserted: result.inserted,
        skipped_duplicates: result.skipped_duplicates,
        auto_linked_advertisers: result.auto_linked_advertisers,
        by_origin: result.by_origin,
      },
    });
  } catch (err) {
    console.error('[extract-page] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'extraction failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
