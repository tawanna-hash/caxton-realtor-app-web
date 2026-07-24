// lib/pdf/builder-pdf.ts
//
// Server-side PDF generation for builder / community downloads.
// Uses pdf-lib (already a dep) so we don't need a headless browser at
// runtime — stays fully serverless-friendly on Vercel.
//
// The output is a clean text + tabular summary of the rows. Photos are
// intentionally omitted: pulling and re-embedding remote images at PDF
// generation time would balloon both bandwidth and cold-start latency,
// and the public-facing site already hosts the visual catalog. The PDF
// is meant as a take-home / share-with-client reference.

import { PDFDocument, StandardFonts, rgb, PDFString, type PDFFont, type PDFPage } from 'pdf-lib';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';

// ─── Layout constants (US Letter, 1/2" margins) ──────────────────────────
const PAGE_W = 612;     // 8.5"
const PAGE_H = 792;     // 11"
const MARGIN = 36;      // 0.5"
const CONTENT_W = PAGE_W - MARGIN * 2;

// Color tokens (mirror the app's gray-700 / gray-900 / gray-500 feel)
const C_TITLE = rgb(0.10, 0.10, 0.12);
const C_BODY  = rgb(0.25, 0.27, 0.30);
const C_MUTED = rgb(0.50, 0.52, 0.55);
const C_RULE  = rgb(0.85, 0.86, 0.88);
const C_EYEBROW = rgb(0.40, 0.42, 0.45);
const C_LINK  = rgb(0.12, 0.36, 0.86); // clickable listing URL

// ─── Format helpers ──────────────────────────────────────────────────────
function fmtPrice(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const f = (n: number) => `$${Math.round(n / 1000).toLocaleString()}k`;
  if (min != null && max != null && min !== max) return `${f(min)} – ${f(max)}`;
  return f((min ?? max) as number);
}

