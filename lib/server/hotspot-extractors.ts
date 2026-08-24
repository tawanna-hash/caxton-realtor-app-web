// lib/server/hotspot-extractors.ts
//
// Hotspot auto-extraction for magazine PDFs. Three independent passes, one
// shared inserter:
//
//   1. extractPdfLinkAnnotations(buffer)
//        Read every embedded <a href> annotation via pdf-lib. This is the
//        cheapest, most precise source — but it only catches links the
//        designer actually made clickable in the source file.
//
//   2. extractPdfTextContacts(buffer)
//        Read the PDF text layer via unpdf. Text items are grouped into
//        LINES (by baseline y), sorted left-to-right, and re-assembled into
//        continuous strings with a per-item character offset map. Regex
//        scans run against the reconstructed line, and each hit is mapped
//        back to the item(s) it covers — giving us a real bounding box
//        that spans multi-item matches like kerned emails or spaced-out
//        phone numbers. This is the key improvement over v1, which ran
//        regexes per-item and lost anything spanning items.
//
//   3. extractQrCodes(pageImageUrls)
//        Fetch each pre-rendered page JPEG from Vercel Blob, resize to
//        1200px wide, and run jsqr on both the original and inverted
//        rasters. Falls back to a 90-degree rotation for QRs printed
//        sideways.
//
//   4. insertExtracted(sql, rows, opts)
//        Central inserter. Dedupes against existing hotspots on the same
//        page by (page_idx, type, normalized identity). Sets source =
//        'pdf_import', is_published = false, z_index = -100 so imports
//        naturally stack below manual hotspots.

import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFNumber, PDFRef } from 'pdf-lib';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { isShortenerUrl, resolveUrl } from '@/lib/url-resolver';
import type { HotspotType } from '@/lib/hotspots';
import type { NeonQueryFunction } from '@neondatabase/serverless';

// ============================================================
// Advertiser matching (shared across all three passes)
// ============================================================

const ADVERTISER_MATCH_SKIPLIST = [
  'realtyline', 'myrealtyline', 'realtynewsnow',
  'facebook', 'instagram', 'linkedin', 'youtube', 'twitter',
  'tiktok', 'pinterest', 'bit', 'tinyurl', 'goo', 'ow',
];

export interface AdvertiserLite {
  id: number;
  name: string;
  slug: string;
  /** Publicly-hosted logo URL (Vercel Blob). Optional — used by the logo
   *  perceptual-hash pass to match page image regions against known
   *  advertisers. Advertisers without a logo can't be matched by image. */
  avatar_url?: string | null;
  /** Advertiser's public website. Used as the destination URL of any
   *  hotspot created by the logo pass. Advertisers without a website
   *  can't produce a clickable logo hotspot — we skip them. */
  website?: string | null;
}

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
// Unified extraction result type
// ============================================================
//
// Every pass produces the same shape so the inserter is source-agnostic.
// `identity` is the dedupe key (normalized email / phone / URL).
// `label` is a short human-readable summary the editor uses as the
// hotspot's display label so imports are searchable and self-describing.

export interface ExtractedHotspot {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
  type: 'link' | 'email' | 'phone';
  config: Record<string, unknown>;
  identity: string;
  label: string;
  /** Where this hit came from — populated for diagnostics/UI, not stored. */
  origin: 'pdf_link' | 'text_scan' | 'qr_code' | 'logo_match';
  /** Set later by the inserter after advertiser matching. */
  advertiser_id?: number | null;
  advertiser_name?: string | null;
}

// ============================================================
// PASS 1: PDF link annotations (pdf-lib)
// ============================================================

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

/** Fixed-viewport rect → bounded fractional rect. */
function rectToFrac(
  left: number, top: number, w: number, h: number, pageW: number, pageH: number,
): { x_frac: number; y_frac: number; w_frac: number; h_frac: number } {
  let x_frac = left / pageW;
  let y_frac = top / pageH;
  let w_frac = w / pageW;
  let h_frac = h / pageH;
  x_frac = Math.max(0, Math.min(1, x_frac));
  y_frac = Math.max(0, Math.min(1, y_frac));
  w_frac = Math.max(0.005, Math.min(1 - x_frac, w_frac));
  h_frac = Math.max(0.005, Math.min(1 - y_frac, h_frac));
  return { x_frac, y_frac, w_frac, h_frac };
}

