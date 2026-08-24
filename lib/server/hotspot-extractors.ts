// lib/server/hotspot-extractors.ts
//
// Shared helpers for auto-populating magazine hotspots from a PDF:
//
//   1. extractLinksFromPdf(buffer)
//        Reads embedded <a href> annotations via pdf-lib. Fast, deterministic,
//        no false positives — but only catches links the designer actually
//        made clickable in the source file.
//
//   2. scanPageTextForContacts(buffer)
//        Reads the PDF text layer via unpdf (serverless-friendly pdfjs) and
//        regex-scans each page for email addresses, phone numbers, and
//        plain-text URLs. Positions each hit as a small hotspot at the
//        detected text's bounding box. Catches everything a designer wrote
//        as plain text (e.g. "call 512-555-1234" that isn't a tel: link).
//
//   3. matchAdvertiser(url, advertisers)
//        Domain-based match against curated advertiser slugs. Shared so both
//        extractors auto-link the same way.
//
//   4. insertExtractedHotspots(sql, magazineId, extracted, opts)
//        Deletes previous source='pdf_import' rows for this magazine, then
//        inserts fresh ones. Deduplicates within the batch by (page_idx,
//        type, normalized identifier) so we never insert the same email
//        twice on the same page. Idempotent across re-runs.

import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFNumber, PDFRef } from 'pdf-lib';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { isShortenerUrl, resolveUrl } from '@/lib/url-resolver';
import type { HotspotType } from '@/lib/hotspots';
import type { NeonQueryFunction } from '@neondatabase/serverless';

// ============================================================
// Advertiser matching (shared)
// ============================================================

const ADVERTISER_MATCH_SKIPLIST = [
  'realtyline', 'myrealtyline', 'realtynewsnow',
  'facebook', 'instagram', 'linkedin', 'youtube', 'twitter',
  'tiktok', 'pinterest', 'bit', 'tinyurl', 'goo', 'ow',
];

export interface AdvertiserLite { id: number; name: string; slug: string }

function coreAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

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

