// lib/insertion-order-pdf.ts
//
// Server-side PDF renderer for Insertion Orders.
// Single-page compact letter (612 x 792). Purple hero band, Inter body,
// line-items table, terms block, signature line.
//
// Palette pulled from app/globals.css --rnn-purple-* + neutrals.
// Fonts: bundled Inter (Regular / SemiBold / Bold) — see lib/pdf/fonts/.

import { PDFDocument, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { AD_CHANNEL_LABEL, type AdChannel } from '@/lib/ad-channels';
import {
  IO_STATUS_LABEL,
  type InsertionOrder,
  type IoLineItem,
} from '@/lib/insertion-orders';

const FONT_DIR = path.join(process.cwd(), 'lib', 'pdf', 'fonts');
const INTER_REGULAR = fs.readFileSync(path.join(FONT_DIR, 'Inter-Regular.ttf'));
const INTER_SEMIBOLD = fs.readFileSync(path.join(FONT_DIR, 'Inter-SemiBold.ttf'));
const INTER_BOLD = fs.readFileSync(path.join(FONT_DIR, 'Inter-Bold.ttf'));

// RNN palette
const PURPLE_700 = rgb(0x5a / 255, 0x0e / 255, 0x5f / 255); // #5a0e5f app plum (brand)
const PURPLE_100 = rgb(0xf1 / 255, 0xe1 / 255, 0xf2 / 255); // #f1e1f2
const TEXT_DARK  = rgb(0x11 / 255, 0x18 / 255, 0x27 / 255); // #111827
const TEXT_MUTED = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255); // #6b7280
const BORDER     = rgb(0xe5 / 255, 0xe7 / 255, 0xeb / 255); // #e5e7eb
const SURFACE    = rgb(0xf3 / 255, 0xf4 / 255, 0xf6 / 255); // #f3f4f6
const WHITE      = rgb(1, 1, 1);

const PW = 612;
const PH = 792;
const MARGIN = 48;
const CONTENT_W = PW - MARGIN * 2;

interface DrawCtx {
  page: PDFPage;
  regular: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
  y: number;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; font?: PDFFont; color?: RGB } = {},
): void {
  const { size = 10, font = ctx.regular, color = TEXT_DARK } = opts;
  ctx.page.drawText(text, { x, y, size, font, color });
}

function drawRect(
  ctx: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
): void {
  ctx.page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawHRule(ctx: DrawCtx, y: number, color: RGB = BORDER): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y },
    end:   { x: PW - MARGIN, y },
    thickness: 0.6,
    color,
  });
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Right-align a text string within a box of width `w` ending at rightX.
function drawTextRight(
  ctx: DrawCtx,
  text: string,
  rightX: number,
  y: number,
  opts: { size?: number; font?: PDFFont; color?: RGB } = {},
): void {
  const { size = 10, font = ctx.regular } = opts;
  const w = font.widthOfTextAtSize(text, size);
  drawText(ctx, text, rightX - w, y, opts);
}

export interface InsertionOrderPdfInput {
  io: InsertionOrder;
  advertiserName: string;
  advertiserEmail?: string | null;
  advertiserPhone?: string | null;
}

