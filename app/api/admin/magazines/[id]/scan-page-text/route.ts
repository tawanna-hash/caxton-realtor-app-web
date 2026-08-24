// app/api/admin/magazines/[id]/scan-page-text/route.ts
//
// Complements /import-pdf-links by finding contact info that ISN'T already
// a clickable <a href> link annotation in the PDF:
//
//   1. Text-layer scan (unpdf)   — emails, phone numbers, plain-text URLs
//      that the designer typed as plain text without linkifying.
//   2. QR-code scan (jsqr)       — reads QR codes off the pre-rendered page
//      images. Places each detected QR as a hotspot at its bounding box.
//
// Every insert is source='pdf_import', is_published=false (draft). Dedupes
// against ALL existing hotspots on the same page — manual, prior imports,
// prior scans — by normalized identifier. This is the "auto-populate as
// much data as possible" pass that runs after upload; the editor picker
// still lets a human confirm/publish each hotspot.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  scanPageTextForContacts,
  scanPagesForQrCodes,
  prepareContactRows,
  prepareQrRows,
  insertExtractedHotspots,
  type AdvertiserLite,
} from '@/lib/server/hotspot-extractors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function isAdmin(): Promise<boolean> {
  try {
    return (await getCurrentAdmin()) !== null;
  } catch {
    return false;
  }
}

async function getAdminEmail(): Promise<string | null> {
  try {
    const admin = await getCurrentAdmin();
    return admin?.email ?? null;
  } catch {
    return null;
  }
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

  try {
    await ensureSchema();
    const sql = getSql();

    // 1. Load the magazine to get reader_url + page_urls.
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

    // 2. Kick off text-scan and QR-scan in parallel — they're independent.
    //    Text-scan pulls the PDF; QR-scan pulls the page JPEGs.
    const pdfPromise = fetch(readerUrl, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error(`failed to download PDF: ${res.status}`);
      return res.arrayBuffer();
    });

    const [pdfBuffer, qrs] = await Promise.all([
      pdfPromise,
      pageUrls.length > 0 ? scanPagesForQrCodes(pageUrls) : Promise.resolve([]),
    ]);

    let contacts;
    try {
      contacts = await scanPageTextForContacts(pdfBuffer);
    } catch (err) {
      console.error('[admin/scan-page-text] text scan failed:', errMessage(err));
      return NextResponse.json(
        { error: 'PDF text scan failed', detail: errMessage(err) },
        { status: 422 },
      );
    }

    // 3. Load advertisers for URL/QR auto-matching.
    const advertisers = (await sql`
      SELECT id, name, slug FROM advertisers
    `) as unknown as AdvertiserLite[];

    // 4. Drop findings that reference pages past the magazine's end (defensive).
    const inRange = <T extends { page_idx: number }>(rows: T[]): T[] =>
      pageCount > 0 ? rows.filter((r) => r.page_idx < pageCount) : rows;

    const contactRows = prepareContactRows(inRange(contacts), advertisers);
    const qrRows = prepareQrRows(inRange(qrs), advertisers);

    // 5. Insert everything through the shared dedupe path. wipeExistingImports
    //    is FALSE here — unlike /import-pdf-links this endpoint is additive:
    //    it complements existing pdf_import rows rather than replacing them.
    const { inserted, skipped_duplicates } = await insertExtractedHotspots(
      sql,
      [...contactRows, ...qrRows],
      {
        magazineId: idNum,
        adminEmail,
        wipeExistingImports: false,
      },
    );

    // Count what was auto-linked to an advertiser (link+qr only; emails
    // and phones never auto-link).
    const autoLinked = [...contactRows, ...qrRows].filter((r) => r.advertiser_id !== null).length;

    console.log(
      `[admin/scan-page-text] mag=${idNum} contacts=${contacts.length} qrs=${qrs.length} ` +
      `inserted=${inserted} skipped=${skipped_duplicates} auto_linked=${autoLinked}`,
    );

    // 6. Return the full updated hotspot list so the client can refresh.
    const all = (await sql`
      SELECT id, magazine_id, page_idx,
             x_frac, y_frac, w_frac, h_frac,
             type, config, label, advertiser_name, advertiser_id,
             is_published, source, created_by, created_at, updated_by, updated_at
      FROM magazine_hotspots
      WHERE magazine_id = ${idNum}
      ORDER BY page_idx, z_index, id
    `) as unknown as Hotspot[];

    return NextResponse.json({
      hotspots: all,
      inserted_count: inserted,
      skipped_duplicate_count: skipped_duplicates,
      auto_linked_count: autoLinked,
      text_findings: contacts.length,
      qr_findings: qrs.length,
    });
  } catch (err) {
    console.error('[admin/scan-page-text] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'scan failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
