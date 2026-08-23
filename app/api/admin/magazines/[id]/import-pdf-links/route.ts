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
// Phase 6d-import: each imported link is auto-matched against EXISTING
// advertisers by domain. A match sets advertiser_id + advertiser_name so the
// hotspot is tracked from the moment it's imported — no manual picker step,
// no duplicate advertisers. Links with no matching advertiser stay unlinked
// drafts (assign via the editor picker if worth tracking). Own-domains, social,
// and mailto links never match. We never CREATE advertisers here — only link
// to ones already curated in /admin/advertisers.
//
// PDF parsing uses pdf-lib (pure JS, no DOM dependencies). PDFs up to ~50MB
// process comfortably within the 60-second function timeout.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import type { Hotspot } from '@/lib/hotspots';
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFNumber, PDFRef } from 'pdf-lib';
import { isShortenerUrl, resolveUrl } from '@/lib/url-resolver';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================
// Auth (mirrors the pattern in other /admin routes)
// ============================================================
async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
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

// ============================================================
// Phase 6d-import: advertiser auto-matching by domain.
// ============================================================

// Own-domains, social, link aggregators — never an advertiser.
const ADVERTISER_MATCH_SKIPLIST = [
  'realtyline', 'myrealtyline', 'realtynewsnow',
  'facebook', 'instagram', 'linkedin', 'youtube', 'twitter',
  'tiktok', 'pinterest', 'bit', 'tinyurl', 'goo', 'ow',
];

function coreAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Extract the registrable label from a URL host: strip protocol, www., path,
// then take the label before the final TLD. e.g. https://www.stewart.com/en -> "stewart"
function domainCoreFromUrl(url: string): string | null {
  if (!url || url.startsWith('mailto:') || url.startsWith('tel:')) return null;
  let host = url.toLowerCase().replace(/^https?:\/\//, '');
  host = host.split('/')[0].split('?')[0].split('#')[0];
  host = host.replace(/^www\./, '');
  if (!host) return null;
  const parts = host.split('.');
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return coreAlnum(label);
}

interface AdvertiserLite { id: number; name: string; slug: string }

// Match a URL to an existing advertiser. Rules:
//   - skip own/social domains
//   - domain-core must be >= 5 chars
//   - advertiser slug-core (>=5) is contained in domain-core OR vice versa,
//     OR they share a >=6-char common prefix (catches stewart.com vs
//     stewart-title-austin). First match wins.
function matchAdvertiser(url: string, advertisers: AdvertiserLite[]): AdvertiserLite | null {
  const dc = domainCoreFromUrl(url);
  if (!dc || dc.length < 5) return null;
  if (ADVERTISER_MATCH_SKIPLIST.includes(dc)) return null;

  for (const adv of advertisers) {
    const sc = coreAlnum(adv.slug.replace(/-/g, ''));
    if (sc.length < 5) continue;
    if (sc.includes(dc) || dc.includes(sc)) return adv;
    // shared-prefix fallback
    let plen = 0;
    const max = Math.min(sc.length, dc.length);
    for (let i = 0; i < max; i++) {
      if (sc[i] === dc[i]) plen++; else break;
    }
    if (plen >= 6) return adv;
  }
  return null;
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

function numFromPdfValue(v: unknown): number | null {
  if (v instanceof PDFNumber) return v.asNumber();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function stringFromPdfValue(v: unknown): string | null {
  if (v instanceof PDFString) return v.decodeText();
  if (typeof v === 'string') return v;
  return null;
}

async function extractLinksFromPdf(pdfBuffer: ArrayBuffer): Promise<ExtractedLink[]> {
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

    let annotsArr: PDFArray | undefined;
    const annotsRaw = pageNode.lookup(PDFName.of('Annots'));
    if (annotsRaw instanceof PDFArray) {
      annotsArr = annotsRaw;
    }
    if (!annotsArr) continue;

    for (let i = 0; i < annotsArr.size(); i++) {
      const annotEntry = annotsArr.get(i);
      let annotDict: PDFDict | undefined;
      if (annotEntry instanceof PDFDict) {
        annotDict = annotEntry;
      } else if (annotEntry instanceof PDFRef) {
        const resolved = pdfDoc.context.lookup(annotEntry);
        if (resolved instanceof PDFDict) annotDict = resolved;
      }
      if (!annotDict) continue;

      const subtype = annotDict.lookup(PDFName.of('Subtype'));
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Link') continue;

      const action = annotDict.lookup(PDFName.of('A'));
      if (!(action instanceof PDFDict)) continue;
      const actionType = action.lookup(PDFName.of('S'));
      if (!(actionType instanceof PDFName) || actionType.asString() !== '/URI') continue;
      const uriValue = action.lookup(PDFName.of('URI'));
      const url = stringFromPdfValue(uriValue);
      if (!url || !url.trim()) continue;

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

    // 3b. Load existing advertisers for auto-matching (Phase 6d-import).
    //     We only ever LINK to advertisers that already exist — never create.
    const advertisers = (await sql`
      SELECT id, name, slug FROM advertisers
    `) as unknown as AdvertiserLite[];

    // 4. Replace existing pdf_import rows (manual rows preserved).
    await sql`
      DELETE FROM magazine_hotspots
      WHERE magazine_id = ${idNum} AND source = 'pdf_import'
    `;

    // 5a. Pre-resolve known shortener URLs in parallel.
    let resolvedCount = 0;
    const resolved = await Promise.all(links.map(async (link) => {
      if (!isShortenerUrl(link.url)) {
        return { ...link, final_url: link.url, tracking_url: null as string | null };
      }
      try {
        const r = await resolveUrl(link.url, { maxHops: 8, timeoutMs: 5000 });
        resolvedCount++;
        return { ...link, final_url: r.resolved, tracking_url: link.url };
      } catch (err) {
        console.warn(
          '[admin/import-pdf-links] could not resolve shortener:',
          link.url, '-', errMessage(err),
        );
        return { ...link, final_url: link.url, tracking_url: null as string | null };
      }
    }));
    console.log(`[admin/import-pdf-links] resolved ${resolvedCount} shortener URL(s)`);

    // 5b. Insert new rows as drafts, auto-linking advertisers where matched.
    let inserted = 0;
    let autoLinked = 0;
    for (const link of resolved) {
      const pageCount = Number(mags[0].page_count) || 0;
      if (pageCount > 0 && link.page_idx >= pageCount) continue;

      const config: Record<string, unknown> = {
        type: 'link', url: link.final_url, open_in: 'new_tab',
      };
      if (link.tracking_url) config.tracking_url = link.tracking_url;
      const configJson = JSON.stringify(config);

      // Match against an existing advertiser. Try the resolved (final) URL
      // first, then the original shortener target if any (the destination is
      // what identifies the advertiser, not the bit.ly host).
      const matched =
        matchAdvertiser(link.final_url, advertisers) ||
        (link.tracking_url ? matchAdvertiser(link.tracking_url, advertisers) : null);
      const advId = matched ? matched.id : null;
      const advName = matched ? matched.name : null;
      if (matched) autoLinked++;

      await sql`
        INSERT INTO magazine_hotspots (
          magazine_id, page_idx,
          x_frac, y_frac, w_frac, h_frac,
          type, config, label, advertiser_name, advertiser_id,
          is_published, source, created_by, updated_by
        ) VALUES (
          ${idNum}, ${link.page_idx},
          ${link.x_frac}, ${link.y_frac}, ${link.w_frac}, ${link.h_frac},
          'link', ${configJson}::jsonb,
          null, ${advName}, ${advId},
          false, 'pdf_import', ${adminEmail}, ${adminEmail}
        )
      `;
      inserted++;
    }
    console.log(`[admin/import-pdf-links] auto-linked ${autoLinked} of ${inserted} imported hotspot(s) to advertisers`);

    // 6. Return the full updated hotspot list.
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
      imported_count: inserted,
      auto_linked_count: autoLinked,
      total_links_in_pdf: links.length,
    });
  } catch (err) {
    console.error('[admin/import-pdf-links] failed:', errMessage(err));
    return NextResponse.json(
      { error: 'import failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