export function matchAdvertiser(url: string, advertisers: AdvertiserLite[]): AdvertiserLite | null {
  const dc = domainCoreFromUrl(url);
  if (!dc || dc.length < 5) return null;
  if (ADVERTISER_MATCH_SKIPLIST.includes(dc)) return null;

  for (const adv of advertisers) {
    const sc = coreAlnum(adv.slug.replace(/-/g, ''));
    if (sc.length < 5) continue;
    if (sc.includes(dc) || dc.includes(sc)) return adv;
    // shared-prefix fallback (catches stewart.com vs stewart-title-austin)
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
// PDF link-annotation extraction (existing, moved from route)
// ============================================================

export interface ExtractedLink {
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

export async function extractLinksFromPdf(pdfBuffer: ArrayBuffer): Promise<ExtractedLink[]> {
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
// PDF text-layer scan for missing contact info (NEW)
// ============================================================
//
// unpdf is a serverless-friendly pdfjs wrapper. It returns TextItems with
// {str, transform, width, height}. transform is a 6-element PDF matrix
// [a b c d e f] where (e, f) is the item's position (bottom-left origin,
// PDF coordinates). We use e/f + width/height to place the hotspot.

interface UnpdfTextItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];   // [a, b, c, d, e, f]
  width?: number;
  height?: number;
}

interface UnpdfPage {
  getTextContent: () => Promise<{ items: UnpdfTextItem[] }>;
  getViewport: (args: { scale: number }) => { width: number; height: number };
}

interface UnpdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<UnpdfPage>;
  destroy?: () => Promise<void>;
}

export interface ExtractedContact {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  type: 'link' | 'email' | 'phone';
  /** For emails/phones: the raw address/number. For links: the URL. */
  value: string;
}

// Regexes. Kept narrow to reduce false positives — designers write things
// that LOOK like phone numbers in address fields, addresses that end in .co
// domains, etc.
//
// EMAIL: standard RFC-lite. Requires a real TLD segment (>=2 letters).
// PHONE: US-format 10-digit, tolerant of separators. Requires area code
//        to start 2-9 (real NANP), no leading 0/1. Rejects obvious ZIPs.
// URL:   http(s):// or www. prefixed. Requires a TLD segment >=2 letters.
//        Trailing punctuation stripped in normalizer below.
const RX_EMAIL = /\b[a-zA-Z0-9][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+\b/g;
const RX_PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;
const RX_URL = /\b(?:https?:\/\/|www\.)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*(?:\.[a-zA-Z]{2,})(?:\/[^\s)]*)?\b/g;

function normalizePhone(match: RegExpMatchArray): string {
  // capture groups: 1=area, 2=exchange, 3=line
  return `+1${match[1]}${match[2]}${match[3]}`;
}

function normalizeUrl(raw: string): string {
  let u = raw.replace(/[),.;:!?]+$/, ''); // strip trailing punctuation
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function scanPageTextForContacts(pdfBuffer: ArrayBuffer): Promise<ExtractedContact[]> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = (await getDocumentProxy(new Uint8Array(pdfBuffer))) as unknown as UnpdfDoc;

  const contacts: ExtractedContact[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      const content = await page.getTextContent();
      const items = content.items;

      // Build a per-line index: for every text item store its char range in
      // the concatenated line-text plus its bounding box. When a regex hits,
      // we can look up which item(s) it covers and compute a bounding rect
      // that spans them all.
      //
      // We concatenate PER ITEM (no across-item glue characters) so regex
      // offsets map cleanly back to items. Emails/phones/URLs almost never
      // span across two pdfjs text items — a single "run" of characters is
      // typically emitted as one item.
      for (const item of items) {
        const str = item.str;
        if (!str || !item.transform || item.transform.length < 6) continue;

        const a = item.transform[0];
        const d = item.transform[3];
        const e = item.transform[4];
        const f = item.transform[5];
        const w = item.width ?? Math.abs(a) * str.length * 0.5;
        const h = item.height ?? Math.abs(d);
        if (w < 1 || h < 1) continue;

        // pdfjs coordinates: bottom-left origin. Convert to top-left frac.
        const x_frac = e / pageWidth;
        const y_frac = (pageHeight - f - h) / pageHeight;
        const w_frac = w / pageWidth;
        const h_frac = h / pageHeight;

        const tryPush = (type: ExtractedContact['type'], value: string): void => {
          contacts.push({
            page_idx: pageNum - 1,
            x_frac: Math.max(0, Math.min(1, x_frac)),
            y_frac: Math.max(0, Math.min(1, y_frac)),
            w_frac: Math.max(0.005, Math.min(1 - x_frac, w_frac)),
            h_frac: Math.max(0.005, Math.min(1 - y_frac, h_frac)),
            type,
            value,
          });
        };

        // Reset regex state per string.
        RX_EMAIL.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RX_EMAIL.exec(str)) !== null) tryPush('email', normalizeEmail(m[0]));

        RX_PHONE.lastIndex = 0;
        while ((m = RX_PHONE.exec(str)) !== null) tryPush('phone', normalizePhone(m));

        RX_URL.lastIndex = 0;
        while ((m = RX_URL.exec(str)) !== null) tryPush('link', normalizeUrl(m[0]));
      }
    }
  } finally {
    await pdf.destroy?.().catch(() => undefined);
  }

  return contacts;
}

// ============================================================
// QR-code detection from pre-rendered page images (NEW)
// ============================================================
//
// Magazines already have page_urls — pre-rendered JPEGs in Vercel Blob
// from the upload pipeline. We fetch each page image, downscale to ~800px
// with sharp (jsqr's sweet spot for print QRs), and decode. Each detected
// QR becomes a link hotspot positioned at the QR's bounding box.
//
// Cost: sharp downscale + jsqr decode is ~200-400ms per page. For a 20-page
// issue that's ~5-8s total — acceptable within the 60s function budget.
// Downscaling to 800px is the key: at full print DPI a page image can be
// 3000+px, which would take 5-10x longer to decode and give the same result.
//
// Detection is best-effort: pages with no QR return quickly (jsqr's initial
// scan is fast on QR-free images). Malformed QRs are skipped silently.

