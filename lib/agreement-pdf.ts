// lib/agreement-pdf.ts
//
// Server-side PDF generation for Advertising Agreements.
// Uses pdf-lib. Mirrors the Pressbook generateAgreementPdf layout
// (pb_index.html line 7824 onwards).
//
// Letter size: 612 x 792 pt. Uses bundled Georgia serif fonts to mirror app UI.

import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import type { Agreement } from '@/lib/agreements';
import { TERMS_RL } from '@/lib/agreement-terms';

// Resolve bundled Georgia TTFs at lib/pdf/fonts/. Load once at module init.
const FONT_DIR = path.join(process.cwd(), 'lib', 'pdf', 'fonts');
const GEORGIA_REGULAR = fs.readFileSync(path.join(FONT_DIR, 'Georgia.ttf'));
const GEORGIA_BOLD = fs.readFileSync(path.join(FONT_DIR, 'Georgia-Bold.ttf'));
const GEORGIA_ITALIC = fs.readFileSync(path.join(FONT_DIR, 'Georgia-Italic.ttf'));

const RED = rgb(0.824, 0.145, 0.192);   // #D70E17
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);

const PW = 612;
const PH = 792;
const MARGIN = 48;
const CONTENT_W = PW - MARGIN * 2;

interface DrawCtx {
  doc: PDFDocument;
  pages: PDFPage[];
  bold: PDFFont;
  regular: PDFFont;
  italic: PDFFont;
  currentPage: number;
  y: number;
}

function currentPg(ctx: DrawCtx): PDFPage {
  return ctx.pages[ctx.currentPage];
}

function addPage(ctx: DrawCtx): void {
  const page = ctx.doc.addPage([PW, PH]);
  ctx.pages.push(page);
  ctx.currentPage = ctx.pages.length - 1;
  ctx.y = PH - MARGIN;
}

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed < MARGIN + 40) {
    addPage(ctx);
  }
}

function drawHRule(ctx: DrawCtx, x = MARGIN, width = CONTENT_W, color = LGRAY): void {
  const page = currentPg(ctx);
  page.drawLine({
    start: { x, y: ctx.y },
    end: { x: x + width, y: ctx.y },
    thickness: 0.5,
    color,
  });
}

interface TextOpts {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  x?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
}

function drawText(ctx: DrawCtx, text: string, opts: TextOpts = {}): void {
  const font = opts.font ?? ctx.regular;
  const size = opts.size ?? 10;
  const color = opts.color ?? DARK;
  const x = opts.x ?? MARGIN;
  const maxWidth = opts.maxWidth ?? CONTENT_W;

  // Word-wrap — coerce to string defensively (Date/number/etc.)
  const safeText = typeof text === 'string' ? text : String(text ?? '');
  const words = safeText.split(' ');
  let line = '';
  const lines: string[] = [];

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const w = font.widthOfTextAtSize(test, size);
    if (w > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  for (const ln of lines) {
    ensureSpace(ctx, size + 2);
    // Re-fetch the current page AFTER ensureSpace — it may have added a new page.
    const page = currentPg(ctx);
    ctx.y -= size;
    let drawX = x;
    if (opts.align === 'center') {
      const w = font.widthOfTextAtSize(ln, size);
      drawX = x + (maxWidth - w) / 2;
    } else if (opts.align === 'right') {
      const w = font.widthOfTextAtSize(ln, size);
      drawX = x + maxWidth - w;
    }
    page.drawText(ln, { x: drawX, y: ctx.y, font, size, color });
    ctx.y -= 2;
  }
}

function drawSectionHeader(ctx: DrawCtx, title: string): void {
  ensureSpace(ctx, 28);
  ctx.y -= 10;
  drawHRule(ctx, MARGIN, CONTENT_W, LGRAY);
  ctx.y -= 14;
  drawText(ctx, title.toUpperCase(), { font: ctx.bold, size: 8, color: GRAY });
  ctx.y -= 6;
}

function drawLabelValue(
  ctx: DrawCtx,
  label: string,
  value: string | number | Date | null | undefined,
  x = MARGIN,
  colW = CONTENT_W,
): void {
  if (value == null || value === '') return;
  // Coerce to string defensively — Postgres date columns come back as Date objects,
  // numeric columns can come back as numbers, etc.
  const safeValue =
    value instanceof Date
      ? value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : typeof value === 'string'
      ? value
      : String(value);
  if (!safeValue) return;
  const size = 9;
  ensureSpace(ctx, size + 4);
  ctx.y -= size;
  const labelW = ctx.bold.widthOfTextAtSize(`${label}: `, size);
  // Re-fetch page AFTER ensureSpace (it may have added a new page).
  currentPg(ctx).drawText(`${label}: `, { x, y: ctx.y, font: ctx.bold, size, color: GRAY });
  // Value may need wrapping
  const valueMaxW = colW - labelW;
  const valueX = x + labelW;
  const words = safeValue.split(' ');
  let line = '';
  let firstLine = true;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const w = ctx.regular.widthOfTextAtSize(test, size);
    const maxW = firstLine ? valueMaxW : colW;
    if (w > maxW && line) {
      currentPg(ctx).drawText(line, { x: firstLine ? valueX : x, y: ctx.y, font: ctx.regular, size, color: DARK });
      ensureSpace(ctx, size + 2);
      ctx.y -= size + 2;
      line = word;
      firstLine = false;
    } else {
      line = test;
    }
  }
  if (line) {
    currentPg(ctx).drawText(line, { x: firstLine ? valueX : x, y: ctx.y, font: ctx.regular, size, color: DARK });
  }
  ctx.y -= 3;
}

