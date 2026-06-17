// /admin/ads/media-kit/pdf
//
// GET — Generate a downloadable Media Kit PDF from lib/media-kit.ts.
// Same data the on-screen page renders. Letter size, multi-page,
// uses bundled Georgia fonts (matches the agreement PDF style).
//
// Auth: admin required.

import { NextResponse } from 'next/server';
import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  APP_AD_SLOTS,
  PACKAGES,
  EBLASTS,
  PRINT_DEADLINES,
  RATE_MATRIX,
  FREQ_LABELS,
  FREQ_TERMS,
  AUDIENCE_STATS,
  PUB_SUBSCRIBERS,
  POLICY_NOTES,
  MARKET_MULTIPLIERS,
  type AppAdSlot,
} from '@/lib/media-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Layout constants ───────────────────────────────────────────────────────

const PW = 612;
const PH = 792;
const MARGIN = 48;
const CONTENT_W = PW - MARGIN * 2;

const NAVY = rgb(0.008, 0.114, 0.251); // #021D40
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.85, 0.85, 0.85);
const BG = rgb(0.97, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

interface Ctx {
  doc: PDFDocument;
  pages: PDFPage[];
  bold: PDFFont;
  regular: PDFFont;
  italic: PDFFont;
  i: number;
  y: number;
}

function pg(ctx: Ctx): PDFPage {
  return ctx.pages[ctx.i];
}

function addPage(ctx: Ctx): void {
  const p = ctx.doc.addPage([PW, PH]);
  ctx.pages.push(p);
  ctx.i = ctx.pages.length - 1;
  ctx.y = PH - MARGIN;
}

function ensure(ctx: Ctx, h: number): void {
  if (ctx.y - h < MARGIN + 40) addPage(ctx);
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(candidate, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: {
    font?: PDFFont;
    size?: number;
    color?: ReturnType<typeof rgb>;
    x?: number;
    maxWidth?: number;
    align?: 'left' | 'center' | 'right';
    lineGap?: number;
  } = {},
): void {
  const font = opts.font ?? ctx.regular;
  const size = opts.size ?? 10;
  const color = opts.color ?? DARK;
  const x = opts.x ?? MARGIN;
  const maxW = opts.maxWidth ?? CONTENT_W;
  const lineGap = opts.lineGap ?? 3;
  const align = opts.align ?? 'left';

  const lines = wrap(text, font, size, maxW);
  for (const line of lines) {
    ensure(ctx, size + lineGap);
    let drawX = x;
    if (align === 'center') {
      const w = font.widthOfTextAtSize(line, size);
      drawX = x + (maxW - w) / 2;
    } else if (align === 'right') {
      const w = font.widthOfTextAtSize(line, size);
      drawX = x + maxW - w;
    }
    pg(ctx).drawText(line, { x: drawX, y: ctx.y, font, size, color });
    ctx.y -= size + lineGap;
  }
}

function sectionHeader(ctx: Ctx, title: string): void {
  ensure(ctx, 30);
  ctx.y -= 6;
  // navy bar
  pg(ctx).drawRectangle({
    x: MARGIN,
    y: ctx.y - 14,
    width: CONTENT_W,
    height: 18,
    color: NAVY,
  });
  pg(ctx).drawText(title.toUpperCase(), {
    x: MARGIN + 8,
    y: ctx.y - 9,
    font: ctx.bold,
    size: 9,
    color: WHITE,
  });
  ctx.y -= 24;
}

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return '\u2014';
  return '$' + n.toLocaleString('en-US');
}

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  account: 'Account',
  newsletter: 'Newsletter',
  app: 'App',
};

// ── Section renderers ──────────────────────────────────────────────────────

