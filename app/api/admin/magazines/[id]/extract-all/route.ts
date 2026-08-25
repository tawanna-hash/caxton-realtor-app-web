// app/api/admin/magazines/[id]/extract-all/route.ts
//
// Streaming NDJSON endpoint that extracts hotspots page-by-page.
//
// Passes (all four run once, up front — they naturally produce results tagged
// by page_idx already, so filtering afterwards is cheap):
//   1. PDF link annotations (embedded <a href>)
//   2. Text-layer scan (emails, phone numbers, plain-text URLs, bare domains)
//   3. QR-code decode from pre-rendered page images
//   4. Logo perceptual-hash match against advertisers
//
// Then a page loop commits each page's rows through insertExtracted with
// wipeImportsForPages: [i], so a mid-stream failure leaves earlier pages
// already persisted. Each committed page emits an NDJSON progress event; the
// final event carries the full updated hotspot list.
//
// Response is `application/x-ndjson`, one JSON object per line:
//   { "type": "start", "page_count": 20 }
//   { "type": "page", "page_idx": 0, "inserted": 4, ... }
//   ...
//   { "type": "done", "diagnostics": {...}, "hotspots": [...] }
// or on failure mid-stream:
//   { "type": "error", "message": "...", "at_page": 12 }
//
// Client reads via fetch().body.getReader() + newline split (see the admin UI).

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
  insertExtracted,
  type AdvertiserLite,
  type ExtractedHotspot,
} from '@/lib/server/hotspot-extractors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// v3 logo pass fires 1 Gemini vision call per magazine page (20 for a
// typical issue). At concurrency=8 with a 25s per-page timeout that fits
// comfortably in 300s.
export const maxDuration = 300;

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

  await ensureSchema();
  const sql = getSql();

  // 1. Load magazine essentials before opening the stream, so we can still
  //    return a normal JSON error if the magazine is missing or malformed.
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
  if (pageCount < 1) {
    return NextResponse.json({ error: 'magazine has no pages' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      // Track the last page we started so we can report where a crash landed.
      let atPage = -1;

      try {
        send({ type: 'start', page_count: pageCount });

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

        // 4. Load advertisers for URL auto-matching AND logo perceptual-hash
        //    matching. avatar_url and website are needed by extractLogoMatches:
        //    an advertiser without one of them is invisible to the logo pass.
        const advertisers = (await sql`
          SELECT id, name, slug, avatar_url, website FROM advertisers
        `) as unknown as AdvertiserLite[];

        // 5. Run the logo pass. This does its own PDF walk (operator-list) and
        //    fetches page images for cropping. Non-fatal on any error.
        const logoHits = await extractLogoMatches(pdfBuffer, pageUrls, advertisers).catch((err) => {
          console.error('[extract-all] logo pass threw:', errMessage(err));
          return [] as ExtractedHotspot[];
        });

        // Bucket every hit by page_idx so the per-page commit loop is O(N).
        const byPage = new Map<number, ExtractedHotspot[]>();
        const bucket = (rows: ExtractedHotspot[]) => {
          for (const r of rows) {
            if (r.page_idx < 0 || r.page_idx >= pageCount) continue;
            const list = byPage.get(r.page_idx);
            if (list) list.push(r);
            else byPage.set(r.page_idx, [r]);
          }
        };
        // Insertion order across passes matches the old combined array so
        // within-batch dedupe picks the same "winner" per identity as before:
        // link > text > qr > logo.
        bucket(linkHits);
        bucket(textHits);
        bucket(qrHits);
        bucket(logoHits);

        // 6. Per-page commit loop.
        const totals = {
          inserted: 0,
          skipped_duplicates: 0,
          auto_linked_advertisers: 0,
          by_origin: { pdf_link: 0, text_scan: 0, qr_code: 0, logo_match: 0 },
        };

        for (let i = 0; i < pageCount; i++) {
          atPage = i;
          const rows = byPage.get(i) ?? [];
          const result = await insertExtracted(sql, rows, {
            magazineId: idNum,
            adminEmail,
            advertisers,
            pageCount,
            wipeImports: false,
            wipeImportsForPages: [i],
          });
          totals.inserted += result.inserted;
          totals.skipped_duplicates += result.skipped_duplicates;
          totals.auto_linked_advertisers += result.auto_linked_advertisers;
          totals.by_origin.pdf_link += result.by_origin.pdf_link;
          totals.by_origin.text_scan += result.by_origin.text_scan;
          totals.by_origin.qr_code += result.by_origin.qr_code;
          totals.by_origin.logo_match += result.by_origin.logo_match;

          send({
            type: 'page',
            page_idx: i,
            found: rows.length,
            inserted: result.inserted,
            skipped_duplicates: result.skipped_duplicates,
            auto_linked_advertisers: result.auto_linked_advertisers,
            by_origin: result.by_origin,
          });
        }

        console.log(
          `[extract-all] mag=${idNum} link=${linkHits.length} text=${textHits.length} ` +
          `qr=${qrHits.length} logo=${logoHits.length} inserted=${totals.inserted} ` +
          `skipped=${totals.skipped_duplicates} auto_linked=${totals.auto_linked_advertisers}`,
        );

        // 7. Final snapshot + diagnostics.
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

        send({
          type: 'done',
          hotspots: all,
          diagnostics: {
            findings: {
              pdf_links: linkHits.length,
              text_scan: textHits.length,
              qr_codes: qrHits.length,
              logo_matches: logoHits.length,
            },
            inserted: totals.inserted,
            skipped_duplicates: totals.skipped_duplicates,
            auto_linked_advertisers: totals.auto_linked_advertisers,
            by_origin: totals.by_origin,
          },
        });
      } catch (err) {
        console.error('[extract-all] failed:', errMessage(err));
        send({ type: 'error', message: errMessage(err), at_page: atPage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Discourage buffering by any intermediary.
      'X-Accel-Buffering': 'no',
    },
  });
});