export interface ExtractedQr {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  /** The URL / text encoded in the QR. */
  value: string;
}

async function decodeQrFromImageUrl(url: string, pageIdx: number): Promise<ExtractedQr | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    // Downscale to a max 800px width — jsqr works well at this size for
    // typical print QRs (which are usually >=100px on-page) and the decode
    // is 5-10x faster than at full DPI. Convert to raw RGBA for jsqr.
    const img = sharp(buf).rotate();
    const meta = await img.metadata();
    const origW = meta.width ?? 0;
    const origH = meta.height ?? 0;
    if (origW < 50 || origH < 50) return null;

    const targetW = Math.min(origW, 800);
    const { data, info } = await img
      .resize({ width: targetW, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (!result || !result.data) return null;

    // jsqr returns finder-pattern locations in the DOWNSCALED image. Convert
    // to fractions of the FULL page (fractions are scale-invariant).
    const loc = result.location;
    const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
    const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(info.width, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(info.height, Math.max(...ys));

    const x_frac = minX / info.width;
    const y_frac = minY / info.height;
    const w_frac = (maxX - minX) / info.width;
    const h_frac = (maxY - minY) / info.height;
    if (w_frac < 0.01 || h_frac < 0.01) return null;

    return {
      page_idx: pageIdx,
      x_frac, y_frac, w_frac, h_frac,
      value: result.data.trim(),
    };
  } catch {
    // Any decode error — image fetch failed, corrupt JPEG, no QR present —
    // is treated as "no QR on this page" and skipped.
    return null;
  }
}

export async function scanPagesForQrCodes(pageUrls: string[]): Promise<ExtractedQr[]> {
  // Decode pages in parallel with a modest concurrency cap so we don't hammer
  // Blob or blow the function's memory budget on huge issues.
  const CONCURRENCY = 4;
  const results: ExtractedQr[] = [];

  for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
    const batch = pageUrls.slice(i, i + CONCURRENCY);
    const decoded = await Promise.all(
      batch.map((url, offset) => decodeQrFromImageUrl(url, i + offset)),
    );
    for (const qr of decoded) {
      if (qr) results.push(qr);
    }
  }

  return results;
}

export function prepareQrRows(
  qrs: ExtractedQr[],
  advertisers: AdvertiserLite[],
): InsertableRow[] {
  return qrs.map((qr) => {
    const value = qr.value;
    // QR could contain a URL, tel:, mailto:, or plain text. We prefer to
    // create the most specific hotspot type possible.
    if (/^mailto:/i.test(value)) {
      const address = value.replace(/^mailto:/i, '').split('?')[0].trim();
      return {
        page_idx: qr.page_idx,
        x_frac: qr.x_frac, y_frac: qr.y_frac, w_frac: qr.w_frac, h_frac: qr.h_frac,
        type: 'email' as HotspotType,
        config: { type: 'email', address },
        key: address.toLowerCase(),
        advertiser_id: null,
        advertiser_name: null,
      };
    }
    if (/^tel:/i.test(value)) {
      const raw = value.replace(/^tel:/i, '').trim();
      return {
        page_idx: qr.page_idx,
        x_frac: qr.x_frac, y_frac: qr.y_frac, w_frac: qr.w_frac, h_frac: qr.h_frac,
        type: 'phone' as HotspotType,
        config: { type: 'phone', number: raw },
        key: raw.replace(/[^0-9]/g, '').replace(/^1/, ''),
        advertiser_id: null,
        advertiser_name: null,
      };
    }
    // URL or plain text — store as link. Non-URL plain text is rare in
    // real-estate print (QRs there are always contact/website) and would
    // fail domain matching anyway so it just stays an unlinked draft.
    const looksLikeUrl = /^https?:\/\//i.test(value) || /^www\./i.test(value);
    const url = looksLikeUrl
      ? (value.startsWith('http') ? value : `https://${value}`)
      : value;
    const matched = looksLikeUrl ? matchAdvertiser(url, advertisers) : null;
    return {
      page_idx: qr.page_idx,
      x_frac: qr.x_frac, y_frac: qr.y_frac, w_frac: qr.w_frac, h_frac: qr.h_frac,
      type: 'link' as HotspotType,
      config: { type: 'link', url, open_in: 'new_tab' },
      key: url.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      advertiser_id: matched?.id ?? null,
      advertiser_name: matched?.name ?? null,
    };
  });
}