function drawCover(ctx: Ctx): void {
  // Navy hero band
  pg(ctx).drawRectangle({
    x: 0,
    y: PH - 110,
    width: PW,
    height: 110,
    color: NAVY,
  });
  pg(ctx).drawText('REALTYLINE  /  NEWSLINE', {
    x: MARGIN,
    y: PH - 50,
    font: ctx.bold,
    size: 11,
    color: rgb(1, 1, 1),
  });
  pg(ctx).drawText('2026 Media Kit', {
    x: MARGIN,
    y: PH - 80,
    font: ctx.bold,
    size: 22,
    color: rgb(1, 1, 1),
  });
  pg(ctx).drawText('Print + Digital + e-Blasts', {
    x: MARGIN,
    y: PH - 100,
    font: ctx.italic,
    size: 11,
    color: rgb(0.85, 0.85, 0.9),
  });

  ctx.y = PH - 130;
  drawText(
    ctx,
    'One source of truth for print rates, digital placements, e-blasts, and policy. ' +
      'Numbers in this PDF match the on-screen media kit at /admin/ads/media-kit and ' +
      'the checkout quote engine.',
    { color: GRAY, size: 10 },
  );
  ctx.y -= 6;
}

function drawAudience(ctx: Ctx): void {
  sectionHeader(ctx, 'Audience snapshot');

  // Three KPI tiles
  const tileW = (CONTENT_W - 12) / 3;
  const tileH = 50;
  ensure(ctx, tileH + 12);
  let x = MARGIN;
  for (const s of AUDIENCE_STATS) {
    pg(ctx).drawRectangle({
      x,
      y: ctx.y - tileH,
      width: tileW,
      height: tileH,
      color: BG,
    });
    pg(ctx).drawText(s.value, {
      x: x + 10,
      y: ctx.y - 22,
      font: ctx.bold,
      size: 16,
      color: NAVY,
    });
    pg(ctx).drawText(s.label, {
      x: x + 10,
      y: ctx.y - 40,
      font: ctx.regular,
      size: 8,
      color: GRAY,
    });
    x += tileW + 6;
  }
  ctx.y -= tileH + 14;

  drawText(ctx, 'Subscribers by market', {
    font: ctx.bold,
    size: 10,
    color: DARK,
  });
  ctx.y -= 2;

  const pubs: Array<[string, number]> = [
    ['RealtyLine Austin', PUB_SUBSCRIBERS.realtyline],
    ['Newsline San Antonio', PUB_SUBSCRIBERS.newsline],
    ['RealtyLine Houston', PUB_SUBSCRIBERS['realtyline-houston']],
    ['RealtyLine Dallas / FTW', PUB_SUBSCRIBERS['realtyline-dallas']],
  ];
  const pTileW = (CONTENT_W - 18) / 4;
  ensure(ctx, 44 + 6);
  let px = MARGIN;
  for (const [label, n] of pubs) {
    pg(ctx).drawRectangle({
      x: px,
      y: ctx.y - 40,
      width: pTileW,
      height: 40,
      borderColor: LGRAY,
      borderWidth: 0.5,
      color: WHITE,
    });
    pg(ctx).drawText(n.toLocaleString('en-US'), {
      x: px + 8,
      y: ctx.y - 18,
      font: ctx.bold,
      size: 12,
      color: DARK,
    });
    pg(ctx).drawText(label, {
      x: px + 8,
      y: ctx.y - 32,
      font: ctx.regular,
      size: 7.5,
      color: GRAY,
    });
    px += pTileW + 6;
  }
  ctx.y -= 50;
}

function drawRateMatrix(ctx: Ctx): void {
  sectionHeader(ctx, 'Print rate matrix');
  drawText(
    ctx,
    'Monthly print rates by size and frequency commitment. Locked when agreement is signed in advance.',
    { color: GRAY, size: 9 },
  );
  ctx.y -= 4;

  // 5 columns: size + 4 frequencies
  const colWs = [120, (CONTENT_W - 120) / 4, (CONTENT_W - 120) / 4, (CONTENT_W - 120) / 4, (CONTENT_W - 120) / 4];
  const rowH = 22;

  ensure(ctx, rowH + 6);
  // header row
  pg(ctx).drawRectangle({
    x: MARGIN,
    y: ctx.y - rowH,
    width: CONTENT_W,
    height: rowH,
    color: BG,
  });
  let cx = MARGIN;
  const headers = ['Size', ...FREQ_LABELS];
  const terms = ['', ...FREQ_TERMS];
  for (let c = 0; c < headers.length; c++) {
    pg(ctx).drawText(headers[c], {
      x: cx + 6,
      y: ctx.y - 10,
      font: ctx.bold,
      size: 9,
      color: DARK,
    });
    if (terms[c]) {
      pg(ctx).drawText(terms[c], {
        x: cx + 6,
        y: ctx.y - 19,
        font: ctx.regular,
        size: 7,
        color: GRAY,
      });
    }
    cx += colWs[c];
  }
  ctx.y -= rowH;

  for (const [size, prices] of Object.entries(RATE_MATRIX)) {
    ensure(ctx, rowH);
    cx = MARGIN;
    pg(ctx).drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: MARGIN + CONTENT_W, y: ctx.y },
      thickness: 0.3,
      color: LGRAY,
    });
    pg(ctx).drawText(size, {
      x: cx + 6,
      y: ctx.y - 14,
      font: ctx.bold,
      size: 10,
      color: DARK,
    });
    cx += colWs[0];
    for (let i = 0; i < prices.length; i++) {
      pg(ctx).drawText(fmtUSD(prices[i]) + '/mo', {
        x: cx + 6,
        y: ctx.y - 14,
        font: ctx.regular,
        size: 10,
        color: DARK,
      });
      cx += colWs[i + 1];
    }
    ctx.y -= rowH;
  }
  ctx.y -= 6;
}

