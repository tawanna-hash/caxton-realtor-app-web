// app/api/admin/magazines/[id]/import-pdf-links/route.ts
//
// Extracts every Link annotation from a magazine's PDF and creates a
// hotspot per link, marked source='pdf_import'. Used to retroactively
// import already-embedded links from interactive PDFs, and to re-sync
// when an issue is re-uploaded.
//
// Re-sync logic:
//   - Delete every hotspot WHERE magazine_id = :id AND source = 'pdf_import'
//   - Re-extract from the current PDF
//   - Insert fresh rows as drafts (is_published=false, source='pdf_import')
//   - Manual hotspots (source='manual') are NEVER touched, regardless of position
//
// PDF parsing uses pdfjs-dist's legacy build, which runs without a
// web worker (necessary for Vercel serverless). PDFs up to ~50MB
// process comfortably within the 60-second function timeout.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFNumber, PDFRef } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

// ============================================================
// Auth (mirrors the pattern in other /admin routes)
// ============================================================
async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

async function getAdminEmail(cookieHeader: string | null): Promise<string | null> {
  if (!cookieHeader) return null;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return typeof data?.email === 'string' ? data.email : null;
  } catch { return null; }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

// ============================================================
// PDF extraction using pdf-lib (pure JS, no DOM dependencies)
// ============================================================
interface ExtractedLink {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  url: string;
}

/** Get a number from a PDF dict value, or null. */
function numFromPdfValue(v: unknown): number | null {
  if (v instanceof PDFNumber) return v.asNumber();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** Get a string from a PDF dict value, or null. */
function stringFromPdfValue(v: unknown): string | null {
  if (v instanceof PDFString) return v.decodeText();
  if (typeof v === 'string') return v;
  return null;
}

async function extractLinksFromPdf(pdfBuffer: ArrayBuffer): Promise<ExtractedLink[]> {
  // updateMetadata: false avoids modifying the doc, faster load.
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  const links: ExtractedLink[] = [];
  const pages = pdfDoc.getPages();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageNode = page.node;

    // Get the Annots array. May be a direct array or a ref to one.
    let annotsArr: PDFArray | undefined;
    const annotsRaw = pageNode.lookup(PDFName.of('Annots'));
    if (annotsRaw instanceof PDFArray) {
      annotsArr = annotsRaw;
    }
    if (!annotsArr) continue;

    for (let i = 0; i < annotsArr.size(); i++) {
      const annotEntry = annotsArr.get(i);
      // Annotations may be direct dicts or references to dicts.
      let annotDict: PDFDict | undefined;
      if (annotEntry instanceof PDFDict) {
        annotDict = annotEntry;
      } else if (annotEntry instanceof PDFRef) {
        const resolved = pdfDoc.context.lookup(annotEntry);
        if (resolved instanceof PDFDict) annotDict = resolved;
      }
      if (!annotDict) continue;

      // Must be subtype Link.
      const subtype = annotDict.lookup(PDFName.of('Subtype'));
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Link') continue;

      // Extract URL from /A /URI or /A /D (we only care about URI links).
      const action = annotDict.lookup(PDFName.of('A'));
      if (!(action instanceof PDFDict)) continue;
      const actionType = action.lookup(PDFName.of('S'));
      if (!(actionType instanceof PDFName) || actionType.asString() !== '/URI') continue;
      const uriValue = action.lookup(PDFName.of('URI'));
      const url = stringFromPdfValue(uriValue);
      if (!url || !url.trim()) continue;

      // Extract /Rect [x1 y1 x2 y2].
      const rectVal = annotDict.lookup(PDFName.of('Rect'));
      if (!(rectVal instanceof PDFArray) || rectVal.size() !== 4) continue;
      const r1 = numFromPdfValue(rectVal.get(0));
      const r2 = numFromPdfValue(rectVal.get(1));
      const r3 = numFromPdfValue(rectVal.get(2));
      const r4 = numFromPdfValue(rectVal.get(3));
      if (r1 === null || r2 === null || r3 === null || r4 === null) continue;

      const left = Math.min(r1, r3);
      const right = Math.max(r1, r3);
      const bottom = Math.min(r2, r4);
      const top = Math.max(r2, r4);
      const w = right - left;
      const h = top - bottom;
      if (w < 1 || h < 1) continue;

      // PDF coordinate space has origin at bottom-left. Flip to top-left.
      let x_frac = left / pageWidth;
      let y_frac = (pageHeight - top) / pageHeight;
      let w_frac = w / pageWidth;
      let h_frac = h / pageHeight;

      x_frac = Math.max(0, Math.min(1, x_frac));
      y_frac = Math.max(0, Math.min(1, y_frac));
      w_frac = Math.max(0.001, Math.min(1 - x_frac, w_frac));
      h_frac = Math.max(0.001, Math.min(1 - y_frac, h_frac));

      links.push({
        page_idx: pageIdx,
        x_frac, y_frac, w_frac, h_frac,
        url: url.trim(),
      });
    }
  }

  return links;
}

