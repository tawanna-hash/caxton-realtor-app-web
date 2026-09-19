import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  type PartnerStatement,
  statementDate,
  statementMoney,
} from '@/lib/server/partner-statement';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 42;
const DARK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.84, 0.84, 0.84);
const LIGHT = rgb(0.96, 0.96, 0.96);
const WHITE = rgb(1, 1, 1);
const LINK = rgb(0.08, 0.31, 0.72);

function clean(value: string): string {
  return value
    .replace(/[\u2010\u2011\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x20-\x7E\xA1-\xFF]/g, '?');
}

function rightText(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number) {
  const safe = clean(text);
  page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, font, size, color: DARK });
}

function addLink(
  doc: PDFDocument,
  page: PDFPage,
  text: string,
  url: string,
  x: number,
  y: number,
  font: PDFFont,
) {
  const size = 7.5;
  page.drawText(text, { x, y, font, size, color: LINK });
  const width = font.widthOfTextAtSize(text, size);
  const ref = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y - 1, x + width, y + size + 1],
      Border: { W: 0 },
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
  page.node.addAnnot(ref);
}

export async function generatePartnerStatementPdf(statement: PartnerStatement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'brand', 'caxton-logo.jpg'));
    logo = await doc.embedJpg(bytes);
  } catch {
    logo = null;
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawHeader = (continued = false) => {
    if (logo) {
      const dimensions = logo.scaleToFit(115, 82);
      page.drawImage(logo, { x: MARGIN, y: y - dimensions.height, width: dimensions.width, height: dimensions.height });
    } else {
      page.drawText('CAXTON PUBLICATIONS', { x: MARGIN, y: y - 18, font: bold, size: 14, color: DARK });
    }
    rightText(page, continued ? 'STATEMENT - CONTINUED' : 'STATEMENT', PAGE_W - MARGIN, y - 18, regular, continued ? 15 : 23);
    rightText(page, 'Caxton Publications, Inc.', PAGE_W - MARGIN, y - 36, bold, 9);
    rightText(page, 'PO Box 81366', PAGE_W - MARGIN, y - 49, regular, 8);
    rightText(page, 'Austin, Texas 78708-1366', PAGE_W - MARGIN, y - 61, regular, 8);
    rightText(page, 'United States', PAGE_W - MARGIN, y - 73, regular, 8);
    page.drawLine({ start: { x: MARGIN, y: y - 88 }, end: { x: PAGE_W - MARGIN, y: y - 88 }, thickness: 1, color: RULE });
    y -= 108;
  };

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawHeader(true);
    drawTableHeader();
  };

  const drawTableHeader = () => {
    const columns = [MARGIN, 124, 194, 266, 346, 418, 494, PAGE_W - MARGIN];
    page.drawRectangle({ x: MARGIN, y: y - 20, width: PAGE_W - MARGIN * 2, height: 20, color: DARK });
    const labels = ['Invoice #', 'Invoice date', 'Due date', 'Total', 'Paid', 'Due', 'Payment'];
    labels.forEach((label, index) => {
      page.drawText(label, {
        x: columns[index] + 4,
        y: y - 14,
        font: bold,
        size: 7,
        color: WHITE,
      });
    });
    y -= 20;
  };

  drawHeader();
  page.drawText('BILL TO', { x: MARGIN, y, font: regular, size: 7, color: MUTED });
  page.drawText(clean(statement.billToName), { x: MARGIN, y: y - 14, font: bold, size: 9, color: DARK });
  let billY = y - 27;
  for (const line of (statement.billToAddress ?? '').split('\n').filter(Boolean)) {
    page.drawText(clean(line), { x: MARGIN, y: billY, font: regular, size: 8, color: DARK });
    billY -= 11;
  }
  if (statement.billToEmail) page.drawText(clean(statement.billToEmail), { x: MARGIN, y: billY, font: regular, size: 8, color: DARK });
  rightText(page, 'United States dollar (USD)', PAGE_W - MARGIN, y, regular, 8);
  rightText(page, `As of ${statementDate(statement.asOf)}`, PAGE_W - MARGIN, y - 14, regular, 8);
  y -= 74;

  const summaryRows: Array<[string, string, boolean]> = [
    ['Overdue', statementMoney(statement.overdueCents), false],
    ['Not yet due', statementMoney(statement.notYetDueCents), false],
    ['Outstanding balance (USD)', statementMoney(statement.outstandingCents), true],
  ];
  for (const [label, amount, strong] of summaryRows) {
    if (strong) page.drawRectangle({ x: 302, y: y - 19, width: PAGE_W - MARGIN - 302, height: 19, color: LIGHT });
    page.drawText(label, { x: 310, y: y - 13, font: strong ? bold : regular, size: 8, color: DARK });
    rightText(page, amount, PAGE_W - MARGIN - 8, y - 13, strong ? bold : regular, 8);
    y -= 19;
  }
  if (statement.overduePaymentLinkUrl) {
    y -= 4;
    page.drawRectangle({ x: 302, y: y - 24, width: PAGE_W - MARGIN - 302, height: 24, color: rgb(1, 0.95, 0.9) });
    addLink(
      doc,
      page,
      `Pay all overdue (${statementMoney(statement.overdueCents)})`,
      statement.overduePaymentLinkUrl,
      310,
      y - 16,
      bold,
    );
    y -= 28;
  }
  y -= 18;
  drawTableHeader();

  const columns = [MARGIN, 124, 194, 266, 346, 418, 494, PAGE_W - MARGIN];
  for (const invoice of statement.invoices) {
    if (y < 92) newPage();
    const rowH = 34;
    const baseline = y - 13;
    page.drawText(clean(invoice.number ?? invoice.id.slice(0, 8)), { x: columns[0] + 4, y: baseline, font: bold, size: 7.5, color: DARK });
    page.drawText(statementDate(invoice.issued_at), { x: columns[1] + 4, y: baseline, font: regular, size: 7.2, color: DARK });
    page.drawText(statementDate(invoice.due_date), { x: columns[2] + 4, y: baseline, font: regular, size: 7.2, color: DARK });
    if (invoice.is_overdue) page.drawText('Overdue', { x: columns[2] + 4, y: baseline - 11, font: bold, size: 6.5, color: rgb(0.86, 0.15, 0.15) });
    rightText(page, statementMoney(invoice.total_cents), columns[4] - 4, baseline, regular, 7.2);
    rightText(page, statementMoney(invoice.amount_paid_cents), columns[5] - 4, baseline, regular, 7.2);
    rightText(page, statementMoney(invoice.balance_cents), columns[6] - 4, baseline, bold, 7.2);
    if (invoice.stripe_payment_link_url) {
      addLink(doc, page, 'Pay online', invoice.stripe_payment_link_url, columns[6] + 4, baseline, bold);
    }
    page.drawLine({ start: { x: MARGIN, y: y - rowH }, end: { x: PAGE_W - MARGIN, y: y - rowH }, thickness: 0.6, color: RULE });
    y -= rowH;
  }

  y -= 15;
  page.drawRectangle({ x: 302, y: y - 24, width: PAGE_W - MARGIN - 302, height: 24, color: LIGHT });
  page.drawText('Outstanding balance (USD)', { x: 310, y: y - 16, font: bold, size: 8, color: DARK });
  rightText(page, statementMoney(statement.outstandingCents), PAGE_W - MARGIN - 8, y - 16, bold, 8);

  for (const item of doc.getPages()) {
    item.drawText('We appreciate your business.', {
      x: 235,
      y: 26,
      font: regular,
      size: 7,
      color: MUTED,
    });
    addLink(
      doc,
      item,
      'www.realtynewsnow.app',
      'https://www.realtynewsnow.app',
      MARGIN,
      26,
      regular,
    );
  }
  return doc.save();
}