export async function generateInsertionOrderPdfBuffer(
  input: InsertionOrderPdfInput,
): Promise<Uint8Array> {
  const { io, advertiserName, advertiserEmail, advertiserPhone } = input;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(INTER_REGULAR, { subset: true });
  const semibold = await doc.embedFont(INTER_SEMIBOLD, { subset: true });
  const bold = await doc.embedFont(INTER_BOLD, { subset: true });

  const page = doc.addPage([PW, PH]);
  const ctx: DrawCtx = { page, regular, semibold, bold, y: PH };

  // ── HERO BAND ────────────────────────────────────────────────────────
  const heroH = 110;
  drawRect(ctx, 0, PH - heroH, PW, heroH, PURPLE_700);

  // Wordmark
  drawText(ctx, 'REALTY NEWS NOW', MARGIN, PH - 38, {
    size: 11,
    font: bold,
    color: WHITE,
  });
  drawText(ctx, 'realtynewsnow.app', MARGIN, PH - 52, {
    size: 8,
    color: rgb(1, 1, 1),
  });

  // Doc type label (top right)
  drawTextRight(ctx, 'INSERTION ORDER', PW - MARGIN, PH - 38, {
    size: 10,
    font: semibold,
    color: WHITE,
  });
  drawTextRight(ctx, io.io_number, PW - MARGIN, PH - 54, {
    size: 20,
    font: bold,
    color: WHITE,
  });

  // Status pill (bottom-right of hero)
  const statusLabel = IO_STATUS_LABEL[io.status].toUpperCase();
  const statusW = bold.widthOfTextAtSize(statusLabel, 8) + 12;
  drawRect(ctx, PW - MARGIN - statusW, PH - heroH + 14, statusW, 16, PURPLE_100);
  drawText(ctx, statusLabel, PW - MARGIN - statusW + 6, PH - heroH + 19, {
    size: 8,
    font: bold,
    color: PURPLE_700,
  });

  // ── ADVERTISER BLOCK ─────────────────────────────────────────────────
  let y = PH - heroH - 28;
  drawText(ctx, 'ADVERTISER', MARGIN, y, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  drawText(ctx, 'FLIGHT', PW / 2, y, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  y -= 14;
  drawText(ctx, advertiserName || '—', MARGIN, y, {
    size: 13,
    font: semibold,
    color: TEXT_DARK,
  });
  const flightRange = `${fmtDate(io.flight_start)}  —  ${fmtDate(io.flight_end)}`;
  drawText(ctx, flightRange, PW / 2, y, {
    size: 12,
    font: semibold,
    color: TEXT_DARK,
  });
  y -= 14;

  if (advertiserEmail) {
    drawText(ctx, advertiserEmail, MARGIN, y, { size: 9, color: TEXT_MUTED });
  }
  drawText(
    ctx,
    `${AD_CHANNEL_LABEL[io.channel as AdChannel] ?? io.channel}${
      io.publication ? '  ·  ' + io.publication : ''
    }`,
    PW / 2,
    y,
    { size: 9, color: TEXT_MUTED },
  );
  y -= 12;
  if (advertiserPhone) {
    drawText(ctx, advertiserPhone, MARGIN, y, { size: 9, color: TEXT_MUTED });
    y -= 12;
  }

  y -= 8;
  drawHRule(ctx, y);
  y -= 20;

  // ── LINE ITEMS TABLE ─────────────────────────────────────────────────
  drawText(ctx, 'LINE ITEMS', MARGIN, y, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  y -= 14;

  // Column layout
  const COL_DESC_X = MARGIN;
  const COL_QTY_X = PW - MARGIN - 210;
  const COL_RATE_X = PW - MARGIN - 130;
  const COL_TOTAL_X = PW - MARGIN;

  // Header row
  const headerY = y;
  drawRect(ctx, MARGIN, headerY - 4, CONTENT_W, 20, SURFACE);
  drawText(ctx, 'Description', COL_DESC_X + 6, headerY + 4, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  drawTextRight(ctx, 'Qty', COL_QTY_X + 30, headerY + 4, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  drawTextRight(ctx, 'Rate', COL_RATE_X + 60, headerY + 4, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  drawTextRight(ctx, 'Total', COL_TOTAL_X - 6, headerY + 4, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  y -= 24;

  // Rows
  const items: IoLineItem[] = Array.isArray(io.line_items) ? io.line_items : [];
  if (items.length === 0) {
    // Fallback: synthesize one row from the total so the doc isn't empty.
    drawText(
      ctx,
      `${AD_CHANNEL_LABEL[io.channel as AdChannel] ?? io.channel} placement`,
      COL_DESC_X + 6,
      y,
      { size: 10, color: TEXT_DARK },
    );
    drawTextRight(ctx, '1', COL_QTY_X + 30, y, { size: 10, color: TEXT_DARK });
    drawTextRight(ctx, money(io.total_cents), COL_RATE_X + 60, y, {
      size: 10,
      color: TEXT_DARK,
    });
    drawTextRight(ctx, money(io.total_cents), COL_TOTAL_X - 6, y, {
      size: 10,
      font: semibold,
      color: TEXT_DARK,
    });
    y -= 18;
  } else {
    for (const item of items) {
      const qty = item.quantity ?? 1;
      const lineTotal = item.total_cents ?? (item.rate_cents ?? 0) * qty;
      const rate = item.rate_cents ?? (qty > 0 ? Math.round(lineTotal / qty) : 0);
      const desc = item.description
        ?? [item.slot, item.size].filter(Boolean).join(' · ')
        ?? '—';
      drawText(ctx, String(desc), COL_DESC_X + 6, y, {
        size: 10,
        color: TEXT_DARK,
      });
      drawTextRight(ctx, String(qty), COL_QTY_X + 30, y, {
        size: 10,
        color: TEXT_DARK,
      });
      drawTextRight(ctx, money(rate), COL_RATE_X + 60, y, {
        size: 10,
        color: TEXT_DARK,
      });
      drawTextRight(ctx, money(lineTotal), COL_TOTAL_X - 6, y, {
        size: 10,
        font: semibold,
        color: TEXT_DARK,
      });
      y -= 18;
    }
  }

  // Row separator + total
  y -= 4;
  drawHRule(ctx, y);
  y -= 20;
  drawText(ctx, 'TOTAL', COL_RATE_X, y, {
    size: 9,
    font: semibold,
    color: TEXT_MUTED,
  });
  drawTextRight(ctx, money(io.total_cents), COL_TOTAL_X - 6, y, {
    size: 14,
    font: bold,
    color: PURPLE_700,
  });
  y -= 28;

  // ── NOTES ────────────────────────────────────────────────────────────
  if (io.notes && io.notes.trim()) {
    drawText(ctx, 'NOTES', MARGIN, y, {
      size: 8,
      font: semibold,
      color: TEXT_MUTED,
    });
    y -= 14;
    // Naive word-wrap — line every ~90 chars.
    const words = io.notes.trim().split(/\s+/);
    let line = '';
    const MAX_LINE_W = CONTENT_W;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (regular.widthOfTextAtSize(test, 10) > MAX_LINE_W) {
        drawText(ctx, line, MARGIN, y, { size: 10, color: TEXT_DARK });
        y -= 13;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      drawText(ctx, line, MARGIN, y, { size: 10, color: TEXT_DARK });
      y -= 13;
    }
    y -= 12;
  }

  // ── TERMS ────────────────────────────────────────────────────────────
  const termsY = 168;
  drawHRule(ctx, termsY + 78);
  drawText(ctx, 'TERMS', MARGIN, termsY + 66, {
    size: 8,
    font: semibold,
    color: TEXT_MUTED,
  });
  const terms = [
    'Payment due net 30 from invoice date unless otherwise noted.',
    'Placements are non-refundable once the flight has begun.',
    'Cancellations require 14 days written notice before the flight start date.',
    'Realty News Now reserves the right to reject ad content that violates editorial standards.',
  ];
  let ty = termsY + 52;
  for (const t of terms) {
    drawText(ctx, '·  ' + t, MARGIN, ty, { size: 8, color: TEXT_MUTED });
    ty -= 11;
  }

  // ── SIGNATURE BLOCK ──────────────────────────────────────────────────
  const sigY = 92;
  drawHRule(ctx, sigY + 24);
  const sigColW = (CONTENT_W - 24) / 2;
  // Advertiser sig
  page.drawLine({
    start: { x: MARGIN, y: sigY },
    end:   { x: MARGIN + sigColW, y: sigY },
    thickness: 0.6,
    color: TEXT_DARK,
  });
  drawText(ctx, 'Authorized signature — advertiser', MARGIN, sigY - 12, {
    size: 8,
    color: TEXT_MUTED,
  });
  drawText(ctx, 'Date: __________________', MARGIN, sigY - 28, {
    size: 8,
    color: TEXT_MUTED,
  });
  // Publisher sig
  const pubX = MARGIN + sigColW + 24;
  page.drawLine({
    start: { x: pubX, y: sigY },
    end:   { x: pubX + sigColW, y: sigY },
    thickness: 0.6,
    color: TEXT_DARK,
  });
  drawText(ctx, 'Authorized signature — Realty News Now', pubX, sigY - 12, {
    size: 8,
    color: TEXT_MUTED,
  });
  drawText(ctx, 'Date: __________________', pubX, sigY - 28, {
    size: 8,
    color: TEXT_MUTED,
  });

  // ── FOOTER ───────────────────────────────────────────────────────────
  drawRect(ctx, 0, 0, PW, 28, PURPLE_700);
  drawText(ctx, 'Realty News Now · realtynewsnow.app', MARGIN, 10, {
    size: 8,
    font: semibold,
    color: WHITE,
  });
  drawTextRight(
    ctx,
    `${io.io_number} · Issued ${fmtDateTime(io.created_at)}`,
    PW - MARGIN,
    10,
    { size: 8, color: WHITE },
  );

  doc.setTitle(`Insertion Order ${io.io_number}`);
  doc.setAuthor('Realty News Now');
  doc.setSubject('Insertion Order');
  doc.setProducer('Realty News Now');
  doc.setCreator('Realty News Now');

  return await doc.save();
}