// ============================================================
// Route handler
// ============================================================
type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const cookieHeader = req.headers.get('cookie');
  if (!(await isAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminEmail = await getAdminEmail(cookieHeader);

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // 1. Load the magazine to get its reader_url.
    const mags = await sql`
      SELECT id, reader_url, page_count
      FROM magazines WHERE id = ${idNum}
    `;
    if (mags.length === 0) {
      return NextResponse.json({ error: 'magazine not found' }, { status: 404 });
    }
    const readerUrl = String(mags[0].reader_url || '');
    if (!readerUrl || !/^https?:\/\//.test(readerUrl)) {
      return NextResponse.json({ error: 'magazine has no PDF reader_url' }, { status: 400 });
    }

    // 2. Download the PDF.
    const pdfRes = await fetch(readerUrl, { cache: 'no-store' });
    if (!pdfRes.ok) {
      return NextResponse.json(
        { error: `failed to download PDF: ${pdfRes.status}` },
        { status: 502 },
      );
    }
    const pdfBuffer = await pdfRes.arrayBuffer();

    // 3. Extract links.
    let links: ExtractedLink[];
    try {
      links = await extractLinksFromPdf(pdfBuffer);
    } catch (err) {
      console.error('[admin/import-pdf-links] extraction failed:', errMessage(err));
      return NextResponse.json(
        { error: 'PDF parsing failed', detail: errMessage(err) },
        { status: 422 },
      );
    }

    // 4. Replace existing pdf_import rows (manual rows preserved).
    await sql`
      DELETE FROM magazine_hotspots
      WHERE magazine_id = ${idNum} AND source = 'pdf_import'
    `;

    // 5. Insert new rows as drafts.
    let inserted = 0;
    for (const link of links) {
      // Guard against off-by-one if PDF has more pages than the
      // magazine record claims (shouldn't happen, but cheap to check).
      const pageCount = Number(mags[0].page_count) || 0;
      if (pageCount > 0 && link.page_idx >= pageCount) continue;

      const configJson = JSON.stringify({ type: 'link', url: link.url, open_in: 'new_tab' });
      await sql`
        INSERT INTO magazine_hotspots (
          magazine_id, page_idx,
          x_frac, y_frac, w_frac, h_frac,
          type, config, label, advertiser_name,
          is_published, source, created_by, updated_by
        ) VALUES (
          ${idNum}, ${link.page_idx},
          ${link.x_frac}, ${link.y_frac}, ${link.w_frac}, ${link.h_frac},
          'link', ${configJson}::jsonb,
          null, null,
          false, 'pdf_import', ${adminEmail}, ${adminEmail}
        )
      `;
      inserted++;
    }

    // 6. Return the full updated hotspot list.
    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name,
             is_published, source, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, id
    `) as unknown as Hotspot[];

    return NextResponse.json({
      hotspots: all,
      imported_count: inserted,
      total_links_in_pdf: links.length,
    });
  } catch (err) {
    console.error('[admin/import-pdf-links] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'import failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