function fmtRange(min: number | null, max: number | null, suffix = ''): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}${suffix}`;
  return `${(min ?? max)}${suffix}`;
}

function fmtSqft(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const f = (n: number) => n.toLocaleString();
  if (min != null && max != null && min !== max) return `${f(min)}–${f(max)} sqft`;
  return `${f((min ?? max) as number)} sqft`;
}

// pdf-lib's StandardFonts use WinAnsi encoding, which can't represent
// many Unicode code points — e.g. the non-breaking hyphen U+2011 that shows
// up in builder/row data. Any such char throws "WinAnsi cannot encode" at
// draw time and 500s the whole PDF route. Normalize to WinAnsi-safe
// (ASCII + Latin-1) before every drawText / widthOfTextAtSize call.
function sanitizePdfText(input: unknown): string {
  if (input == null) return '';
  return String(input)
    .replace(/\u00AD/g, '') // soft hyphen
    .replace(/[\u2010\u2011]/g, '-') // hyphen / non-breaking hyphen
    .replace(/[\u2013\u2014]/g, '-') // en dash / em dash
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '?');
}

// ─── Word-wrap a string into lines that fit `maxWidth` ───────────────────
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const src = sanitizePdfText(text);
  const words = src.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Page cursor — handles auto-pagination ───────────────────────────────
type Ctx = {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  page: PDFPage;
  y: number;
  pageNum: number;
};

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  ctx.pageNum += 1;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 24 /* footer */) {
    newPage(ctx);
  }
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: {
    size: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    lineGap?: number;
  },
): void {
  const font = opts.font ?? ctx.font;
  const size = opts.size;
  const color = opts.color ?? C_BODY;
  const indent = opts.indent ?? 0;
  const lineGap = opts.lineGap ?? 2;

  const lines = wrapText(text, font, size, CONTENT_W - indent);
  for (const line of lines) {
    ensureSpace(ctx, size + lineGap);
    ctx.page.drawText(line, {
      x: MARGIN + indent,
      y: ctx.y - size,
      font,
      size,
      color,
    });
    ctx.y -= size + lineGap;
  }
}

function drawRule(ctx: Ctx, color = C_RULE): void {
  ensureSpace(ctx, 8);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 4 },
    end:   { x: MARGIN + CONTENT_W, y: ctx.y - 4 },
    thickness: 0.5,
    color,
  });
  ctx.y -= 10;
}

function gap(ctx: Ctx, h: number): void {
  ctx.y -= h;
}

// ─── Listing URL helpers ─────────────────────────────────────────────────
// Mirrors BuilderInventoryRowCard's link resolution: prefer a non-PDF
// sourceUrl, else fall back to a non-PDF flyerPdfUrl (David Weekley stores
// the per-home listing URL there; Giddens stores the /homes/ page). PDFs are
// excluded so a flyer PDF never becomes a web link.
function isWebUrl(u: string | null | undefined): u is string {
  return !!u && !u.toLowerCase().endsWith('.pdf');
}
function resolveListingUrl(row: BuilderInventoryRow): string | null {
  return isWebUrl(row.sourceUrl) ? row.sourceUrl : isWebUrl(row.flyerPdfUrl) ? row.flyerPdfUrl : null;
}

// Draw a clickable hyperlink: blue text + an invisible Link annotation
// rectangle over it (pdf-lib origin is bottom-left). The display text is
// truncated to fit the content width; the annotation always points at the
// full URL.
function drawLink(ctx: Ctx, url: string): void {
  const size = 8;
  const lineGap = 2;
  ensureSpace(ctx, size + lineGap);
  const maxWidth = CONTENT_W;
  let display = sanitizePdfText(url);
  if (ctx.font.widthOfTextAtSize(display, size) > maxWidth) {
    while (display.length > 1 && ctx.font.widthOfTextAtSize(`${display}…`, size) > maxWidth) {
      display = display.slice(0, -1);
    }
    display = `${display}…`;
  }
  const w = ctx.font.widthOfTextAtSize(display, size);
  const x = MARGIN;
  const baseline = ctx.y - size;
  ctx.page.drawText(display, { x, y: baseline, font: ctx.font, size, color: C_LINK });
  const annotRef = ctx.doc.context.register(
    ctx.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, baseline - 1, x + w, baseline + size + 1],
      Border: { W: 0 },
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
  ctx.page.node.addAnnot(annotRef);
  ctx.y -= size + lineGap;
}

// ─── Row block — one inventory/community row ─────────────────────────────
function drawRow(ctx: Ctx, row: BuilderInventoryRow, opts: { showBuilder: boolean }): void {
  // Pre-compute line count to keep a row together on one page when possible.
  ensureSpace(ctx, 80);

  // Title line
  drawText(ctx, row.title, {
    size: 11,
    font: ctx.fontBold,
    color: C_TITLE,
  });

  // Secondary line — builder · city, state · kind
  const segs: string[] = [];
  if (opts.showBuilder) segs.push(row.builderName);
  if (row.city) segs.push(`${row.city}${row.state ? `, ${row.state}` : ''}`);
  if (row.kind === 'promotion') segs.push('Promotion');
  else if (row.homeType === 'community') segs.push('Community');
  else segs.push('Move-in Ready');
  if (segs.length > 0) {
    drawText(ctx, segs.join(' · '), {
      size: 9,
      color: C_MUTED,
    });
  }

  // Stats line — beds / baths / sqft / price
  const stats: string[] = [];
  const beds = fmtRange(row.bedsMin, row.bedsMax, ' BR');
  const baths = fmtRange(row.bathsMin, row.bathsMax, ' BA');
  const sqft = fmtSqft(row.sqftMin, row.sqftMax);
  const price = fmtPrice(row.priceMin, row.priceMax);
  if (beds) stats.push(beds);
  if (baths) stats.push(baths);
  if (sqft) stats.push(sqft);
  if (price) stats.push(price);
  if (stats.length > 0) {
    drawText(ctx, stats.join('  ·  '), {
      size: 9,
      color: C_BODY,
    });
  }

  // Address (move-in homes only — communities don't have street addresses)
  if (row.address && row.homeType !== 'community') {
    drawText(ctx, row.address, { size: 9, color: C_BODY });
  }

  // Description — short, only first ~2 lines worth
  if (row.description) {
    const trimmed = row.description.replace(/\s+/g, ' ').trim();
    const snippet = trimmed.length > 220 ? `${trimmed.slice(0, 217)}…` : trimmed;
    drawText(ctx, snippet, { size: 9, color: C_BODY, lineGap: 3 });
  }

  // Live link to the listing on the builder's site (clickable annotation).
  const listingUrl = resolveListingUrl(row);
  if (listingUrl) {
    drawLink(ctx, listingUrl);
  }

  gap(ctx, 6);
  drawRule(ctx);
}

// ─── Header block ────────────────────────────────────────────────────────
function drawHeader(
  ctx: Ctx,
  opts: { eyebrow: string; title: string; subtitle?: string },
): void {
  drawText(ctx, opts.eyebrow.toUpperCase(), {
    size: 8,
    font: ctx.fontBold,
    color: C_EYEBROW,
  });
  gap(ctx, 2);
  drawText(ctx, opts.title, {
    size: 20,
    font: ctx.fontBold,
    color: C_TITLE,
  });
  if (opts.subtitle) {
    gap(ctx, 2);
    drawText(ctx, opts.subtitle, { size: 10, color: C_BODY });
  }
  gap(ctx, 10);
  drawRule(ctx);
  gap(ctx, 4);
}

function drawFooter(ctx: Ctx, label: string): void {
  // Footer drawn directly — no auto-paginate.
  const text = sanitizePdfText(`${label}  ·  Page ${ctx.pageNum}`);
  const width = ctx.font.widthOfTextAtSize(text, 8);
  ctx.page.drawText(text, {
    x: PAGE_W - MARGIN - width,
    y: MARGIN / 2,
    font: ctx.font,
    size: 8,
    color: C_MUTED,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────

export type BuilderPdfInput = {
  builderName: string;
  publication: 'realtyline' | 'newsline' | 'both';
  rows: BuilderInventoryRow[];
};

export async function generateBuilderPdf(input: BuilderPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc, font, fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pageNum: 1,
  };

  const communities = input.rows.filter((r) => r.homeType === 'community');
  const moveIn = input.rows.filter((r) => r.homeType !== 'community' && r.kind === 'listing');
  const promos = input.rows.filter((r) => r.kind === 'promotion');

  const parts: string[] = [];
  if (communities.length > 0) parts.push(`${communities.length} ${communities.length === 1 ? 'community' : 'communities'}`);
  if (moveIn.length > 0) parts.push(`${moveIn.length} move-in ${moveIn.length === 1 ? 'home' : 'homes'}`);
  if (promos.length > 0) parts.push(`${promos.length} ${promos.length === 1 ? 'promotion' : 'promotions'}`);

  drawHeader(ctx, {
    eyebrow: 'Advertisers · Builder & Developer',
    title: input.builderName,
    subtitle: parts.length > 0 ? parts.join('  ·  ') : 'No active listings',
  });

  const sections: Array<{ label: string; rows: BuilderInventoryRow[] }> = [
    { label: 'New Home Communities', rows: communities },
    { label: 'Move-in Ready Homes', rows: moveIn },
    { label: 'Promotions', rows: promos },
  ];

  for (const section of sections) {
    if (section.rows.length === 0) continue;
    ensureSpace(ctx, 40);
    drawText(ctx, `${section.label.toUpperCase()}  (${section.rows.length})`, {
      size: 10,
      font: ctx.fontBold,
      color: C_TITLE,
    });
    gap(ctx, 6);
    for (const row of section.rows) {
      drawRow(ctx, row, { showBuilder: false });
    }
    gap(ctx, 8);
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const text = `Realty News Now  ·  ${input.builderName}  ·  Page ${i + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(sanitizePdfText(text), 8);
    p.drawText(sanitizePdfText(text), {
      x: PAGE_W - MARGIN - width,
      y: MARGIN / 2,
      font,
      size: 8,
      color: C_MUTED,
    });
  });

  // Silence "drawFooter unused" — keep helper for future use.
  void drawFooter;

  return await doc.save();
}

