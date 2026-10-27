import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { WAYS_TO_PAY_TITLE, waysToPayLines } from '@/lib/payment-options-copy';
import { getSql } from '@/lib/db';

const PAGE_W = 612;
const PAGE_H = 792;
const M = 42;
const DARK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.84, 0.84, 0.84);
const LIGHT = rgb(0.96, 0.96, 0.96);
const WHITE = rgb(1, 1, 1);

type LineItem = { description: string; qty: number; unit_cents: number };
type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string | Date | null;
  due_date: string | Date | null;
  memo: string | null;
  line_items: LineItem[] | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  advertiser_name: string | null;
  advertiser_id: number | null;
  paid_cents: number;
};

const TERMS: Array<[string, string]> = [
  ['FREQUENCY DISCOUNT', 'An advertiser who does not complete a committed consecutive-month insertion schedule will be subject to the one-time insertion rate.'],
  ['AGENCY', 'All advertisements are published for the benefit of advertiser and advertising agency, and each of them is jointly and severally liable for all charges.'],
  ['BILLING', "Payment in U.S. dollars, including any applicable tax, due at Publisher's Postal Box in Austin, Tx, within 20 days of the date of invoice. Any error in billing is binding upon advertiser and/or advertising agency unless Publisher receives written notice of the error within such 3-day period."],
  ['PAST DUE', 'All accounts not paid in full within 20 days of the date of the invoice shall incur a late charge of 1.5% per month from the due date until paid in full.'],
  ['COLLECTION', "In the event advertiser and/or advertising agency defaults in payment of invoices, such invoices are turned over for collection. In this event, the advertiser and/or advertising agency shall be totally liable for all fees and sums charged by the collection agency or attorney, including attorneys' fees and court costs incurred by Publisher in the collection of said invoices."],
];

function clean(v: string): string {
  return v
    .replace(/[\u2010\u2011\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x20-\x7E\xA1-\xFF]/g, '?');
}
function money(c: number) {
  return `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(v: string | Date | null) {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}
function right(page: PDFPage, t: string, x: number, y: number, f: PDFFont, s: number) {
  const safe = clean(t);
  page.drawText(safe, { x: x - f.widthOfTextAtSize(safe, s), y, font: f, size: s, color: DARK });
}

export function invoicePdfFilename(number: string | null, id: string) {
  const base = (number || id).replace(/^INV\s*#?/i, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Invoice_${base || id}.pdf`;
}

