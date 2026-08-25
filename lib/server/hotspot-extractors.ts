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
import { logger } from './logger';

// ============================================================
// Advertiser matching (shared across all three passes)
// ============================================================

// Domain cores we NEVER auto-match to an advertiser, even if a slug
// or website coincidentally overlaps. Publisher's own domain and the
// generic social/shortener hosts every advertiser links to.
const ADVERTISER_MATCH_SKIPLIST = [
  'realtynewsnow',
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

  // 1. Exact website match wins over slug matching. Advertisers often
  //    have branded URLs (unlockmls.com) that share nothing with their
  //    canonical slug (austin-board-of-realtors), so slug matching alone
  //    leaves those URLs orphaned.
  for (const adv of advertisers) {
    if (!adv.website) continue;
    const wc = domainCoreFromUrl(adv.website);
    if (!wc || wc.length < 5) continue;
    if (wc === dc) return adv;
  }

  // 2. Slug-based matching (substring or 6-char shared prefix).
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
// Vanity phone numbers with mnemonic letters. Common in print ads:
//   1-888-KB-HOMES   →  1-888-524-6637
//   800-FLOWERS      →  800-356-9377
//   512-CALL-BOB     →  512-225-5262   (7 alpha chars, last one padded)
// Must contain at least one letter in the local part (otherwise PHONE_RE
// already covers it). Local part is exactly 7 chars of [A-Z0-9] separated
// by any run of [\s.-] hyphens/dots/spaces. Area code follows the same
// [2-9]xx rule as PHONE_RE; leading "1-" optional. The character class
// [A-Z] is intentionally uppercase-only because case-sensitive matching
// avoids matching sentence-cased words like "Call us at 555 today".
const VANITY_PHONE_RE = /(?<![\w/])(?:1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([A-Z0-9][\s.-]?){6}[A-Z0-9](?!\w)/g;
// E.161 keypad mapping used to decode vanity letters. 1 and 0 map to
// themselves. Anything else (like Q/Z on some old phones — both are 7 or
// 9 depending on region) uses the standard US mapping: Q=7, Z=9.
const KEYPAD: Record<string, string> = {
  A: '2', B: '2', C: '2',
  D: '3', E: '3', F: '3',
  G: '4', H: '4', I: '4',
  J: '5', K: '5', L: '5',
  M: '6', N: '6', O: '6',
  P: '7', Q: '7', R: '7', S: '7',
  T: '8', U: '8', V: '8',
  W: '9', X: '9', Y: '9', Z: '9',
};
const URL_RE = /\b(?:https?:\/\/|www\.)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*(?:\.[a-zA-Z]{2,})(?:\/[^\s)]*)?\b/g;
// A bare hostname URL WITHOUT scheme/www. e.g. "stewart.com/contact". Common
// in print ads and magazines. We match these too but require a real-looking
// TLD (avoids false positives on filenames like "file.pdf" — see filter below).
const BARE_DOMAIN_RE = /(?<![@\w])[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+){0,3}\.[a-zA-Z]{2,}(?:\/[^\s)]*)?\b/g;

// TLDs we'll accept for bare-domain matches. Restricting to a curated list
// avoids matching filenames (foo.pdf, screenshot.jpg), version strings
// (v1.2.3), decimals ($1.5m), etc.
//
// This list is intentionally broad — real estate advertisers use everything
// from generic gTLDs to industry-specific (.realty, .homes, .broker) to
// vanity (.austin, .texas) domains. The false-positive risk (filenames,
// version strings) is caught downstream by the file-extension blocklist
// and the "looks like a file" check.
const BARE_DOMAIN_TLDS = new Set([
  // Common gTLDs
  'com', 'net', 'org', 'io', 'co', 'us', 'app', 'dev', 'ai', 'biz', 'info',
  'pro', 'me', 'ly', 'tv', 'club', 'store', 'shop', 'site', 'online',
  'live', 'life', 'today', 'news', 'blog', 'link', 'page', 'tech',
  // Real-estate industry gTLDs
  'realtor', 'realty', 'homes', 'house', 'properties', 'estate', 'condos',
  'apartments', 'rentals', 'lease', 'sale', 'construction', 'builders',
  'contractors', 'kitchen', 'plumbing', 'lighting', 'furniture', 'design',
  // Services / business gTLDs
  'agency', 'group', 'company', 'llc', 'team', 'partners', 'services',
  'solutions', 'consulting', 'management', 'financial', 'insurance',
  'loans', 'mortgage', 'capital', 'investments', 'bank', 'exchange',
  // Country codes commonly seen in US ads
  'ca', 'mx', 'uk', 'au',
  // Government / education / non-profit
  'gov', 'edu', 'mil',
  // Geographic new gTLDs relevant to Texas real estate
  'austin', 'texas', 'dallas', 'houston', 'nyc', 'la', 'miami', 'vegas',
]);