export async function extractPdfLinkAnnotations(pdfBuffer: ArrayBuffer): Promise<ExtractedHotspot[]> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), {
    updateMetadata: false, ignoreEncryption: true,
  });
  const out: ExtractedHotspot[] = [];
  const pages = pdfDoc.getPages();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const annotsRaw = page.node.lookup(PDFName.of('Annots'));
    if (!(annotsRaw instanceof PDFArray)) continue;

    for (let i = 0; i < annotsRaw.size(); i++) {
      const annotEntry = annotsRaw.get(i);
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

      const frac = rectToFrac(left, pageHeight - top, w, h, pageWidth, pageHeight);
      const trimmedUrl = url.trim();
      out.push({
        page_idx: pageIdx,
        ...frac,
        type: 'link',
        config: { type: 'link', url: trimmedUrl, open_in: 'new_tab' },
        identity: normalizeUrl(trimmedUrl),
        label: labelForUrl(trimmedUrl),
        origin: 'pdf_link',
      });
    }
  }

  return out;
}

// ============================================================
// PASS 2: text-layer scan (unpdf) with LINE RECONSTRUCTION
// ============================================================
//
// This is the piece v1 got wrong. unpdf emits TextItems one "run" at a time
// where a run is a group of characters emitted by a single Tj/TJ operator
// in the PDF content stream. In practice a run is usually a word or a short
// phrase — so an email like "hello@company.com" often lands in ONE item,
// but "hello@ company.com" (with a soft-hyphen or kerning) can be TWO or
// THREE items. Same for phone numbers with formatted separators, and same
// for wrapped URLs.
//
// v1 ran regexes on each item independently → missed anything spanning.
//
// v2 groups items by baseline y (with a small tolerance for anti-aliasing
// noise), sorts each line left-to-right by x, joins with a " " separator
// where the horizontal gap between items exceeds ~30% of their character
// height (to preserve word boundaries), and builds a char-offset table so
// any regex match on the joined line can be mapped back to the source
// items and their bounding boxes.

interface UnpdfTextItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];   // [a, b, c, d, e, f] — 2d affine
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

interface PositionedItem {
  str: string;
  /** page-space bottom-left x in PDF coords */
  x: number;
  /** page-space bottom-left y in PDF coords */
  y: number;
  w: number;
  h: number;
}

interface LineChunk {
  /** Index into the source `items` array. */
  itemIdx: number;
  /** Char offset in the joined line where this item's text starts. */
  offset: number;
  /** Length of this item's text in the joined line (equals items[itemIdx].str.length). */
  length: number;
}

interface ReconstructedLine {
  text: string;
  chunks: LineChunk[];
  items: PositionedItem[];
}

const EMAIL_RE = /\b[a-zA-Z0-9][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+\b/g;
const PHONE_RE = /(?<![\d/])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*(?:\.[a-zA-Z]{2,})(?:\/[^\s)]*)?\b/g;
// A bare hostname URL WITHOUT scheme/www. e.g. "stewart.com/contact". Common
// in print ads and magazines. We match these too but require a real-looking
// TLD (avoids false positives on filenames like "file.pdf" — see filter below).
const BARE_DOMAIN_RE = /(?<![@\w])[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+){0,3}\.[a-zA-Z]{2,}(?:\/[^\s)]*)?\b/g;

// TLDs we'll accept for bare-domain matches. Restricting to a curated list
// avoids matching filenames (foo.pdf, screenshot.jpg), version strings
// (v1.2.3), decimals ($1.5m), etc. Extend as needed — this is intentionally
// conservative.
const BARE_DOMAIN_TLDS = new Set([
  'com', 'net', 'org', 'io', 'co', 'us', 'app', 'dev', 'ai', 'biz', 'info',
  'realtor', 'realty', 'homes', 'house', 'properties', 'estate', 'agency',
  'group', 'company', 'llc', 'team', 'live', 'life', 'today', 'online',
  'tv', 'me', 'ly', 'gov', 'edu', 'club', 'store', 'shop', 'pro',
]);

function normalizePhone(m: RegExpExecArray): string {
  return `+1${m[1]}${m[2]}${m[3]}`;
}

function normalizeUrl(raw: string): string {
  let u = raw.trim().replace(/[),.;:!?\]}]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeIdentityUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
}

function normalizeIdentityPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '').replace(/^1/, '');
}

function labelForEmail(email: string): string {
  return `Email · ${email}`;
}