function drawPackages(ctx: Ctx): void {
  sectionHeader(ctx, 'Brand packages');
  drawText(
    ctx,
    'Discounts deepen with agreement length. Brand[12 Plus] is a separate premium tier (Full Page only).',
    { color: GRAY, size: 9 },
  );
  ctx.y -= 4;

  for (const p of PACKAGES) {
    // estimate height
    const featureLines = p.features.length;
    const sizeLines = p.sizes.length;
    const blockH = 32 + featureLines * 12 + sizeLines * 14 + 14;
    ensure(ctx, blockH);

    const isPremium = !!p.premium;
    const isPopular = !!p.popular;
    const bg = isPremium ? NAVY : isPopular ? rgb(1, 0.96, 0.91) : BG;
    const textColor = isPremium ? rgb(1, 1, 1) : DARK;
    const subColor = isPremium ? rgb(0.85, 0.87, 0.92) : GRAY;

    pg(ctx).drawRectangle({
      x: MARGIN,
      y: ctx.y - blockH,
      width: CONTENT_W,
      height: blockH,
      color: bg,
      borderColor: isPopular ? rgb(0.92, 0.42, 0.05) : isPremium ? NAVY : LGRAY,
      borderWidth: 0.6,
    });

    pg(ctx).drawText(p.name + '  \u2014  ' + p.term, {
      x: MARGIN + 12,
      y: ctx.y - 16,
      font: ctx.bold,
      size: 12,
      color: textColor,
    });
    if (isPopular) {
      pg(ctx).drawText('MOST POPULAR', {
        x: MARGIN + CONTENT_W - 80,
        y: ctx.y - 14,
        font: ctx.bold,
        size: 7,
        color: rgb(0.92, 0.42, 0.05),
      });
    }
    if (isPremium) {
      pg(ctx).drawText('PREMIUM', {
        x: MARGIN + CONTENT_W - 56,
        y: ctx.y - 14,
        font: ctx.bold,
        size: 7,
        color: rgb(1, 0.85, 0.4),
      });
    }
    pg(ctx).drawText(p.tagline, {
      x: MARGIN + 12,
      y: ctx.y - 30,
      font: ctx.italic,
      size: 9,
      color: subColor,
    });

    let yCursor = ctx.y - 46;
    for (const s of p.sizes) {
      pg(ctx).drawText(s.size + '  (' + s.dim + ')', {
        x: MARGIN + 12,
        y: yCursor,
        font: ctx.regular,
        size: 9,
        color: textColor,
      });
      const priceLine = fmtUSD(s.price) + '/mo';
      const pw = ctx.bold.widthOfTextAtSize(priceLine, 10);
      pg(ctx).drawText(priceLine, {
        x: MARGIN + CONTENT_W - pw - 12,
        y: yCursor,
        font: ctx.bold,
        size: 10,
        color: textColor,
      });
      yCursor -= 13;
    }

    yCursor -= 4;
    for (const f of p.features) {
      pg(ctx).drawText('\u2022 ' + f, {
        x: MARGIN + 12,
        y: yCursor,
        font: ctx.regular,
        size: 8.5,
        color: subColor,
      });
      yCursor -= 11;
    }
    ctx.y -= blockH + 8;
  }
}