export type CommunitiesPdfInput = {
  rows: BuilderInventoryRow[];
};

export async function generateCommunitiesPdf(
  input: CommunitiesPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc, font, fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pageNum: 1,
  };

  const communities = input.rows.filter((r) => r.homeType === 'community');

  // Group by builder
  const groups = new Map<string, BuilderInventoryRow[]>();
  for (const row of communities) {
    const list = groups.get(row.builderName) ?? [];
    list.push(row);
    groups.set(row.builderName, list);
  }
  const byBuilder = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  drawHeader(ctx, {
    eyebrow: 'Advertisers · Builders & Developers',
    title: 'New Home Communities',
    subtitle: `${communities.length} ${communities.length === 1 ? 'community' : 'communities'} from ${byBuilder.length} ${byBuilder.length === 1 ? 'builder' : 'builders'}`,
  });

  for (const [builder, rows] of byBuilder) {
    ensureSpace(ctx, 40);
    drawText(ctx, `${builder.toUpperCase()}  (${rows.length})`, {
      size: 10,
      font: ctx.fontBold,
      color: C_TITLE,
    });
    gap(ctx, 6);
    for (const row of rows) {
      drawRow(ctx, row, { showBuilder: false });
    }
    gap(ctx, 8);
  }

  // Page footers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const text = `Realty News Now  ·  New Home Communities  ·  Page ${i + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(sanitizePdfText(text), 8);
    p.drawText(sanitizePdfText(text), {
      x: PAGE_W - MARGIN - width,
      y: MARGIN / 2,
      font,
      size: 8,
      color: C_MUTED,
    });
  });

  return await doc.save();
}

