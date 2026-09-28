import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCents } from '@/lib/invoices';
import type { DepositPaymentRow } from '@/lib/server/deposit-reports';

/** A self-contained, letter-sized copy of the same check rows shown on screen. */
export function generateDepositSlipPdf(
  rows: DepositPaymentRow[],
  from: string,
  to: string,
  preparedBy: string | null,
  kind: 'slip' | 'detail' = 'slip',
): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: kind === 'detail' ? 'landscape' : 'portrait' });
  const margin = 36;
  const title = kind === 'detail' ? 'Deposit Detail' : 'Deposit Slip';
  const total = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CAXTON PUBLICATIONS, INC.', margin, 42);
  doc.setFontSize(18);
  doc.text(title, margin, 66);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Period: ${from} to ${to}   |   Checks: ${rows.length}`, margin, 85);
  doc.text(`Prepared by: ${preparedBy ?? '—'}`, margin, 99);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total deposit: ${formatCents(total)}`, margin, 122);

  const detail = kind === 'detail';
  autoTable(doc, {
    startY: 137,
    margin: { left: margin, right: margin, bottom: 48 },
    theme: 'grid',
    head: [detail
      ? ['Date', 'Partner', 'Invoice', 'Check no.', 'Memo', 'Source', 'Recorded', 'Amount']
      : ['Date', 'Partner', 'Invoice', 'Check no.', 'Memo', 'Amount']],
    body: rows.map((row) => {
      const base = [
        row.payment_date ?? '—',
        [row.partner_name ?? '—', row.publication ?? ''].filter(Boolean).join('\n'),
        row.invoice_number ?? 'Draft',
        row.reference?.trim() || '—',
        row.memo?.trim() || '—',
      ];
      return detail
        ? [...base, row.source ?? 'Manual', row.created_at ? new Date(row.created_at).toLocaleString('en-US') : '—', formatCents(row.amount_cents)]
        : [...base, formatCents(row.amount_cents)];
    }),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [48, 29, 93] },
    columnStyles: detail ? {
      0: { cellWidth: 53 },
      1: { cellWidth: 124 },
      2: { cellWidth: 65 },
      3: { cellWidth: 60 },
      4: { cellWidth: 127 },
      5: { cellWidth: 65 },
      6: { cellWidth: 120 },
      7: { cellWidth: 65, halign: 'right' },
    } : {
      0: { cellWidth: 55 },
      1: { cellWidth: 110 },
      2: { cellWidth: 68 },
      3: { cellWidth: 62 },
      4: { cellWidth: 118 },
      5: { cellWidth: 60, halign: 'right' },
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const height = doc.internal.pageSize.getHeight();
      doc.text(`${title} · ${from} to ${to}`, margin, height - 30);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - margin, height - 30, { align: 'right' });
    },
  });
  const endY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 137;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (endY > pageHeight - 94) doc.addPage();
  const signY = endY > pageHeight - 94 ? 58 : endY + 44;
  doc.setFontSize(9);
  doc.text('Verified / deposited by: ____________________________________', margin, signY);

  return Buffer.from(doc.output('arraybuffer'));
}