function drawDigitalSlots(ctx: Ctx): void {
  sectionHeader(ctx, 'Digital ad slots');
  drawText(
    ctx,
    APP_AD_SLOTS.length +
      ' placements across the app. Rates shown are weekly + monthly for 1 market; multi-market multipliers below.',
    { color: GRAY, size: 9 },
  );
  ctx.y -= 4;

  // Columns
  const colW = {
    name: 170,
    zone: 50,
    tier: 50,
    weekly: 65,
    monthly: 65,
  };
  const sizesW = CONTENT_W - colW.name - colW.zone - colW.tier - colW.weekly - colW.monthly;
  const rowMinH = 26;

  ensure(ctx, rowMinH);
  pg(ctx).drawRectangle({
    x: MARGIN,
    y: ctx.y - 18,
    width: CONTENT_W,
    height: 18,
    color: BG,
  });
  const headerY = ctx.y - 12;
  let hx = MARGIN + 6;
  pg(ctx).drawText('Slot', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  hx += colW.name;
  pg(ctx).drawText('Zone', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  hx += colW.zone;
  pg(ctx).drawText('Tier', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  hx += colW.tier;
  pg(ctx).drawText('Weekly', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  hx += colW.weekly;
  pg(ctx).drawText('Monthly', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  hx += colW.monthly;
  pg(ctx).drawText('Sizes', { x: hx, y: headerY, font: ctx.bold, size: 8, color: DARK });
  ctx.y -= 18;

  for (const s of APP_AD_SLOTS) {
    const nameLines = wrap(s.name, ctx.bold, 9, colW.name - 8);
    const noteLines = wrap(s.notes, ctx.regular, 7.5, colW.name - 8);
    const sizesLines = wrap(s.sizes, ctx.regular, 7.5, sizesW - 8);
    const rowH = Math.max(
      rowMinH,
      8 + nameLines.length * 11 + noteLines.length * 9 + 4,
      8 + sizesLines.length * 9 + 4,
    );
    ensure(ctx, rowH);

    pg(ctx).drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: MARGIN + CONTENT_W, y: ctx.y },
      thickness: 0.3,
      color: LGRAY,
    });

    let cellY = ctx.y - 11;
    let cx = MARGIN + 6;
    for (const ln of nameLines) {
      pg(ctx).drawText(ln, { x: cx, y: cellY, font: ctx.bold, size: 9, color: DARK });
      cellY -= 10;
    }
    for (const ln of noteLines) {
      pg(ctx).drawText(ln, { x: cx, y: cellY, font: ctx.regular, size: 7.5, color: GRAY });
      cellY -= 9;
    }

    const rowTopY = ctx.y - 11;
    cx += colW.name;
    pg(ctx).drawText(ZONE_LABEL[s.zone], { x: cx, y: rowTopY, font: ctx.regular, size: 9, color: DARK });
    cx += colW.zone;
    pg(ctx).drawText(s.tier, { x: cx, y: rowTopY, font: ctx.regular, size: 9, color: s.tier === 'premium' ? rgb(0.7, 0.5, 0.05) : DARK });
    cx += colW.tier;
    pg(ctx).drawText(fmtUSD(s.weeklySingle), { x: cx, y: rowTopY, font: ctx.bold, size: 9, color: DARK });
    if (s.pricingUnit) {
      pg(ctx).drawText(s.pricingUnit, { x: cx, y: rowTopY - 10, font: ctx.regular, size: 7, color: GRAY });
    }
    cx += colW.weekly;
    pg(ctx).drawText(fmtUSD(s.monthlySingle), { x: cx, y: rowTopY, font: ctx.regular, size: 9, color: DARK });
    cx += colW.monthly;
    let sY = rowTopY;
    for (const ln of sizesLines) {
      pg(ctx).drawText(ln, { x: cx, y: sY, font: ctx.regular, size: 7.5, color: GRAY });
      sY -= 9;
    }
    ctx.y -= rowH;
  }
  ctx.y -= 6;

  // Multi-market multipliers
  ensure(ctx, 60);
  drawText(ctx, 'Multi-market bundle multipliers', { font: ctx.bold, size: 10, color: DARK });
  ctx.y -= 2;
  const mTileW = (CONTENT_W - 18) / 4;
  ensure(ctx, 40);
  let mx = MARGIN;
  for (const n of [1, 2, 3, 4] as const) {
    pg(ctx).drawRectangle({
      x: mx,
      y: ctx.y - 36,
      width: mTileW,
      height: 36,
      color: BG,
    });
    pg(ctx).drawText(MARKET_MULTIPLIERS[n].toFixed(1) + '\u00D7', {
      x: mx + 8,
      y: ctx.y - 18,
      font: ctx.bold,
      size: 14,
      color: NAVY,
    });
    pg(ctx).drawText(n + ' market' + (n === 1 ? '' : 's'), {
      x: mx + 8,
      y: ctx.y - 30,
      font: ctx.regular,
      size: 8,
      color: GRAY,
    });
    mx += mTileW + 6;
  }
  ctx.y -= 46;
}

function drawEblasts(ctx: Ctx): void {
  sectionHeader(ctx, 'e-Blast packages');
  drawText(
    ctx,
    'Per-market pricing. Austin (Pkg 1 + 2) flat-rate; Newsline / Houston / Dallas CPM-priced.',
    { color: GRAY, size: 9 },
  );
  ctx.y -= 4;

  const allPubs: Array<['realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas', string]> = [
    ['realtyline', 'Austin (RealtyLine)'],
    ['newsline', 'Newsline San Antonio'],
    ['realtyline-houston', 'Houston'],
    ['realtyline-dallas', 'Dallas / FTW'],
  ];

  for (const b of EBLASTS) {
    const featureLines = b.features.length;
    const rowsCount = allPubs.filter(
      ([pub]) => !b.availablePubs || b.availablePubs.includes(pub),
    ).length;
    const blockH = 30 + featureLines * 11 + rowsCount * 14 + 16;
    ensure(ctx, blockH);

    pg(ctx).drawRectangle({
      x: MARGIN,
      y: ctx.y - blockH,
      width: CONTENT_W,
      height: blockH,
      color: WHITE,
      borderColor: LGRAY,
      borderWidth: 0.5,
    });
    pg(ctx).drawText(b.name, {
      x: MARGIN + 12,
      y: ctx.y - 16,
      font: ctx.bold,
      size: 11,
      color: DARK,
    });

    let yCursor = ctx.y - 30;
    for (const f of b.features) {
      pg(ctx).drawText('\u2713 ' + f, {
        x: MARGIN + 12,
        y: yCursor,
        font: ctx.regular,
        size: 8.5,
        color: GRAY,
      });
      yCursor -= 11;
    }
    yCursor -= 4;
    for (const [pub, label] of allPubs) {
      if (b.availablePubs && !b.availablePubs.includes(pub)) continue;
      const price = b.priceByPub?.[pub] ?? b.price;
      const sends = b.sendsByPub?.[pub] ?? b.sends;
      pg(ctx).drawText(
        label + '  (' + sends + ' send' + (sends === 1 ? '' : 's') + ')',
        {
          x: MARGIN + 12,
          y: yCursor,
          font: ctx.regular,
          size: 9,
          color: DARK,
        },
      );
      const priceText = fmtUSD(price);
      const pw = ctx.bold.widthOfTextAtSize(priceText, 10);
      pg(ctx).drawText(priceText, {
        x: MARGIN + CONTENT_W - pw - 12,
        y: yCursor,
        font: ctx.bold,
        size: 10,
        color: DARK,
      });
      yCursor -= 13;
    }
    ctx.y -= blockH + 8;
  }
}

function drawDeadlines(ctx: Ctx): void {
  sectionHeader(ctx, '2026 print deadlines');

  const colW = CONTENT_W / 3;
  ensure(ctx, 20);
  pg(ctx).drawRectangle({
    x: MARGIN,
    y: ctx.y - 16,
    width: CONTENT_W,
    height: 16,
    color: BG,
  });
  pg(ctx).drawText('Month', { x: MARGIN + 6, y: ctx.y - 11, font: ctx.bold, size: 9, color: DARK });
  pg(ctx).drawText('Ad deadline', { x: MARGIN + colW + 6, y: ctx.y - 11, font: ctx.bold, size: 9, color: DARK });
  pg(ctx).drawText('Mail date', { x: MARGIN + colW * 2 + 6, y: ctx.y - 11, font: ctx.bold, size: 9, color: DARK });
  ctx.y -= 16;

  for (const d of PRINT_DEADLINES) {
    ensure(ctx, 16);
    pg(ctx).drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: MARGIN + CONTENT_W, y: ctx.y },
      thickness: 0.3,
      color: LGRAY,
    });
    pg(ctx).drawText(d.month, {
      x: MARGIN + 6,
      y: ctx.y - 11,
      font: ctx.bold,
      size: 9,
      color: DARK,
    });
    pg(ctx).drawText(d.deadline, {
      x: MARGIN + colW + 6,
      y: ctx.y - 11,
      font: ctx.regular,
      size: 9,
      color: DARK,
    });
    pg(ctx).drawText(d.mail, {
      x: MARGIN + colW * 2 + 6,
      y: ctx.y - 11,
      font: ctx.regular,
      size: 9,
      color: DARK,
    });
    ctx.y -= 16;
  }
  ctx.y -= 6;
}