// ─── Inventory (move-in homes + promotions across all builders) ──────────

export type InventoryPdfInput = {
  rows: BuilderInventoryRow[];
};

export async function generateInventoryPdf(
  input: InventoryPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc, font, fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pageNum: 1,
  };

  // Inventory page surfaces move-in ready homes + promotions across
  // every builder. Communities are not included (they live on a
  // separate destination).
  const moveIn = input.rows.filter((r) => r.homeType !== 'community' && r.kind === 'listing');
  const promos = input.rows.filter((r) => r.kind === 'promotion');

  // Group both sections by builder for readability.
  function groupByBuilder(rows: BuilderInventoryRow[]): Array<[string, BuilderInventoryRow[]]> {
    const m = new Map<string, BuilderInventoryRow[]>();
    for (const r of rows) {
      const list = m.get(r.builderName) ?? [];
      list.push(r);
      m.set(r.builderName, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  const builders = new Set<string>();
  for (const r of [...moveIn, ...promos]) builders.add(r.builderName);

  const parts: string[] = [];
  if (moveIn.length > 0) parts.push(`${moveIn.length} move-in ${moveIn.length === 1 ? 'home' : 'homes'}`);
  if (promos.length > 0) parts.push(`${promos.length} ${promos.length === 1 ? 'promotion' : 'promotions'}`);
  if (builders.size > 0) parts.push(`${builders.size} ${builders.size === 1 ? 'builder' : 'builders'}`);

  drawHeader(ctx, {
    eyebrow: 'Advertisers · Builders & Developers',
    title: 'Inventory & Promotions',
    subtitle: parts.length > 0 ? parts.join('  ·  ') : 'No active listings',
  });

  const sections: Array<{ label: string; rows: BuilderInventoryRow[] }> = [
    { label: 'Move-in Ready Homes', rows: moveIn },
    { label: 'Promotions', rows: promos },
  ];

  for (const section of sections) {
    if (section.rows.length === 0) continue;
    ensureSpace(ctx, 40);
    drawText(ctx, `${section.label.toUpperCase()}  (${section.rows.length})`, {
      size: 12,
      font: ctx.fontBold,
      color: C_TITLE,
    });
    gap(ctx, 8);
    for (const [builder, rows] of groupByBuilder(section.rows)) {
      ensureSpace(ctx, 30);
      drawText(ctx, `${builder.toUpperCase()}  (${rows.length})`, {
        size: 10,
        font: ctx.fontBold,
        color: C_TITLE,
      });
      gap(ctx, 6);
      for (const row of rows) {
        drawRow(ctx, row, { showBuilder: false });
      }
      gap(ctx, 6);
    }
    gap(ctx, 8);
  }

  // Page footers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const text = `Realty News Now  ·  Inventory & Promotions  ·  Page ${i + 1} of ${pages.length}`;
    const width = font.widthOfTextAtSize(sanitizePdfText(text), 8);
    p.drawText(sanitizePdfText(text), {
      x: PAGE_W - MARGIN - width,
      y: MARGIN / 2,
      font,
      size: 8,
      color: C_MUTED,
    });
  });

  return await doc.save();
}