// Known file extensions that BARE_DOMAIN_RE will match but that must be
// rejected. The regex allows any 2+ letter TLD-like suffix, so a filename
// like "screenshot.jpg" or "contract.pdf" would be caught without this.
const FILE_EXTENSION_BLOCKLIST = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic',
  'mp3', 'mp4', 'mov', 'wav', 'avi', 'zip', 'rar', 'tar', 'gz',
  'html', 'htm', 'css', 'js', 'ts', 'json', 'xml', 'yml', 'yaml',
  'sql', 'db', 'log', 'md',
]);

function normalizePhone(m: RegExpExecArray): string {
  return `+1${m[1]}${m[2]}${m[3]}`;
}

/** Decode a vanity-phone match like "1-888-KB-HOMES" into E.164 (+18885246637).
 *  Returns null if the local part somehow contains only digits (would
 *  duplicate PHONE_RE) or doesn't yield exactly 7 keypad digits. */
function decodeVanityPhone(raw: string): string | null {
  const stripped = raw.replace(/[\s.\-()]/g, '').toUpperCase();
  // Drop optional leading "1" country code.
  const withoutCountry = stripped.startsWith('1') && stripped.length === 11
    ? stripped.slice(1)
    : stripped;
  if (withoutCountry.length !== 10) return null;
  const areaCode = withoutCountry.slice(0, 3);
  const localRaw = withoutCountry.slice(3);
  // Reject if the local part has zero letters — PHONE_RE already covers
  // all-digit numbers, and we don't want duplicates.
  if (!/[A-Z]/.test(localRaw)) return null;
  let localDigits = '';
  for (const ch of localRaw) {
    if (/[0-9]/.test(ch)) {
      localDigits += ch;
    } else if (KEYPAD[ch]) {
      localDigits += KEYPAD[ch];
    } else {
      return null;
    }
  }
  if (localDigits.length !== 7) return null;
  return `+1${areaCode}${localDigits}`;
}

/** Pretty label for a vanity phone: display as plain 10-digit hyphenated
 *  form. "1-888-KB-HOMES" → "Phone · 888-524-6637". Underlying config
 *  keeps E.164 (+18885246637) so tel: links work correctly on mobile. */