function drawPolicy(ctx: Ctx): void {
  sectionHeader(ctx, 'Policy notes');
  for (const n of POLICY_NOTES) {
    const bodyLines = wrap(n.body, ctx.regular, 9, CONTENT_W - 24);
    const h = 26 + bodyLines.length * 12;
    ensure(ctx, h);

    // Parse hex color
    const hex = n.color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const bl = parseInt(hex.slice(4, 6), 16) / 255;
    const accent = rgb(r, g, bl);

    pg(ctx).drawRectangle({
      x: MARGIN,
      y: ctx.y - h,
      width: 4,
      height: h,
      color: accent,
    });
    pg(ctx).drawRectangle({
      x: MARGIN + 4,
      y: ctx.y - h,
      width: CONTENT_W - 4,
      height: h,
      color: BG,
    });
    pg(ctx).drawText(n.title, {
      x: MARGIN + 14,
      y: ctx.y - 14,
      font: ctx.bold,
      size: 10,
      color: DARK,
    });
    let by = ctx.y - 28;
    for (const ln of bodyLines) {
      pg(ctx).drawText(ln, {
        x: MARGIN + 14,
        y: by,
        font: ctx.regular,
        size: 9,
        color: DARK,
      });
      by -= 12;
    }
    ctx.y -= h + 8;
  }
}