/** Render a customer-facing invoice PDF matching /admin/invoices/[id]/preview. */
export async function generateInvoicePdf(invoiceId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT i.*, a.name AS advertiser_name,
      COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)::int AS paid_cents
    FROM invoices i
    LEFT JOIN advertisers a ON a.id = i.advertiser_id
    WHERE i.id = ${invoiceId}
  `) as unknown as InvoiceRow[];
  const inv = rows[0];
  if (!inv) return null;

  const total = Number(inv.total_cents) || 0;
  const paidCents = inv.status === 'paid' ? total : Math.min(Number(inv.paid_cents) || 0, total);
  const due = Math.max(total - paidCents, 0);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
  try {
    logo = await doc.embedJpg(await readFile(path.join(process.cwd(), 'public', 'brand', 'caxton-logo.jpg')));
  } catch { logo = null; }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  const ensure = (h: number) => {
    if (y - h < M) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; }
  };

  // Header
  if (logo) {
    const d = logo.scaleToFit(80, 90);
    page.drawImage(logo, { x: M, y: y - d.height, width: d.width, height: d.height });
  } else {
    page.drawText('CAXTON PUBLICATIONS', { x: M, y: y - 18, font: bold, size: 14, color: DARK });
  }
  right(page, 'INVOICE', PAGE_W - M, y - 20, regular, 23);
  right(page, 'Caxton Publications, Inc.', PAGE_W - M, y - 38, bold, 9);
  right(page, 'PO Box 81366', PAGE_W - M, y - 51, regular, 8);
  right(page, 'Austin, Texas 78708', PAGE_W - M, y - 63, regular, 8);
  right(page, 'United States', PAGE_W - M, y - 75, regular, 8);
  right(page, 'www.realtynewsnow.app', PAGE_W - M, y - 90, regular, 8);
  y -= 100;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1, color: RULE });
  y -= 20;

  // Bill to + meta
  const top = y;
  page.drawText('BILL TO', { x: M, y, font: regular, size: 7, color: MUTED });
  page.drawText(clean(inv.bill_to_name ?? inv.advertiser_name ?? 'Customer'), { x: M, y: y - 13, font: bold, size: 9, color: DARK });
  let by = y - 26;
  for (const line of (inv.bill_to_address ?? '').split('\n').filter(Boolean)) {
    page.drawText(clean(line), { x: M, y: by, font: regular, size: 8, color: DARK }); by -= 11;
  }
  if (inv.bill_to_email) { page.drawText(clean(inv.bill_to_email), { x: M, y: by, font: regular, size: 8, color: DARK }); by -= 11; }

  const meta: Array<[string, string]> = [
    ['Invoice Number:', inv.number ?? 'Draft'],
    ['Invoice Date:', fmtDate(inv.issued_at)],
    ['Payment Due:', fmtDate(inv.due_date)],
  ];
  let my = top;
  for (const [k, v] of meta) {
    right(page, k, PAGE_W - M - 80, my, bold, 8);
    right(page, v, PAGE_W - M, my, regular, 8);
    my -= 12;
  }
  my -= 6;
  page.drawRectangle({ x: PAGE_W - M - 175, y: my - 6, width: 175, height: 20, color: LIGHT });
  right(page, 'Amount Due (USD):', PAGE_W - M - 80, my, bold, 8.5);
  right(page, money(due), PAGE_W - M - 6, my, bold, 8.5);
  y = Math.min(by, my - 10) - 14;

  // Account summary
  page.drawText('ACCOUNT SUMMARY', { x: M, y, font: bold, size: 7.5, color: MUTED });
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.75, color: RULE });
  y -= 13;
  const summary: Array<[string, string, boolean]> = [
    ['Invoice total', money(total), false],
    ['Payments and credits', paidCents > 0 ? `-${money(paidCents)}` : money(0), false],
    ['Total Amount Due', money(due), true],
  ];
  page.drawText(fmtDate(inv.issued_at), { x: M, y, font: regular, size: 8, color: DARK });
  for (const [k, v, b] of summary) {
    page.drawText(k, { x: M + 110, y, font: b ? bold : regular, size: 8, color: DARK });
    right(page, v, PAGE_W - M, y, b ? bold : regular, 8);
    y -= 12;
  }
  y -= 12;

  // Line items
  const cQty = PAGE_W - M - 190, cRate = PAGE_W - M - 85, cAmt = PAGE_W - M - 8;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 6, width: PAGE_W - M * 2, height: 20, color: DARK });
    page.drawText('Services', { x: M + 8, y, font: bold, size: 8, color: WHITE });
    page.drawText('Quantity', { x: cQty - 18, y, font: bold, size: 8, color: WHITE });
    const r = (t: string, x: number) => page.drawText(t, { x: x - bold.widthOfTextAtSize(t, 8), y, font: bold, size: 8, color: WHITE });
    r('Rate', cRate); r('Amount', cAmt);
    y -= 24;
  };
  head();
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  if (!items.length) {
    page.drawText('No itemized services.', { x: M + 8, y, font: regular, size: 8, color: MUTED }); y -= 18;
  }
  for (const it of items) {
    const lines = wrap(String(it.description ?? ''), regular, 8, cQty - M - 40);
    ensure(lines.length * 11 + 14);
    if (y > PAGE_H - M - 5) head();
    lines.forEach((l, i) => page.drawText(l, { x: M + 8, y: y - i * 11, font: regular, size: 8, color: DARK }));
    page.drawText(String(it.qty ?? 1), { x: cQty, y, font: regular, size: 8, color: DARK });
    right(page, money(Number(it.unit_cents) || 0), cRate, y, regular, 8);
    right(page, money((Number(it.unit_cents) || 0) * (Number(it.qty) || 0)), cAmt, y, regular, 8);
    y -= lines.length * 11 + 4;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: RULE });
    y -= 12;
  }

  // Totals
  ensure(60);
  const tx = PAGE_W - M - 200;
  page.drawText('Total:', { x: tx, y, font: regular, size: 8, color: DARK });
  right(page, money(Number(inv.amount_cents) || 0), cAmt, y, regular, 8); y -= 13;
  if (Number(inv.tax_cents) > 0) {
    page.drawText('Tax:', { x: tx, y, font: regular, size: 8, color: DARK });
    right(page, money(Number(inv.tax_cents)), cAmt, y, regular, 8); y -= 13;
  }
  page.drawText('Amount Due (USD):', { x: tx, y, font: bold, size: 8.5, color: DARK });
  right(page, money(due), cAmt, y, bold, 8.5); y -= 24;

  // Notes / terms
  const block = (title: string, body: string, size = 7.5) => {
    const lines = wrap(body, regular, size, PAGE_W - M * 2);
    ensure(14 + lines.length * (size + 2.5));
    page.drawText(clean(title), { x: M, y, font: bold, size: size + 0.5, color: DARK }); y -= size + 5;
    for (const l of lines) { ensure(size + 3); page.drawText(l, { x: M, y, font: regular, size, color: DARK }); y -= size + 2.5; }
    y -= 6;
  };
  if (inv.memo) block('Notes', inv.memo, 8);
  ensure(24 + waysToPayLines().length * 10);
  page.drawText(WAYS_TO_PAY_TITLE, { x: M, y, font: bold, size: 8, color: DARK }); y -= 12;
  for (const l of waysToPayLines()) { page.drawText(clean(`- ${l}`), { x: M, y, font: regular, size: 7.5, color: DARK }); y -= 10; }
  y -= 8;
  ensure(20);
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y: y + 4 }, thickness: 0.75, color: RULE });
  y -= 10;
  for (const [t, b] of TERMS) block(t, b, 7);
  ensure(20);
  const thanks = 'We appreciate your business.';
  page.drawText(thanks, { x: (PAGE_W - regular.widthOfTextAtSize(thanks, 7.5)) / 2, y: y - 6, font: regular, size: 7.5, color: MUTED });

  return { bytes: await doc.save(), filename: invoicePdfFilename(inv.number, inv.id) };
}
