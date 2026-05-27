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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // up to 60s for big PDFs

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
// PDF extraction
// ============================================================
interface ExtractedLink {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  url: string;
}

async function extractLinksFromPdf(pdfBuffer: ArrayBuffer): Promise<ExtractedLink[]> {
  // Legacy build for Node.js compatibility — runs without a worker.
  // The .mjs file is an ES module; Next.js handles the dynamic import.

  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');

  // Suppress the worker requirement. The legacy build can run inline.
  try {
    (pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } })
      .GlobalWorkerOptions.workerSrc = '';
  } catch {
    /* not fatal if this fails */
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    // Defensive flags for serverless: skip font loading, no system fonts.
    useSystemFonts: false,
    disableFontFace: true,
    // We don't render, so don't need to download standard fonts.
    standardFontDataUrl: undefined,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const links: ExtractedLink[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const annotations = await page.getAnnotations();
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      for (const ann of annotations) {
        // We only care about Link annotations with a URI action.
        if (ann.subtype !== 'Link') continue;
        const url = typeof ann.url === 'string' ? ann.url.trim() : '';
        if (!url) continue;

        // Rect is [x1, y1, x2, y2] in PDF user space; origin is bottom-left.
        if (!Array.isArray(ann.rect) || ann.rect.length !== 4) continue;
        const [r1, r2, r3, r4] = ann.rect.map(Number);
        if ([r1, r2, r3, r4].some((n) => !Number.isFinite(n))) continue;

        const left = Math.min(r1, r3);
        const right = Math.max(r1, r3);
        const bottom = Math.min(r2, r4);
        const top = Math.max(r2, r4);

        const w = right - left;
        const h = top - bottom;
        if (w < 1 || h < 1) continue; // skip tiny / degenerate rects

        // Convert to top-left-origin fractions [0, 1].
        let x_frac = left / pageWidth;
        let y_frac = (pageHeight - top) / pageHeight;
        let w_frac = w / pageWidth;
        let h_frac = h / pageHeight;

        // Clamp defensively so DB CHECK constraints don't fail on stray pixels.
        x_frac = Math.max(0, Math.min(1, x_frac));
        y_frac = Math.max(0, Math.min(1, y_frac));
        w_frac = Math.max(0.001, Math.min(1 - x_frac, w_frac));
        h_frac = Math.max(0.001, Math.min(1 - y_frac, h_frac));

        links.push({
          page_idx: pageNum - 1,
          x_frac, y_frac, w_frac, h_frac,
          url,
        });
      }

      // Release page resources promptly to keep memory low on big PDFs.
      page.cleanup();
    }
  } finally {
    try { await pdf.destroy(); } catch { /* noop */ }
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