// ============================================================
// Combined inserter: dedupes within batch + against existing hotspots
// ============================================================

export interface InsertOptions {
  magazineId: number;
  adminEmail: string | null;
  /** True = wipe & reinsert pdf_import rows (used by the link-annotation
   *  extractor as its designed re-sync path). False = only insert what
   *  isn't already present as a manual OR pdf_import row on the same page. */
  wipeExistingImports: boolean;
}

interface InsertableRow {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  type: HotspotType;
  config: Record<string, unknown>;
  /** Normalized identity key for dedupe (e.g. lowercased email, e164 phone,
   *  resolved URL). */
  key: string;
  advertiser_id: number | null;
  advertiser_name: string | null;
}

type SqlFn = NeonQueryFunction<false, false>;

/**
 * Insert extracted hotspots as source='pdf_import' drafts. Skips any row
 * whose (page_idx, type, key) already matches an existing hotspot on that
 * page — regardless of whether the existing one is manual or a prior import.
 * This is what makes re-runs safe and lets the text-scan complement the
 * link-annotation extractor without duplicating.
 */
export async function insertExtractedHotspots(
  sql: SqlFn,
  rows: InsertableRow[],
  opts: InsertOptions,
): Promise<{ inserted: number; skipped_duplicates: number }> {
  const { magazineId, adminEmail, wipeExistingImports } = opts;

  if (wipeExistingImports) {
    await sql`
      DELETE FROM magazine_hotspots
      WHERE magazine_id = ${magazineId} AND source = 'pdf_import'
    `;
  }

  // Load existing hotspots on this magazine to dedupe against. We compute
  // the same "key" for each existing row so a manual hotspot for
  // hello@foo.com blocks a scan-inserted duplicate on the same page.
  const existing = await sql`
    SELECT page_idx, type, config
    FROM magazine_hotspots
    WHERE magazine_id = ${magazineId}
  ` as Array<{ page_idx: number; type: HotspotType; config: Record<string, unknown> }>;

  const existingKeys = new Set<string>();
  for (const row of existing) {
    const key = configKey(row.type, row.config);
    if (key) existingKeys.add(`${row.page_idx}:${row.type}:${key}`);
  }

  // Within-batch dedupe too (same email appearing on same page in multiple
  // text items).
  const batchKeys = new Set<string>();
  let inserted = 0;
  let skipped_duplicates = 0;

  for (const row of rows) {
    const composite = `${row.page_idx}:${row.type}:${row.key}`;
    if (existingKeys.has(composite) || batchKeys.has(composite)) {
      skipped_duplicates++;
      continue;
    }
    batchKeys.add(composite);

    const configJson = JSON.stringify(row.config);
    await sql`
      INSERT INTO magazine_hotspots (
        magazine_id, page_idx,
        x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name, advertiser_id,
        is_published, source, created_by, updated_by
      ) VALUES (
        ${magazineId}, ${row.page_idx},
        ${row.x_frac}, ${row.y_frac}, ${row.w_frac}, ${row.h_frac},
        ${row.type}, ${configJson}::jsonb,
        null, ${row.advertiser_name}, ${row.advertiser_id},
        false, 'pdf_import', ${adminEmail}, ${adminEmail}
      )
    `;
    inserted++;
  }

  return { inserted, skipped_duplicates };
}