function labelForVanityPhone(_raw: string, e164: string): string {
  const digits = e164.replace(/[^0-9]/g, '').replace(/^1/, '');
  const pretty = digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    : e164;
  return `Phone · ${pretty}`;
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
  // Pretty-format E.164 back into xxx-xxx-xxxx for the label
  const digits = phone.replace(/[^0-9]/g, '').replace(/^1/, '');
  if (digits.length === 10) {
    return `Phone · ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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

        // VANITY PHONE (e.g. 1-888-KB-HOMES)
        VANITY_PHONE_RE.lastIndex = 0;
        while ((m = VANITY_PHONE_RE.exec(line.text)) !== null) {
          const raw = m[0];
          const e164 = decodeVanityPhone(raw);
          if (!e164) continue;
          const bbox = bboxForMatch(line, m.index, raw.length);
          if (!bbox) continue;
          const frac = rectToFrac(bbox.x, pageHeight - bbox.y - bbox.h, bbox.w, bbox.h, pageWidth, pageHeight);
          out.push({
            page_idx: pageNum - 1, ...frac,
            type: 'phone',
            config: { type: 'phone', number: e164 },
            identity: normalizeIdentityPhone(e164),
            label: labelForVanityPhone(raw, e164),
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
          if (FILE_EXTENSION_BLOCKLIST.has(tld)) continue;
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
// PASS 4: logo detection via Gemini vision
// ============================================================
//
// v3 (Gemini vision): earlier passes tried operator-list image extraction
// and then whitespace-projection + perceptual hash matching. Both failed
// on real magazine pages — script/cursive wordmarks (Austin Title,
// Independence Title, LaCima, Stewart, Champions School) don't survive
// dhash comparison against a differently-cropped DB avatar.
//
// v3 uses Gemini 2.5 Flash: for each page image we send the full page and
// the list of advertiser names+IDs and ask the model to return normalized
// bounding boxes for every advertiser logo it can spot on the page.
// Gemini is very good at logo/text recognition and returns coordinates in
// its standard 0..1000 normalized space (per the Gemini vision docs).
//
// Failure mode: Gemini can hallucinate boxes for advertisers that aren't
// on the page. We defend by (a) requiring the returned ID to be in the
// input list, (b) rejecting boxes with implausible aspect ratios or
// sizes, (c) rejecting boxes that overlap heavily with each other beyond
// the first per advertiser.
//
// Cost: ~1 Gemini Flash vision call per magazine page. A 20-page issue
// runs ~20 calls total.

// Gemini 2.5 Flash is the current GA stable Flash model with image input.
// Override via GEMINI_VISION_MODEL if a newer model becomes available.
const LOGO_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const LOGO_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${LOGO_MODEL}:generateContent`;

// Per-page vision call timeout. Gemini Flash typically returns in <10s
// so 25s is generous headroom. A stuck page shouldn't be able to burn
// through the extract-all function budget by hogging a worker slot.
const LOGO_TIMEOUT_MS = 25_000;

// Bound how many pages we scan in parallel. Each call is fully independent
// (page image + advertiser list in, boxes out). 8 finishes a 20-page issue
// in ~3 batches while staying well under Gemini Flash's per-minute quota.
const LOGO_PAGE_CONCURRENCY = 8;

// Reject boxes that are obviously wrong:
//   - too tiny (icon-sized fragments in body copy)
//   - full-page (Gemini occasionally returns the whole page for a
//     background watermark)
//   - extreme aspect ratio (>15:1 either way — no real logo is a hairline)
const LOGO_MIN_FRAC = 0.01;
const LOGO_MAX_FRAC = 0.6;
const LOGO_MAX_ASPECT = 15;

interface GeminiLogoBox {
  advertiser_id: number;
  /** Gemini returns coordinates in a normalized 0..1000 space, ordered
   *  [ymin, xmin, ymax, xmax]. We convert to page-space fractions. */
  box_2d: [number, number, number, number];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseGeminiLogoBoxes(raw: unknown, validIds: Set<number>): GeminiLogoBox[] {
  if (!Array.isArray(raw)) return [];
  const out: GeminiLogoBox[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = Number(r.advertiser_id);
    if (!Number.isInteger(id) || !validIds.has(id)) continue;
    const box = r.box_2d;
    if (!Array.isArray(box) || box.length !== 4) continue;
    const [a, b, c, d] = box;
    if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c) || !isFiniteNumber(d)) {
      continue;
    }
    out.push({ advertiser_id: id, box_2d: [a, b, c, d] });
  }
  return out;
}

function extractJsonArray(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf('[');
  const last = trimmed.lastIndexOf(']');
  if (first === -1 || last === -1 || last < first) return null;
  return trimmed.slice(first, last + 1);
}

function withVisionTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

/** Call Gemini for one page. Returns advertiser matches with page-space
 *  fractional coords, or [] on any failure (never throws). */
async function detectLogosOnPage(args: {
  apiKey: string;
  pageIdx: number;
  pageBase64: string;
  mimeType: string;
  advertisers: AdvertiserLite[];
}): Promise<Array<{ adv: AdvertiserLite; x_frac: number; y_frac: number; w_frac: number; h_frac: number }>> {
  const validIds = new Set(args.advertisers.map((a) => a.id));

  // The prompt names every advertiser with an ID. Gemini can't match
  // against images it hasn't seen, so we rely on the model's OCR +
  // brand-recognition + business-name matching to link a wordmark on
  // the page to an advertiser name in the list.
  const advList = args.advertisers
    .map((a) => `- id=${a.id} name="${a.name.replace(/"/g, "'")}"`)
    .join('\n');

  const systemPrompt = `You are a logo-detection service for a real-estate magazine. Given a page image and a list of advertisers, find every advertiser logo/wordmark visible on the page and return its bounding box.

You will receive:
- One page image from a print magazine.
- A list of known advertisers with numeric IDs and names.

Return ONLY a JSON array. No prose. No code fences. Each element:
  { "advertiser_id": <integer from the list>, "box_2d": [ymin, xmin, ymax, xmax] }

Coordinates MUST be in Gemini's standard 0..1000 normalized image space (0,0 = top-left, 1000,1000 = bottom-right).

Matching rules:
- Match by logo/wordmark text: e.g. a script "Austin Title" wordmark matches advertiser named "Austin Title Company".
- If a name in the ad differs slightly (missing/added "The", "Company", "Inc", "LLC", location suffixes), still match to the closest advertiser in the list.
- Return a box for EACH visible occurrence — a logo may appear multiple times on a page (sponsor strip + repeated in an ad).
- If a logo/wordmark on the page does NOT correspond to any advertiser in the provided list, do NOT return it. Only return matches to the provided list.
- If nothing matches, return an empty array [].
- Do NOT invent boxes. Do NOT return boxes for body-copy text or article headlines.
- Do NOT return a box for the magazine's own masthead or a page number.

Provided advertisers:
${advList}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Detect every advertiser logo visible on this page and return their bounding boxes as JSON.' },
          { inline_data: { mime_type: args.mimeType, data: args.pageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 4_000,
      response_mime_type: 'application/json',
    },
  };

  let res: Response;
  try {
    res = await withVisionTimeout(
      fetch(`${LOGO_ENDPOINT}?key=${encodeURIComponent(args.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      LOGO_TIMEOUT_MS,
    );
  } catch (err) {
    logger.warn(
      { pageIdx: args.pageIdx, err: err instanceof Error ? err.message : String(err) },
      '[logo-vision] fetch failed',
    );
    return [];
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '(no body)');
    logger.warn(
      { pageIdx: args.pageIdx, status: res.status, detail: detail.slice(0, 400) },
      '[logo-vision] non-2xx',
    );
    return [];
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const text =
    ((json as Record<string, unknown>)?.candidates as unknown[] | undefined)
      ?.map((c) => {
        const parts =
          ((c as Record<string, unknown>)?.content as Record<string, unknown>)
            ?.parts as unknown[] | undefined;
        return parts
          ?.map((p) => (p as Record<string, unknown>)?.text)
          .filter((t): t is string => typeof t === 'string')
          .join('');
      })
      .filter((t): t is string => typeof t === 'string')
      .join('\n') ?? '';

  if (!text) return [];

  const blob = extractJsonArray(text);
  if (!blob) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return [];
  }

  const boxes = parseGeminiLogoBoxes(parsed, validIds);
  if (boxes.length === 0) return [];

  const advById = new Map(args.advertisers.map((a) => [a.id, a] as const));

  // Convert Gemini's 0..1000 [ymin, xmin, ymax, xmax] to page-space
  // fractional [x, y, w, h], drop degenerate boxes, and enforce sanity
  // filters. Track best (largest) box per advertiser id so we don't
  // stack overlapping duplicates for the same logo occurrence.
  const bestByAdv = new Map<number, { adv: AdvertiserLite; x_frac: number; y_frac: number; w_frac: number; h_frac: number; area: number }>();

  for (const b of boxes) {
    const [rawYMin, rawXMin, rawYMax, rawXMax] = b.box_2d;
    const yMin = Math.min(rawYMin, rawYMax) / 1000;
    const yMax = Math.max(rawYMin, rawYMax) / 1000;
    const xMin = Math.min(rawXMin, rawXMax) / 1000;
    const xMax = Math.max(rawXMin, rawXMax) / 1000;
    const x = Math.max(0, Math.min(1, xMin));
    const y = Math.max(0, Math.min(1, yMin));
    const w = Math.max(0, Math.min(1 - x, xMax - xMin));
    const h = Math.max(0, Math.min(1 - y, yMax - yMin));
    if (w < LOGO_MIN_FRAC || h < LOGO_MIN_FRAC) continue;
    if (w > LOGO_MAX_FRAC && h > LOGO_MAX_FRAC) continue;
    const aspect = Math.max(w, h) / Math.max(0.001, Math.min(w, h));
    if (aspect > LOGO_MAX_ASPECT) continue;
    const adv = advById.get(b.advertiser_id);
    if (!adv) continue;
    if (!adv.website) continue;
    const area = w * h;
    const prev = bestByAdv.get(adv.id);
    if (!prev || area > prev.area) {
      bestByAdv.set(adv.id, { adv, x_frac: x, y_frac: y, w_frac: w, h_frac: h, area });
    }
  }

  return Array.from(bestByAdv.values()).map(({ adv, x_frac, y_frac, w_frac, h_frac }) => ({
    adv, x_frac, y_frac, w_frac, h_frac,
  }));
}

