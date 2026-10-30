import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { historyDay, historyMethod, historyMoney, type HistoryRow, type InvoiceHistory } from '@/lib/server/invoice-history';

const W = 792, H = 612, M = 40;
const DARK = rgb(0.09, 0.09, 0.09), MUTED = rgb(0.42, 0.42, 0.42), RULE = rgb(0.84, 0.84, 0.84), LIGHT = rgb(0.96, 0.96, 0.96);

const clean = (v: string) => v.replace(/\u2022{2,}\s*/g, 'ending ').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u00B7\u2022]/g, '-').replace(/[^\x20-\x7E\xA1-\xFF]/g, '*');

export async function generateInvoiceHistoryPdf(h: InvoiceHistory, asOf: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice history - ${h.name}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, f: PDFFont = font, size = 9, color = DARK) => page.drawText(clean(t), { x, y: yy, font: f, size, color });
  const right = (t: string, r: number, yy: number, f: PDFFont = font, size = 9) => { const s = clean(t); page.drawText(s, { x: r - f.widthOfTextAtSize(s, size), y: yy, font: f, size, color: DARK }); };
  const fit = (t: string, maxW: number, f: PDFFont, size: number) => { let s = clean(t); while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1); return s; };
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };

  text(`Caxton Publications, Inc. - ${h.brand}`, M, y, font, 9, MUTED); y -= 20;
  text('Invoice History', M, y, bold, 20); y -= 18;
  text(`${h.name}${h.marketTag}`, M, y, font, 12); y -= 14;
  text(`As of ${asOf}`, M, y, font, 9, MUTED); y -= 26;
  text(`Open balance: ${historyMoney(h.owedCents)}     Open invoices: ${h.open.length}     Paid invoices: ${h.paid.length}`, M, y, bold, 10); y -= 28;

  const section = (title: string, rows: HistoryRow[], open: boolean) => {
    if (y < 120) newPage();
    text(title, M, y, bold, 12); y -= 16;
    if (!rows.length) { text(open ? 'No open invoices.' : 'No paid invoices yet.', M, y, font, 9, MUTED); y -= 24; return; }
    const cols = open
      ? [{ l: 'Invoice', x: M }, { l: 'Issued', x: 160 }, { l: 'Due', x: 270 }, { l: 'Total', x: 440, r: true }, { l: 'Balance', x: 520, r: true }]
      : [{ l: 'Invoice', x: M }, { l: 'Issued', x: 150 }, { l: 'Due', x: 240 }, { l: 'Total', x: 360, r: true }, { l: 'Paid on', x: 380 }, { l: 'Method', x: 470 }, { l: 'Card fee', x: W - M, r: true }];
    const header = () => {
      page.drawRectangle({ x: M - 4, y: y - 5, width: W - 2 * M + 8, height: 17, color: LIGHT });
      cols.forEach((c) => (c.r ? right(c.l, c.x, y, bold, 8) : text(c.l, c.x, y, bold, 8)));
      y -= 18;
    };
    header();
    for (const r of rows) {
      if (y < M + 20) { newPage(); header(); }
      const cells = open
        ? [r.number ?? '-', historyDay(r.issued_at, 'America/Chicago'), historyDay(r.due_date), historyMoney(r.total_cents), historyMoney(r.total_cents - r.paid_cents)]
        : [r.number ?? '-', historyDay(r.issued_at, 'America/Chicago'), historyDay(r.due_date), historyMoney(r.total_cents), historyDay(r.paid_on), fit(historyMethod(r.method), W - M - 470 - 60, font, 8), r.fee_cents > 0 ? historyMoney(r.fee_cents) : '-'];
      cols.forEach((c, i) => (c.r ? right(cells[i], c.x, y, font, 8) : text(cells[i], c.x, y, font, 8)));
      page.drawLine({ start: { x: M - 4, y: y - 5 }, end: { x: W - M + 4, y: y - 5 }, thickness: 0.4, color: RULE });
      y -= 16;
    }
    y -= 14;
  };
  section('Open invoices', h.open, true);
  section('Paid invoices', h.paid, false);

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 20, font, size: 8, color: MUTED }));
  return doc.save();
}
