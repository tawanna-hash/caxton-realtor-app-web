/**
 * Server-side PDF generator for the Gmail Event Review queue.
 * Letter paper, Helvetica (embedded from StandardFonts), brand purple
 * for accents. Deliberately mirrors the visual weight of the admin page.
 */

import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib';
import type { AdminCalendarEvent } from '@/lib/server/events-store';
import type { GmailEventSource } from '@/lib/server/gmail-source-fetch';
import { PUBLICATION_FILTER_LABELS } from '@/lib/publications';

export interface GmailQueuePdfInput {
  event: AdminCalendarEvent;
  source: GmailEventSource | null;
  confidence: number | null;
}

const PW = 612;
const PH = 792;
const MARGIN = 48;
const CONTENT_W = PW - MARGIN * 2;

const BRAND = rgb(0.486, 0.227, 0.929); // #7c3aed
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const LGRAY = rgb(0.85, 0.85, 0.85);

interface Ctx {
  doc: PDFDocument;
  pages: PDFPage[];
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  page: number;
  y: number;
}

function cur(ctx: Ctx): PDFPage {
  return ctx.pages[ctx.page];
}

function addPage(ctx: Ctx): void {
  const p = ctx.doc.addPage([PW, PH]);
  ctx.pages.push(p);
  ctx.page = ctx.pages.length - 1;
  ctx.y = PH - MARGIN;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 40) addPage(ctx);
}

/** Sanitize a string for WinAnsi encoding (pdf-lib StandardFonts). */
function sanitize(input: string): string {
  return input
    .replace(/\r/g, '')
    // Smart quotes / dashes → ASCII
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0]/g, ' ')
    // Anything outside printable Latin-1 → '?'
    .replace(/[^\x09\x0A\x20-\x7E\xA1-\xFF]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const clean = sanitize(text);
  return clean.split('\n').flatMap((line) => {
    if (line.trim() === '') return [''];
    const out: string[] = [];
    let curLine = '';
    for (const w of line.split(/\s+/)) {
      const trial = curLine ? `${curLine} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= maxW) {
        curLine = trial;
      } else {
        if (curLine) out.push(curLine);
        curLine = w;
      }
    }
    if (curLine) out.push(curLine);
    return out;
  });
}

function drawText(
  ctx: Ctx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; maxW?: number } = {},
): void {
  const font = opts.font ?? ctx.regular;
  const size = opts.size ?? 10;
  const color = opts.color ?? DARK;
  const x = opts.x ?? MARGIN;
  const maxW = opts.maxW ?? CONTENT_W;
  const lines = wrap(text, font, size, maxW);
  const lh = size * 1.35;
  for (const line of lines) {
    ensure(ctx, lh);
    cur(ctx).drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lh;
  }
}

function hRule(ctx: Ctx): void {
  ensure(ctx, 6);
  cur(ctx).drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_W, y: ctx.y },
    thickness: 0.5,
    color: LGRAY,
  });
  ctx.y -= 6;
}

function drawFooters(ctx: Ctx): void {
  const total = ctx.pages.length;
  for (let i = 0; i < total; i++) {
    const p = ctx.pages[i];
    const label = sanitize(`Realty News Now - Gmail Event Review - Page ${i + 1} of ${total}`);
    const w = ctx.regular.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: (PW - w) / 2,
      y: 24,
      size: 8,
      font: ctx.regular,
      color: GRAY,
    });
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export async function generateGmailQueuePdf(items: GmailQueuePdfInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const first = doc.addPage([PW, PH]);
  const ctx: Ctx = { doc, pages: [first], regular, bold, italic, page: 0, y: PH - MARGIN };

  drawText(ctx, 'Gmail Event Review Queue', { font: bold, size: 20, color: BRAND });
  ctx.y -= 2;
  drawText(
    ctx,
    `${items.length} pending event${items.length === 1 ? '' : 's'} - Generated ${new Date().toLocaleString(
      'en-US',
      { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' },
    )}`,
    { size: 9, color: GRAY },
  );
  ctx.y -= 8;
  hRule(ctx);

  if (items.length === 0) {
    ctx.y -= 20;
    drawText(ctx, 'The queue is empty - no pending events to review.', {
      font: italic,
      color: GRAY,
    });
    drawFooters(ctx);
    return doc.save();
  }

  for (const [i, item] of items.entries()) {
    const { event, source, confidence } = item;
    ensure(ctx, 80);
    drawText(ctx, `${i + 1}. ${event.title || '(no title)'}`, {
      font: bold,
      size: 13,
      color: DARK,
    });

    const meta = [
      PUBLICATION_FILTER_LABELS[event.publication] ?? event.publication,
      fmtDate(event.startDate),
      event.location || null,
      confidence != null ? `${Math.round(confidence * 100)}% confidence` : null,
    ]
      .filter(Boolean)
      .join(' - ');
    drawText(ctx, meta, { size: 9, color: BRAND });
    ctx.y -= 2;

    const details: string[] = [];
    if (event.organizer || event.organizerEmail) {
      details.push(
        `Organizer: ${event.organizer || '-'}${event.organizerEmail ? ` <${event.organizerEmail}>` : ''}`,
      );
    }
    if (event.endDate) details.push(`Ends: ${fmtDate(event.endDate)}`);
    if (event.link) details.push(`Link: ${event.link}`);
    for (const line of details) {
      drawText(ctx, line, { size: 9, color: GRAY });
    }

    if (event.description && event.description.trim()) {
      ctx.y -= 4;
      drawText(ctx, 'Description', { font: bold, size: 9, color: DARK });
      drawText(ctx, event.description.trim(), { size: 9, color: DARK });
    }

    if (source) {
      ctx.y -= 4;
      drawText(ctx, 'Source email', { font: bold, size: 9, color: DARK });
      if (source.from) drawText(ctx, `From: ${source.from}`, { size: 8.5, color: GRAY });
      if (source.subject) drawText(ctx, `Subject: ${source.subject}`, { size: 8.5, color: GRAY });
      if (source.receivedAt) drawText(ctx, `Received: ${fmtDate(source.receivedAt)}`, { size: 8.5, color: GRAY });
      if (source.body) {
        const truncated = source.body.length > 2000 ? source.body.slice(0, 2000) + '...' : source.body;
        drawText(ctx, truncated, { size: 8.5, color: DARK });
      }
    } else if (event.externalSource === 'gmail') {
      drawText(ctx, '(Source email could not be fetched from Gmail.)', {
        font: italic,
        size: 8.5,
        color: GRAY,
      });
    }

    ctx.y -= 8;
    hRule(ctx);
    ctx.y -= 6;
  }

  drawFooters(ctx);
  return doc.save();
}