/** Full logo pass (v3 — Gemini vision). The `_pdfBuffer` parameter is kept
 *  so callers don't have to change; the pass runs entirely on the
 *  rendered page JPEGs. */
export async function extractLogoMatches(
  _pdfBuffer: ArrayBuffer,
  pageImageUrls: string[],
  advertisers: AdvertiserLite[],
): Promise<ExtractedHotspot[]> {
  if (pageImageUrls.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn({}, '[logo-vision] GEMINI_API_KEY unset — skipping logo pass');
    return [];
  }

  // An advertiser without a website can't produce a clickable hotspot, so
  // we filter them out of the prompt entirely — no point asking Gemini to
  // find a logo we can't act on. We keep advertisers even without an
  // avatar_url because Gemini can OCR wordmarks it's never seen before.
  const eligible = advertisers.filter((a) => a.website);
  if (eligible.length === 0) return [];

  const out: ExtractedHotspot[] = [];

  for (let i = 0; i < pageImageUrls.length; i += LOGO_PAGE_CONCURRENCY) {
    const batch = pageImageUrls.slice(i, i + LOGO_PAGE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (pageUrl, batchOffset) => {
      const pageIdx = i + batchOffset;
      if (!pageUrl) return [] as ExtractedHotspot[];

      let pageBuf: Buffer;
      try {
        const res = await fetch(pageUrl, { cache: 'no-store' });
        if (!res.ok) return [] as ExtractedHotspot[];
        pageBuf = Buffer.from(await res.arrayBuffer());
      } catch {
        return [] as ExtractedHotspot[];
      }

      // Downscale the page image before base64-encoding it — Gemini
      // charges per input token and a 3225x3600 magazine JPEG is
      // gratuitously large. 1600px on the long side is plenty for
      // logo/wordmark detection at page zoom.
      let compact: Buffer;
      const mimeType = 'image/jpeg';
      try {
        compact = await sharp(pageBuf)
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
      } catch {
        compact = pageBuf;
      }

      const matches = await detectLogosOnPage({
        apiKey,
        pageIdx,
        pageBase64: compact.toString('base64'),
        mimeType,
        advertisers: eligible,
      });

      return matches.map(({ adv, x_frac, y_frac, w_frac, h_frac }) => ({
        page_idx: pageIdx,
        x_frac, y_frac, w_frac, h_frac,
        type: 'link',
        config: { type: 'link', url: normalizeUrl(String(adv.website)), open_in: 'new_tab' },
        identity: `logo:${adv.id}`,
        label: `Logo · ${adv.name}`,
        origin: 'logo_match',
        advertiser_id: adv.id,
        advertiser_name: adv.name,
      } satisfies ExtractedHotspot));
    }));
    for (const r of batchResults) out.push(...r);
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
   *  Manual rows are never touched. Mutually exclusive with
   *  `wipeImportsForPages` — that one wins if both are set. */
  wipeImports: boolean;
  /** If set, restrict the wipe to just these page_idx values. Used by the
   *  per-page and streaming Extract-all flows so a partial run only
   *  replaces rows on the pages it processed. Empty array = no wipe. */
  wipeImportsForPages?: number[];
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
  // 1. Optionally wipe. Only source='pdf_import' — manual rows and
  //    edited-imports (source='manual', was_imported=true) both survive.
  //    Page-scoped wipe wins over the magazine-wide flag when both are set.
  if (opts.wipeImportsForPages && opts.wipeImportsForPages.length > 0) {
    const pages = opts.wipeImportsForPages;
    await sql`
      DELETE FROM magazine_hotspots
      WHERE magazine_id = ${opts.magazineId}
        AND source = 'pdf_import'
        AND page_idx = ANY(${pages}::int[])
    `;
  } else if (opts.wipeImports) {
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
    // Auto-publish logo matches only — the phash matcher already tied
    // them to a specific advertiser, so clicks route correctly on day
    // one. Text/QR/link imports stay as drafts because they still need
    // admin review to pick the right advertiser and pointer target.
    const isPublished = row.origin === 'logo_match';
    // z_index = -100 → imports naturally stack below any manual hotspot
    // (which defaults to 0) so the human's work always reads on top.
    // was_imported=true marks this row as coming from the extractor forever,
    // even after a human edit later promotes source → 'manual'. The admin
    // editor uses this to render an 'Edited' chip that distinguishes
    // edited-imports from truly hand-drawn hotspots.
    await sql`
      INSERT INTO magazine_hotspots (
        magazine_id, page_idx,
        x_frac, y_frac, w_frac, h_frac,
        type, config, label, advertiser_name, advertiser_id,
        is_published, source, was_imported, z_index, created_by, updated_by
      ) VALUES (
        ${opts.magazineId}, ${row.page_idx},
        ${row.x_frac}, ${row.y_frac}, ${row.w_frac}, ${row.h_frac},
        ${row.type}, ${configJson}::jsonb,
        ${row.label}, ${row.advertiser_name ?? null}, ${row.advertiser_id ?? null},
        ${isPublished}, 'pdf_import', TRUE, -100, ${opts.adminEmail}, ${opts.adminEmail}
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