function drawFooter(ctx: Ctx): void {
  const total = ctx.pages.length;
  for (let i = 0; i < total; i++) {
    const p = ctx.pages[i];
    p.drawText('RealtyLine / Newsline  \u00B7  2026 Media Kit', {
      x: MARGIN,
      y: 24,
      font: ctx.regular,
      size: 8,
      color: GRAY,
    });
    const pageLabel = 'Page ' + (i + 1) + ' of ' + total;
    const pw = ctx.regular.widthOfTextAtSize(pageLabel, 8);
    p.drawText(pageLabel, {
      x: PW - MARGIN - pw,
      y: 24,
      font: ctx.regular,
      size: 8,
      color: GRAY,
    });
  }
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const FONT_DIR = path.join(process.cwd(), 'lib', 'pdf', 'fonts');
    const regularBytes = fs.readFileSync(path.join(FONT_DIR, 'Georgia.ttf'));
    const boldBytes = fs.readFileSync(path.join(FONT_DIR, 'Georgia-Bold.ttf'));
    const italicBytes = fs.readFileSync(path.join(FONT_DIR, 'Georgia-Italic.ttf'));

    const regular = await doc.embedFont(regularBytes);
    const bold = await doc.embedFont(boldBytes);
    const italic = await doc.embedFont(italicBytes);

    const firstPage = doc.addPage([PW, PH]);
    const ctx: Ctx = {
      doc,
      pages: [firstPage],
      regular,
      bold,
      italic,
      i: 0,
      y: PH - MARGIN,
    };

    drawCover(ctx);
    drawAudience(ctx);
    drawRateMatrix(ctx);
    drawPackages(ctx);
    drawDigitalSlots(ctx);
    drawEblasts(ctx);
    drawDeadlines(ctx);
    drawPolicy(ctx);
    drawFooter(ctx);

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'inline; filename="realtyline-2026-media-kit.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'pdf_generation_failed', detail: msg },
      { status: 500 },
    );
  }
}