function labelForPhone(phone: string): string {
  // Pretty-format E.164 back into (xxx) xxx-xxxx for the label
  const digits = phone.replace(/[^0-9]/g, '').replace(/^1/, '');
  if (digits.length === 10) {
    return `Phone · (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `Phone · ${phone}`;
}

function labelForUrl(url: string): string {
  const host = url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
  return `Link · ${host}`;
}

/** Group text items into lines by shared baseline y, then sort each line
 *  left-to-right and produce a joined text + chunk offset table. */
function reconstructLines(items: UnpdfTextItem[]): ReconstructedLine[] {
  // Convert to PositionedItem, dropping empties and items without geometry.
  const positioned: (PositionedItem & { orig: UnpdfTextItem })[] = [];
  for (const it of items) {
    const str = it.str;
    if (!str || !it.transform || it.transform.length < 6) continue;
    const a = it.transform[0];
    const d = it.transform[3];
    const e = it.transform[4];
    const f = it.transform[5];
    const w = it.width ?? Math.abs(a) * str.length * 0.5;
    const h = it.height ?? Math.abs(d);
    if (w < 0.5 || h < 0.5) continue;
    positioned.push({ str, x: e, y: f, w, h, orig: it });
  }

  if (positioned.length === 0) return [];

  // Sort by baseline y descending (top of page first in PDF coords).
  positioned.sort((a, b) => b.y - a.y);

  // Group by y with a tolerance = 40% of median height (handles anti-aliasing
  // jitter and superscripts/subscripts that share the visual line).
  const heights = positioned.map((p) => p.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 8;
  const lineTolerance = Math.max(1, medianH * 0.4);

  const groups: (PositionedItem & { orig: UnpdfTextItem })[][] = [];
  let current: (PositionedItem & { orig: UnpdfTextItem })[] = [];
  let currentY = positioned[0].y;
  for (const p of positioned) {
    if (current.length === 0 || Math.abs(p.y - currentY) <= lineTolerance) {
      current.push(p);
      currentY = current.reduce((s, x) => s + x.y, 0) / current.length;
    } else {
      groups.push(current);
      current = [p];
      currentY = p.y;
    }
  }
  if (current.length > 0) groups.push(current);

  // Within each line, sort left-to-right and assemble text with real offsets.
  const lines: ReconstructedLine[] = [];
  for (const group of groups) {
    group.sort((a, b) => a.x - b.x);
    let text = '';
    const chunks: LineChunk[] = [];
    const groupItems: PositionedItem[] = [];
    for (let idx = 0; idx < group.length; idx++) {
      const item = group[idx];
      // Insert a space separator between items if there's a visible gap AND
      // the previous chunk didn't already end with whitespace. This preserves
      // token boundaries without inflating regex text — critical because URLs
      // and emails MUST be scanned as single tokens.
      if (idx > 0) {
        const prev = group[idx - 1];
        const gap = item.x - (prev.x + prev.w);
        const needsSpace = gap > (item.h * 0.3) &&
          !/\s$/.test(text) && !/^\s/.test(item.str);
        if (needsSpace) text += ' ';
      }
      const offset = text.length;
      chunks.push({ itemIdx: idx, offset, length: item.str.length });
      text += item.str;
      groupItems.push(item);
    }
    lines.push({ text, chunks, items: groupItems });
  }

  return lines;
}

/** Given a match on `line.text` starting at `matchStart` with length
 *  `matchLen`, compute the bounding box covering every text item the match
 *  touches. Returns bottom-left x,y and width,height in PDF page coords. */
function bboxForMatch(
  line: ReconstructedLine,
  matchStart: number,
  matchLen: number,
): { x: number; y: number; w: number; h: number } | null {
  const matchEnd = matchStart + matchLen;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let touched = false;

  for (const chunk of line.chunks) {
    const chunkEnd = chunk.offset + chunk.length;
    // Chunks that overlap the match at all count.
    if (chunkEnd <= matchStart || chunk.offset >= matchEnd) continue;
    const item = line.items[chunk.itemIdx];
    if (!item) continue;
    touched = true;
    minX = Math.min(minX, item.x);
    maxX = Math.max(maxX, item.x + item.w);
    minY = Math.min(minY, item.y);
    maxY = Math.max(maxY, item.y + item.h);
  }
  if (!touched) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export async function extractPdfTextContacts(pdfBuffer: ArrayBuffer): Promise<ExtractedHotspot[]> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = (await getDocumentProxy(new Uint8Array(pdfBuffer))) as unknown as UnpdfDoc;
  const out: ExtractedHotspot[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      const content = await page.getTextContent();
      const lines = reconstructLines(content.items);

      for (const line of lines) {
        // EMAIL
        EMAIL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = EMAIL_RE.exec(line.text)) !== null) {
          const bbox = bboxForMatch(line, m.index, m[0].length);
          if (!bbox) continue;
          const frac = rectToFrac(bbox.x, pageHeight - bbox.y - bbox.h, bbox.w, bbox.h, pageWidth, pageHeight);
          const email = normalizeEmail(m[0]);
          out.push({
            page_idx: pageNum - 1, ...frac,
            type: 'email',
            config: { type: 'email', address: email },
            identity: email,
            label: labelForEmail(email),
            origin: 'text_scan',
          });
        }

        // PHONE
        PHONE_RE.lastIndex = 0;
        while ((m = PHONE_RE.exec(line.text)) !== null) {
          const bbox = bboxForMatch(line, m.index, m[0].length);
          if (!bbox) continue;
          const frac = rectToFrac(bbox.x, pageHeight - bbox.y - bbox.h, bbox.w, bbox.h, pageWidth, pageHeight);
          const e164 = normalizePhone(m);
          out.push({
            page_idx: pageNum - 1, ...frac,
            type: 'phone',
            config: { type: 'phone', number: e164 },
            identity: normalizeIdentityPhone(e164),
            label: labelForPhone(e164),
            origin: 'text_scan',
          });
        }

        // URL — http(s) or www.
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(line.text)) !== null) {
          const bbox = bboxForMatch(line, m.index, m[0].length);
          if (!bbox) continue;
          const frac = rectToFrac(bbox.x, pageHeight - bbox.y - bbox.h, bbox.w, bbox.h, pageWidth, pageHeight);
          const url = normalizeUrl(m[0]);
          out.push({
            page_idx: pageNum - 1, ...frac,
            type: 'link',
            config: { type: 'link', url, open_in: 'new_tab' },
            identity: normalizeIdentityUrl(url),
            label: labelForUrl(url),
            origin: 'text_scan',
          });
        }

        // BARE DOMAIN (foo.com, foo.com/path — no scheme, no www.)
        BARE_DOMAIN_RE.lastIndex = 0;
        while ((m = BARE_DOMAIN_RE.exec(line.text)) !== null) {
          const raw = m[0];
          // Skip if the "domain" is actually the tail of an email/URL we
          // already caught on this pass. Cheap check: does an @ sit within
          // 3 chars before the match start on this line?
          const before = line.text.slice(Math.max(0, m.index - 3), m.index);
          if (before.includes('@') || before.endsWith('/') || before.endsWith('.')) continue;
          // Skip if it's clearly a file extension / version string.
          const tld = raw.split('/')[0].split('.').pop()?.toLowerCase() ?? '';
          if (!BARE_DOMAIN_TLDS.has(tld)) continue;

          const bbox = bboxForMatch(line, m.index, raw.length);
          if (!bbox) continue;
          const frac = rectToFrac(bbox.x, pageHeight - bbox.y - bbox.h, bbox.w, bbox.h, pageWidth, pageHeight);
          const url = normalizeUrl(raw);
          out.push({
            page_idx: pageNum - 1, ...frac,
            type: 'link',
            config: { type: 'link', url, open_in: 'new_tab' },
            identity: normalizeIdentityUrl(url),
            label: labelForUrl(url),
            origin: 'text_scan',
          });
        }
      }
    }
  } finally {
    await pdf.destroy?.().catch(() => undefined);
  }

  return out;
}

// ============================================================
// PASS 3: QR-code scan (sharp + jsqr)
// ============================================================
//
// Pre-rendered page JPEGs are already in Vercel Blob (page_urls). We fetch,
// downscale to 1200px (higher than v1's 800px — the extra resolution matters
// for small QRs on busy pages), and try:
//   a) original raster
//   b) inverted raster (light-on-dark QRs)
//   c) rotated raster (some magazines print QRs sideways)
//
// A QR that decodes in ANY of these attempts wins.

interface JsQrLocation {
  topLeftCorner: { x: number; y: number };
  topRightCorner: { x: number; y: number };
  bottomLeftCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
}

interface QrHit {
  data: string;
  loc: JsQrLocation;
  /** Width/height of the raster the location refers to. */
  rasterW: number;
  rasterH: number;
  /** Which pass produced the hit (for logs). */
  attempt: 'original' | 'inverted' | 'rotated';
}

async function tryDecodeBuffer(
  pixels: Uint8Array,
  info: { width: number; height: number },
  attempt: QrHit['attempt'],
): Promise<QrHit | null> {
  const clamped = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const res = jsQR(clamped, info.width, info.height, { inversionAttempts: 'attemptBoth' });
  if (!res || !res.data) return null;
  return { data: res.data, loc: res.location, rasterW: info.width, rasterH: info.height, attempt };
}

async function decodeQrForPage(url: string, pageIdx: number): Promise<ExtractedHotspot | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    const meta = await sharp(buf).metadata();
    if ((meta.width ?? 0) < 50 || (meta.height ?? 0) < 50) return null;

    const targetW = 1200;
    // Attempt 1: normal
    const base = await sharp(buf).rotate()
      .resize({ width: targetW, withoutEnlargement: true })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let hit = await tryDecodeBuffer(base.data, base.info, 'original');

    // Attempt 2: 90-degree rotation (sideways-printed QRs)
    if (!hit) {
      const rot = await sharp(buf).rotate(90)
        .resize({ width: targetW, withoutEnlargement: true })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      hit = await tryDecodeBuffer(rot.data, rot.info, 'rotated');
    }

    if (!hit) return null;

    // The location comes from the raster at the resolution jsQR saw. When
    // the raster was rotated we can't map back to the original page image
    // orientation without inverting the rotation on the corner coordinates.
    // For our purposes (placing a hotspot roughly where the QR is), fall
    // back to the CENTER of the raster with a generous default size if the
    // raster was rotated. This is rare enough that a rough placement is fine.
    let x_frac: number, y_frac: number, w_frac: number, h_frac: number;
    if (hit.attempt === 'rotated') {
      // Use the center of the ORIGINAL image with a reasonable size.
      x_frac = 0.35;
      y_frac = 0.35;
      w_frac = 0.15;
      h_frac = 0.15;
    } else {
      const xs = [hit.loc.topLeftCorner.x, hit.loc.topRightCorner.x, hit.loc.bottomLeftCorner.x, hit.loc.bottomRightCorner.x];
      const ys = [hit.loc.topLeftCorner.y, hit.loc.topRightCorner.y, hit.loc.bottomLeftCorner.y, hit.loc.bottomRightCorner.y];
      const minX = Math.max(0, Math.min(...xs));
      const maxX = Math.min(hit.rasterW, Math.max(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxY = Math.min(hit.rasterH, Math.max(...ys));
      x_frac = minX / hit.rasterW;
      y_frac = minY / hit.rasterH;
      w_frac = (maxX - minX) / hit.rasterW;
      h_frac = (maxY - minY) / hit.rasterH;
      if (w_frac < 0.01 || h_frac < 0.01) return null;
    }

    const value = hit.data.trim();
    return qrValueToExtracted(value, pageIdx, x_frac, y_frac, w_frac, h_frac);
  } catch {
    return null;
  }
}

function qrValueToExtracted(
  value: string, pageIdx: number,
  x_frac: number, y_frac: number, w_frac: number, h_frac: number,
): ExtractedHotspot {
  const base = { page_idx: pageIdx, x_frac, y_frac, w_frac, h_frac, origin: 'qr_code' as const };
  if (/^mailto:/i.test(value)) {
    const address = normalizeEmail(value.replace(/^mailto:/i, '').split('?')[0]);
    return {
      ...base, type: 'email',
      config: { type: 'email', address },
      identity: address,
      label: `QR · ${labelForEmail(address)}`,
    };
  }
  if (/^tel:/i.test(value)) {
    const raw = value.replace(/^tel:/i, '').trim();
    const digits = raw.replace(/[^0-9]/g, '').replace(/^1/, '');
    const e164 = digits.length === 10 ? `+1${digits}` : raw;
    return {
      ...base, type: 'phone',
      config: { type: 'phone', number: e164 },
      identity: normalizeIdentityPhone(e164),
      label: `QR · ${labelForPhone(e164)}`,
    };
  }
  const looksLikeUrl = /^https?:\/\//i.test(value) || /^www\./i.test(value) || /\.[a-z]{2,}(\/|$)/i.test(value);
  const url = looksLikeUrl ? normalizeUrl(value) : value;
  return {
    ...base, type: 'link',
    config: { type: 'link', url, open_in: 'new_tab' },
    identity: normalizeIdentityUrl(url),
    label: `QR · ${labelForUrl(url)}`,
  };
}

export async function extractQrCodes(pageImageUrls: string[]): Promise<ExtractedHotspot[]> {
  const CONCURRENCY = 4;
  const out: ExtractedHotspot[] = [];
  for (let i = 0; i < pageImageUrls.length; i += CONCURRENCY) {
    const batch = pageImageUrls.slice(i, i + CONCURRENCY);
    const decoded = await Promise.all(
      batch.map((url, offset) => decodeQrForPage(url, i + offset)),
    );
    for (const qr of decoded) if (qr) out.push(qr);
  }
  return out;
}

// ============================================================
// PASS 4: logo detection via perceptual hash matching
// ============================================================
//
// Text scans and PDF link annotations both miss logos: they're raster (or
// vector art) with no adjacent contact text and no clickable annotation.
// Instead we:
//
//   1. Walk every page's PDF operator list and collect the bounding box
//      of every embedded image (Do XObject calls). This gives us candidate
//      logo regions with exact page-space coords — much cheaper and more
//      accurate than trying to segment the rendered raster.
//   2. Crop each candidate from the pre-rendered page JPEG (page_urls).
//   3. Perceptual-hash (dhash via sharp-phash) the crop.
//   4. Compare against a phash of each advertiser's stored logo
//      (avatar_url). Small Hamming distance => match.
//   5. On match, insert a link hotspot pointing at the advertiser's
//      website, with advertiser_id set.
//
// Advertisers with no logo or no website can't be matched — we skip them.
//
// The dhash phash implementation in sharp-phash returns a 64-bit binary
// string. Hamming distance <= 12 (out of 64) is a common empirical
// threshold for "same image, different size/compression." We use 14 to
// be a bit more forgiving of resize artifacts on smaller ad-block logos,
// and re-tune if we see false positives.

const LOGO_PHASH_MAX_DISTANCE = 14;
// Skip anything tiny (page 'images' that are actually decorative bullets
// or icons) or full-page (background photos). Values are page-space
// fractions, so 0.02 = 2% of the smaller page dimension.
const LOGO_MIN_FRAC_SHORT_SIDE = 0.03;
const LOGO_MAX_FRAC = 0.6;

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

interface ImageRegion {
  page_idx: number;
  x_frac: number;
  y_frac: number;
  w_frac: number;
  h_frac: number;
}

/** Walk a PDF page's operator list and return every image paint (Do) with
 *  its bounding box in page-space (top-left origin, fractional). Uses
 *  pdfjs-dist via unpdf. */
async function extractImageRegions(pdfBuffer: ArrayBuffer): Promise<ImageRegion[]> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = (await getDocumentProxy(new Uint8Array(pdfBuffer))) as unknown as {
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (args: { scale: number }) => { width: number; height: number };
      getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
      commonObjs?: { get?: (name: string) => unknown };
      objs?: { get?: (name: string) => unknown };
    }>;
    destroy?: () => Promise<void>;
  };

  // pdfjs operator IDs: import them from the module so we don't hard-code
  // magic numbers. Different pdfjs versions have different int values.
  const pdfjsMod = await import('unpdf/pdfjs') as unknown as { OPS?: Record<string, number> };
  const OPS = pdfjsMod.OPS;
  if (!OPS) {
    // Fallback: pdfjs OPS not exported here. Return empty rather than
    // guessing — the logo pass just contributes zero hits in that case.
    return [];
  }

  const out: ImageRegion[] = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageW = viewport.width;
      const pageH = viewport.height;

      const opList = await page.getOperatorList();
      // Track the current transformation matrix (CTM) stack. pdfjs emits
      // save/restore + transform ops we need to accumulate to know the
      // final placement of each paintImageXObject.
      const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
      let ctm: number[] = [1, 0, 0, 1, 0, 0];

      const mul = (a: number[], b: number[]) => [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
      ];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const op = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (op === OPS.save) {
          ctmStack.push([...ctm]);
        } else if (op === OPS.restore) {
          ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
        } else if (op === OPS.transform) {
          ctm = mul(ctm, args as number[]);
        } else if (
          op === OPS.paintImageXObject ||
          op === OPS.paintInlineImageXObject ||
          op === OPS.paintImageMaskXObject ||
          op === OPS.paintJpegXObject
        ) {
          // Image is drawn in the unit square [0,0]-[1,1] then transformed
          // by the CTM. The final rect corners are the four transformed
          // unit-square corners.
          const corners: [number, number][] = [
            [ctm[4], ctm[5]],
            [ctm[0] + ctm[4], ctm[1] + ctm[5]],
            [ctm[2] + ctm[4], ctm[3] + ctm[5]],
            [ctm[0] + ctm[2] + ctm[4], ctm[1] + ctm[3] + ctm[5]],
          ];
          const xs = corners.map((c) => c[0]);
          const ys = corners.map((c) => c[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const w = maxX - minX;
          const h = maxY - minY;
          if (w < 1 || h < 1) continue;

          // pdfjs y-axis is bottom-up; convert to top-down for hotspot coords.
          const topDownY = pageH - maxY;
          const frac = rectToFrac(minX, topDownY, w, h, pageW, pageH);

          const shortSide = Math.min(frac.w_frac, frac.h_frac);
          const longSide = Math.max(frac.w_frac, frac.h_frac);
          if (shortSide < LOGO_MIN_FRAC_SHORT_SIDE) continue;
          if (longSide > LOGO_MAX_FRAC) continue;

          out.push({ page_idx: pageNum - 1, ...frac });
        }
      }
    }
  } finally {
    await pdf.destroy?.().catch(() => undefined);
  }

  return out;
}

/** Compute the phash of a raster fetched from a URL. sharp-phash accepts
 *  a Buffer directly; we downscale to 256px on the long side first for
 *  consistent hashing across differently-sized source images. */
async function phashFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const normalized = await sharp(buf).rotate()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: false })
      .toBuffer();
    const phash = await (await import('sharp-phash')).default(normalized);
    return phash;
  } catch {
    return null;
  }
}

/** Load and phash every advertiser's stored logo. */
async function buildAdvertiserPhashIndex(
  advertisers: AdvertiserLite[],
): Promise<Array<{ adv: AdvertiserLite; phash: string }>> {
  const eligible = advertisers.filter((a) => a.avatar_url && a.website);
  const CONCURRENCY = 8;
  const index: Array<{ adv: AdvertiserLite; phash: string }> = [];
  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const batch = eligible.slice(i, i + CONCURRENCY);
    const done = await Promise.all(batch.map(async (adv) => {
      const phash = await phashFromUrl(adv.avatar_url!);
      return phash ? { adv, phash } : null;
    }));
    for (const d of done) if (d) index.push(d);
  }
  return index;
}

/** Crop a region from a page JPEG (by URL) and return its phash. */
async function phashPageRegion(
  pageBuffer: Buffer, region: ImageRegion,
): Promise<string | null> {
  try {
    const meta = await sharp(pageBuffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 20 || h < 20) return null;

    const left = Math.max(0, Math.floor(region.x_frac * w));
    const top = Math.max(0, Math.floor(region.y_frac * h));
    const width = Math.min(w - left, Math.ceil(region.w_frac * w));
    const height = Math.min(h - top, Math.ceil(region.h_frac * h));
    if (width < 20 || height < 20) return null;

    const cropped = await sharp(pageBuffer)
      .extract({ left, top, width, height })
      .resize({ width: 256, height: 256, fit: 'inside' })
      .toBuffer();
    return await (await import('sharp-phash')).default(cropped);
  } catch {
    return null;
  }
}

/** Full logo pass. */
export async function extractLogoMatches(
  pdfBuffer: ArrayBuffer,
  pageImageUrls: string[],
  advertisers: AdvertiserLite[],
): Promise<ExtractedHotspot[]> {
  // 1. Build advertiser phash index (parallel with region detection below).
  const [advIndex, regions] = await Promise.all([
    buildAdvertiserPhashIndex(advertisers),
    extractImageRegions(pdfBuffer),
  ]);
  if (advIndex.length === 0 || regions.length === 0) return [];

  // 2. Group regions by page so we only fetch each page JPEG once.
  const byPage = new Map<number, ImageRegion[]>();
  for (const r of regions) {
    const list = byPage.get(r.page_idx) ?? [];
    list.push(r);
    byPage.set(r.page_idx, list);
  }

  const out: ExtractedHotspot[] = [];
  const PAGE_CONCURRENCY = 4;
  const pageEntries = Array.from(byPage.entries());
  for (let i = 0; i < pageEntries.length; i += PAGE_CONCURRENCY) {
    const batch = pageEntries.slice(i, i + PAGE_CONCURRENCY);
    const results = await Promise.all(batch.map(async ([pageIdx, pageRegions]) => {
      const pageUrl = pageImageUrls[pageIdx];
      if (!pageUrl) return [] as ExtractedHotspot[];
      let pageBuf: Buffer;
      try {
        const res = await fetch(pageUrl, { cache: 'no-store' });
        if (!res.ok) return [] as ExtractedHotspot[];
        pageBuf = Buffer.from(await res.arrayBuffer());
      } catch {
        return [] as ExtractedHotspot[];
      }

      const pageHits: ExtractedHotspot[] = [];
      for (const region of pageRegions) {
        const regionPhash = await phashPageRegion(pageBuf, region);
        if (!regionPhash) continue;

        // Find nearest advertiser under threshold.
        let bestAdv: AdvertiserLite | null = null;
        let bestDist = LOGO_PHASH_MAX_DISTANCE + 1;
        for (const { adv, phash } of advIndex) {
          const dist = hammingDistance(phash, regionPhash);
          if (dist < bestDist) {
            bestDist = dist;
            bestAdv = adv;
          }
        }
        if (!bestAdv || bestDist > LOGO_PHASH_MAX_DISTANCE) continue;

        const url = normalizeUrl(String(bestAdv.website));
        pageHits.push({
          page_idx: pageIdx,
          x_frac: region.x_frac,
          y_frac: region.y_frac,
          w_frac: region.w_frac,
          h_frac: region.h_frac,
          type: 'link',
          config: { type: 'link', url, open_in: 'new_tab' },
          identity: `logo:${bestAdv.id}`,
          label: `Logo · ${bestAdv.name}`,
          origin: 'logo_match',
          advertiser_id: bestAdv.id,
          advertiser_name: bestAdv.name,
        });
      }
      return pageHits;
    }));
    for (const r of results) out.push(...r);
  }

  return out;
}

// ============================================================
// Central inserter: shortener resolution + dedupe + advertiser link + DB write
// ============================================================

export interface InsertOptions {
  magazineId: number;
  adminEmail: string | null;
  advertisers: AdvertiserLite[];
  pageCount: number;
  /** If true, DELETE existing source='pdf_import' rows first. Used by the
   *  full "extract all" flow so that re-runs replace rather than accumulate.
   *  Manual rows are never touched. */
  wipeImports: boolean;
}

export interface InsertResult {
  inserted: number;
  skipped_duplicates: number;
  auto_linked_advertisers: number;
  by_origin: Record<'pdf_link' | 'text_scan' | 'qr_code' | 'logo_match', number>;
}

type SqlFn = NeonQueryFunction<false, false>;

export async function insertExtracted(
  sql: SqlFn,
  rows: ExtractedHotspot[],
  opts: InsertOptions,
): Promise<InsertResult> {
  // 1. Optionally wipe. Only source='pdf_import' — manual rows survive.
  if (opts.wipeImports) {
    await sql`
      DELETE FROM magazine_hotspots
      WHERE magazine_id = ${opts.magazineId} AND source = 'pdf_import'
    `;
  }

  // 2. Resolve any known shorteners so identity dedupe works on the real
  //    destination URL (bit.ly, tinyurl, etc.). Parallel with a bounded
  //    concurrency to keep response time predictable.
  const CONCURRENCY = 6;
  const resolved: ExtractedHotspot[] = [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const done = await Promise.all(batch.map(async (row) => {
      if (row.type !== 'link') return row;
      const url = String((row.config as { url?: string }).url ?? '');
      if (!url || !isShortenerUrl(url)) return row;
      try {
        const r = await resolveUrl(url, { maxHops: 8, timeoutMs: 5000 });
        return {
          ...row,
          config: { type: 'link', url: r.resolved, tracking_url: url, open_in: 'new_tab' },
          identity: normalizeIdentityUrl(r.resolved),
          label: labelForUrl(r.resolved),
        };
      } catch {
        return row;
      }
    }));
    resolved.push(...done);
  }

  // 3. Drop rows past the page count (defensive).
  const inRange = opts.pageCount > 0
    ? resolved.filter((r) => r.page_idx < opts.pageCount)
    : resolved;

  // 4. Advertiser match for every URL.
  for (const row of inRange) {
    if (row.type !== 'link') continue;
    const url = String((row.config as { url?: string; tracking_url?: string }).url ?? '');
    const tracking = String((row.config as { tracking_url?: string }).tracking_url ?? '');
    const matched = matchAdvertiser(url, opts.advertisers) ||
      (tracking ? matchAdvertiser(tracking, opts.advertisers) : null);
    if (matched) {
      row.advertiser_id = matched.id;
      row.advertiser_name = matched.name;
    }
  }

  // 5. Existing hotspots on this magazine → dedupe set.
  const existing = await sql`
    SELECT page_idx, type, config
    FROM magazine_hotspots
    WHERE magazine_id = ${opts.magazineId}
  ` as Array<{ page_idx: number; type: HotspotType; config: Record<string, unknown> }>;

  const existingKeys = new Set<string>();
  for (const row of existing) {
    const key = configIdentity(row.type, row.config);
    if (key) existingKeys.add(`${row.page_idx}:${row.type}:${key}`);
  }

  // 6. Insert with within-batch dedupe (same email/phone can appear on the
  //    same page in multiple text items — keep the first, drop the rest).
  const batchKeys = new Set<string>();
  const result: InsertResult = {
    inserted: 0,
    skipped_duplicates: 0,
    auto_linked_advertisers: 0,
    by_origin: { pdf_link: 0, text_scan: 0, qr_code: 0, logo_match: 0 },
  };

  for (const row of inRange) {
    const composite = `${row.page_idx}:${row.type}:${row.identity}`;
    if (existingKeys.has(composite) || batchKeys.has(composite)) {
      result.skipped_duplicates++;
      continue;
    }
    batchKeys.add(composite);

    const configJson = JSON.stringify(row.config);
    // z_index = -100 → imports naturally stack below any manual hotspot
    // (which defaults to 0) so the human's work always reads on top.
    await sql`
      INSERT INTO magazine_hotspots (
        magazine_id, page_idx,
        x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name, advertiser_id,
        is_published, source, z_index, created_by, updated_by
      ) VALUES (
        ${opts.magazineId}, ${row.page_idx},
        ${row.x_frac}, ${row.y_frac}, ${row.w_frac}, ${row.h_frac},
        ${row.type}, ${configJson}::jsonb,
        ${row.label}, ${row.advertiser_name ?? null}, ${row.advertiser_id ?? null},
        false, 'pdf_import', -100, ${opts.adminEmail}, ${opts.adminEmail}
      )
    `;
    result.inserted++;
    result.by_origin[row.origin]++;
    if (row.advertiser_id) result.auto_linked_advertisers++;
  }

  return result;
}

function configIdentity(type: HotspotType, config: Record<string, unknown>): string | null {
  if (type === 'link' || type === 'mls') {
    const url = typeof config.url === 'string' ? config.url : '';
    return url ? normalizeIdentityUrl(url) : null;
  }
  if (type === 'email') {
    const addr = typeof config.address === 'string' ? config.address : '';
    return addr ? addr.toLowerCase() : null;
  }
  if (type === 'phone') {
    const raw = typeof config.number === 'string' ? config.number : '';
    return raw ? normalizeIdentityPhone(raw) : null;
  }
  return null;
}