function configKey(type: HotspotType, config: Record<string, unknown>): string | null {
  if (type === 'link' || type === 'mls') {
    const url = typeof config.url === 'string' ? config.url : '';
    return url ? url.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase() : null;
  }
  if (type === 'email') {
    const addr = typeof config.address === 'string' ? config.address : '';
    return addr ? addr.toLowerCase() : null;
  }
  if (type === 'phone') {
    const raw = typeof config.number === 'string' ? config.number : '';
    return raw ? raw.replace(/[^0-9]/g, '').replace(/^1/, '') : null;
  }
  return null;
}

// ============================================================
// Convenience: turn extracted contacts into insertable rows with
// advertiser matching for the link type.
// ============================================================

export async function preparePdfLinkRows(
  links: ExtractedLink[],
  advertisers: AdvertiserLite[],
): Promise<InsertableRow[]> {
  // Pre-resolve shortener URLs in parallel.
  const resolved = await Promise.all(links.map(async (link) => {
    if (!isShortenerUrl(link.url)) {
      return { ...link, final_url: link.url, tracking_url: null as string | null };
    }
    try {
      const r = await resolveUrl(link.url, { maxHops: 8, timeoutMs: 5000 });
      return { ...link, final_url: r.resolved, tracking_url: link.url };
    } catch {
      return { ...link, final_url: link.url, tracking_url: null as string | null };
    }
  }));

  return resolved.map((link) => {
    const matched =
      matchAdvertiser(link.final_url, advertisers) ||
      (link.tracking_url ? matchAdvertiser(link.tracking_url, advertisers) : null);
    const config: Record<string, unknown> = {
      type: 'link', url: link.final_url, open_in: 'new_tab',
    };
    if (link.tracking_url) config.tracking_url = link.tracking_url;
    return {
      page_idx: link.page_idx,
      x_frac: link.x_frac, y_frac: link.y_frac,
      w_frac: link.w_frac, h_frac: link.h_frac,
      type: 'link' as HotspotType,
      config,
      key: link.final_url.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      advertiser_id: matched?.id ?? null,
      advertiser_name: matched?.name ?? null,
    };
  });
}

export function prepareContactRows(
  contacts: ExtractedContact[],
  advertisers: AdvertiserLite[],
): InsertableRow[] {
  return contacts.map((c) => {
    if (c.type === 'email') {
      return {
        page_idx: c.page_idx,
        x_frac: c.x_frac, y_frac: c.y_frac,
        w_frac: c.w_frac, h_frac: c.h_frac,
        type: 'email' as HotspotType,
        config: { type: 'email', address: c.value },
        key: c.value,
        advertiser_id: null,
        advertiser_name: null,
      };
    }
    if (c.type === 'phone') {
      return {
        page_idx: c.page_idx,
        x_frac: c.x_frac, y_frac: c.y_frac,
        w_frac: c.w_frac, h_frac: c.h_frac,
        type: 'phone' as HotspotType,
        config: { type: 'phone', number: c.value },
        key: c.value.replace(/[^0-9]/g, '').replace(/^1/, ''),
        advertiser_id: null,
        advertiser_name: null,
      };
    }
    // link
    const matched = matchAdvertiser(c.value, advertisers);
    return {
      page_idx: c.page_idx,
      x_frac: c.x_frac, y_frac: c.y_frac,
      w_frac: c.w_frac, h_frac: c.h_frac,
      type: 'link' as HotspotType,
      config: { type: 'link', url: c.value, open_in: 'new_tab' },
      key: c.value.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      advertiser_id: matched?.id ?? null,
      advertiser_name: matched?.name ?? null,
    };
  });
}