function fmt$(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function humanDate(iso: string | Date | null | undefined): string {
  if (iso == null) return '—';
  // Postgres `date` columns come back from @neondatabase/serverless as Date objects.
  if (iso instanceof Date) {
    return iso.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  const s = typeof iso === 'string' ? iso : String(iso);
  if (!s) return '—';
  try {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return s; }
}

export async function generateAgreementPdfBuffer(ag: Agreement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bold = await doc.embedFont(GEORGIA_BOLD);
  const regular = await doc.embedFont(GEORGIA_REGULAR);
  const italic = await doc.embedFont(GEORGIA_ITALIC);

  const firstPage = doc.addPage([PW, PH]);
  const ctx: DrawCtx = {
    doc,
    pages: [firstPage],
    bold,
    regular,
    italic,
    currentPage: 0,
    y: PH,
  };

  // ─── Page 1 Header ──────────────────────────────────────────────────────────
  const page = currentPg(ctx);

  // Red accent bar
  page.drawRectangle({ x: 0, y: PH - 72, width: PW, height: 72, color: RED });
  page.drawText('RealtyLine Austin', {
    x: MARGIN, y: PH - 44,
    font: bold, size: 22, color: WHITE,
  });
  page.drawText('ADVERTISING AGREEMENT', {
    x: PW - MARGIN - bold.widthOfTextAtSize('ADVERTISING AGREEMENT', 11),
    y: PH - 44,
    font: bold, size: 11, color: WHITE,
  });

  ctx.y = PH - 88;

  // Agreement ID + date
  drawText(ctx, `Agreement ID: ${ag.id}`, { font: regular, size: 8, color: GRAY, align: 'right', x: MARGIN });
  const now = new Date();
  drawText(ctx, `Generated: ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, {
    font: regular, size: 8, color: GRAY, align: 'right', x: MARGIN,
  });

  ctx.y -= 4;

  // ─── Publisher + Advertiser side-by-side ────────────────────────────────────
  const halfW = (CONTENT_W - 20) / 2;

  ensureSpace(ctx, 80);
  const twoColY = ctx.y;

  // Publisher block
  currentPg(ctx).drawText('PUBLISHER', { x: MARGIN, y: twoColY, font: bold, size: 8, color: GRAY });
  const pubLines = [
    'RealtyLine Austin',
    'Caxton Publications Inc.',
    'P.O. Box 81366',
    'Austin, Texas 78708-1366',
    'tawanna@myrealtyline.com',
  ];
  let py = twoColY - 12;
  for (const ln of pubLines) {
    currentPg(ctx).drawText(ln, { x: MARGIN, y: py, font: regular, size: 9, color: DARK });
    py -= 12;
  }

  // Advertiser block
  const ax = MARGIN + halfW + 20;
  currentPg(ctx).drawText('ADVERTISER', { x: ax, y: twoColY, font: bold, size: 8, color: GRAY });
  const advLines = [
    ag.company_name ?? '—',
    ag.rep_name ?? '',
    [ag.address, ag.city, ag.state, ag.zip].filter(Boolean).join(', ') || '',
    ag.advertiser_email ?? '',
    ag.advertiser_phone ?? '',
  ].filter(Boolean);
  let ay = twoColY - 12;
  for (const ln of advLines) {
    currentPg(ctx).drawText(ln, { x: ax, y: ay, font: regular, size: 9, color: DARK });
    ay -= 12;
  }

  ctx.y = Math.min(py, ay) - 8;

  // ─── Insertion Order ────────────────────────────────────────────────────────
  drawSectionHeader(ctx, 'Insertion Order');

  drawLabelValue(ctx, 'Ad Size', ag.ad_size);
  drawLabelValue(ctx, 'Frequency', ag.frequency);

  // Ad timing months
  if (ag.ad_timing_months && Object.keys(ag.ad_timing_months).length > 0) {
    const months = Object.entries(ag.ad_timing_months)
      .filter(([, y]) => y)
      .map(([m, y]) => `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`);
    if (months.length > 0) {
      drawLabelValue(ctx, 'Ad Timing', months.join(' · '));
    }
  }

  drawLabelValue(ctx, 'Ad Rate', fmt$(ag.ad_rate_cents));
  if (ag.discount_cents) drawLabelValue(ctx, 'Discount', fmt$(ag.discount_cents));
  if (ag.ad_premium_cents) drawLabelValue(ctx, 'Page Position Premium', fmt$(ag.ad_premium_cents));
  if (ag.total_monthly_rate_cents) drawLabelValue(ctx, 'Total Monthly Rate', fmt$(ag.total_monthly_rate_cents));
  if (ag.page_position) drawLabelValue(ctx, 'Page Position', ag.page_position);
  if (ag.exp_date) drawLabelValue(ctx, 'Agreement Expiration', humanDate(ag.exp_date));

  // ─── Billing ────────────────────────────────────────────────────────────────
  drawSectionHeader(ctx, 'Billing & Payment');

  drawLabelValue(ctx, 'Bill To', ag.bill_to);
  drawLabelValue(ctx, 'Billing Email', ag.billing_email);
  drawLabelValue(ctx, 'Billing Contact', ag.billing_contact_name);
  drawLabelValue(ctx, 'Billing Phone', ag.billing_contact_phone);

  const paymentType = ag.card_type ? 'Credit Card' : 'Check';
  drawLabelValue(ctx, 'Payment Type', paymentType);
  if (ag.card_type) {
    drawLabelValue(ctx, 'Card Type', ag.card_type);
    if (ag.cardholder_name) drawLabelValue(ctx, 'Cardholder', ag.cardholder_name);
    if (ag.card_number_last4) drawLabelValue(ctx, 'Card Last 4', ag.card_number_last4);
    if (ag.card_expiration) drawLabelValue(ctx, 'Card Exp', ag.card_expiration);
  }

  // ─── Terms & Conditions ─────────────────────────────────────────────────────
  drawSectionHeader(ctx, 'Terms & Conditions');

  const termsLines = TERMS_RL.split('\n');
  for (const ln of termsLines) {
    const trimmed = ln.trim();
    if (!trimmed) {
      ctx.y -= 5;
      continue;
    }
    const isHeader = /^[A-Z][A-Z\s&]{4,}$/.test(trimmed) || /^\d+\./.test(trimmed);
    drawText(ctx, trimmed, {
      font: isHeader ? bold : regular,
      size: 7.5,
      color: isHeader ? DARK : GRAY,
      maxWidth: CONTENT_W,
    });
  }

  // ─── Acceptance / Signature ─────────────────────────────────────────────────
  drawSectionHeader(ctx, 'Agreement Acceptance');

  if (ag.signer_name) {
    drawLabelValue(ctx, 'Signed by', ag.signer_name);
    drawLabelValue(ctx, 'Signed on', ag.signed_at ? humanDate(ag.signed_at) : '—');
    drawLabelValue(ctx, 'Terms accepted', ag.terms_accepted ? 'Yes — Digitally signed' : 'No');

    // ── Signature visualization ───────────────────────────────────────────
    // - Typed signature        : ag.signer_name in cursive on a sig line
    // - Drawn signature (PNG)  : ag.signed_document URL, is_uploaded=false
    // - Uploaded signed doc    : ag.signed_document URL, is_uploaded=true
    const sigUrl = (ag.signed_document ?? '').trim();
    const isUploadedDoc = !!ag.is_uploaded;
    const isDrawnPng = !!sigUrl && !isUploadedDoc && /\.png(\?|$)/i.test(sigUrl);

    if (isDrawnPng) {
      // Embed the drawn signature as a PNG above a sig line.
      try {
        const r = await fetch(sigUrl);
        if (r.ok) {
          const bytes = new Uint8Array(await r.arrayBuffer());
          const img = await ctx.doc.embedPng(bytes);
          // Scale so the image fits in a 200x55 box, preserving aspect ratio.
          const maxW = 200;
          const maxH = 55;
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const drawW = img.width * scale;
          const drawH = img.height * scale;

          ensureSpace(ctx, drawH + 30);
          ctx.y -= 8;
          const imgY = ctx.y - drawH;
          currentPg(ctx).drawImage(img, {
            x: MARGIN,
            y: imgY,
            width: drawW,
            height: drawH,
          });
          // Signature line beneath the drawing.
          const lineY = imgY - 4;
          currentPg(ctx).drawLine({
            start: { x: MARGIN, y: lineY },
            end: { x: MARGIN + 240, y: lineY },
            thickness: 0.75,
            color: DARK,
          });
          currentPg(ctx).drawText('Advertiser Signature', {
            x: MARGIN, y: lineY - 11, font: regular, size: 8, color: GRAY,
          });
          ctx.y = lineY - 24;
        } else {
          drawLabelValue(ctx, 'Signature', 'On file (see signed document link)');
        }
      } catch {
        drawLabelValue(ctx, 'Signature', 'On file (see signed document link)');
      }
    } else if (sigUrl && isUploadedDoc) {
      // Uploaded pre-signed document: note + URL.
      drawLabelValue(ctx, 'Signed document', 'Uploaded by advertiser');
      drawText(ctx, sigUrl, { font: regular, size: 8, color: GRAY, maxWidth: CONTENT_W });
      ctx.y -= 4;
    } else {
      // Typed signature — render the name in italic on a sig line.
      ensureSpace(ctx, 50);
      ctx.y -= 8;
      const sigBaselineY = ctx.y - 18;
      currentPg(ctx).drawText(ag.signer_name, {
        x: MARGIN + 6,
        y: sigBaselineY + 4,
        font: italic,
        size: 18,
        color: DARK,
      });
      const lineY = sigBaselineY - 2;
      currentPg(ctx).drawLine({
        start: { x: MARGIN, y: lineY },
        end: { x: MARGIN + 240, y: lineY },
        thickness: 0.75,
        color: DARK,
      });
      currentPg(ctx).drawText('Advertiser Signature (typed)', {
        x: MARGIN, y: lineY - 11, font: regular, size: 8, color: GRAY,
      });
      ctx.y = lineY - 24;
    }
  } else {
    ensureSpace(ctx, 60);
    ctx.y -= 8;
    const sigLineY = ctx.y;
    currentPg(ctx).drawLine({
      start: { x: MARGIN, y: sigLineY },
      end: { x: MARGIN + 200, y: sigLineY },
      thickness: 0.75, color: DARK,
    });
    currentPg(ctx).drawText('Advertiser Signature', {
      x: MARGIN, y: sigLineY - 12, font: regular, size: 8, color: GRAY,
    });
    currentPg(ctx).drawLine({
      start: { x: MARGIN + 240, y: sigLineY },
      end: { x: MARGIN + 340, y: sigLineY },
      thickness: 0.75, color: DARK,
    });
    currentPg(ctx).drawText('Date', {
      x: MARGIN + 240, y: sigLineY - 12, font: regular, size: 8, color: GRAY,
    });
    ctx.y = sigLineY - 28;
  }

  ctx.y -= 12;
  ensureSpace(ctx, 20);
  drawText(ctx, 'By signing above, Advertiser agrees to all terms and conditions set forth in this Agreement.', {
    font: italic, size: 8, color: GRAY,
  });

  // ─── Footer on every page ───────────────────────────────────────────────────
  const totalPages = ctx.pages.length;
  for (let i = 0; i < totalPages; i++) {
    const pg = ctx.pages[i];
    pg.drawLine({
      start: { x: MARGIN, y: 36 },
      end: { x: PW - MARGIN, y: 36 },
      thickness: 0.5, color: LGRAY,
    });
    pg.drawText(`RealtyLine Austin · Caxton Publications Inc. · Page ${i + 1} of ${totalPages}`, {
      x: MARGIN, y: 22,
      font: regular, size: 7.5, color: GRAY,
    });
    pg.drawText('realtynewsnow.app', {
      x: PW - MARGIN - regular.widthOfTextAtSize('realtynewsnow.app', 7.5),
      y: 22,
      font: regular, size: 7.5, color: GRAY,
    });
  }

  return doc.save();
}
