// app/(public)/resources/_components/calcPdf.ts
//
// Shared PDF generator for the calculator pages. Each page builds a
// CalcReport describing the title, meta header, and one or more sections
// of label/value rows; this module renders it to a typeset PDF using
// jsPDF + autoTable and triggers a browser download.
//
// We deliberately render a typeset report (not a screenshot) so the
// output is selectable, copy-pasteable, and lightweight — and so we
// don't pull html2canvas into the bundle.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { applyBrandFooter } from '@/lib/pdf/brand-footer';
import {
  type FooterBrand,
  type FooterTemplateId,
  getFooterTemplateMeta,
} from '@/lib/footer-templates';

interface CalcReportRow {
  label: string;
  value: string;
  /** Render emphasised (bold + slightly larger) — for subtotals/totals. */
  emphasis?: boolean;
  /** Render in rose for negative line items. */
  negative?: boolean;
}

interface CalcReportSection {
  heading?: string;
  rows: CalcReportRow[];
}

export interface CalcReport {
  /** Page title (e.g. "Mortgage Calculator"). */
  title: string;
  /** Optional subtitle / context line (e.g. "$450,000 home · 20% down"). */
  subtitle?: string;
  /** One-line summary printed under the hero — usually the headline number. */
  heroLabel?: string;
  heroValue?: string;
  /** Meta key/value pairs printed under the title (e.g. address, generated date). */
  meta?: Array<{ key: string; value: string }>;
  sections: CalcReportSection[];
  /** Footer disclaimer printed in small grey. */
  disclaimer?: string;
  /** File name (without .pdf extension). */
  filename: string;
  /** Optional brand footer for signed-in brokers/agents. When omitted,
   *  only the generic site footer is drawn. */
  brandFooter?: {
    template: FooterTemplateId;
    brand: FooterBrand;
  };
}

const BRAND_NAVY: [number, number, number] = [26, 42, 68];   // #301D5D
const BRAND_GOLD: [number, number, number] = [196, 163, 90]; // #fb923c
const GREY_900: [number, number, number] = [17, 24, 39];
const GREY_700: [number, number, number] = [55, 65, 81];
const GREY_500: [number, number, number] = [107, 114, 128];
const ROSE_700: [number, number, number] = [190, 18, 60];

export async function createCalcReportPdf(report: CalcReport): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  // Reserve extra bottom margin for the brand footer (if any) so body
  // content never overlaps the footer artwork.
  const brandFooterHeight = report.brandFooter
    ? getFooterTemplateMeta(report.brandFooter.template).heightPt
    : 0;
  const bottomReserve = margin + brandFooterHeight;

  let y = margin;

  // ── Headline area ───────────────────────────────────────────────
  // Generous leading between eyebrow, title, gold rule, and subtitle
  // so the top of the page reads as a deliberate masthead rather than
  // four lines crammed together.

  // Eyebrow
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  doc.text('REALTYLINE AUSTIN  ·  REALTOR® TOOL', margin, y);
  y += 28;

  // Title (serif-feeling via Times) - track on a 30pt baseline so the
  // 24pt cap height has room to breathe before the gold rule.
  doc.setFont('times', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(...GREY_900);
  doc.text(report.title, margin, y);
  y += 16;

  // Gold rule
  doc.setDrawColor(...BRAND_GOLD);
  doc.setLineWidth(2);
  doc.line(margin, y, margin + 60, y);
  y += 26;

  // Subtitle
  if (report.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GREY_700);
    const subLines = doc.splitTextToSize(report.subtitle, contentWidth);
    // Bump per-line leading from 13 to 15pt for a softer, editorial feel.
    doc.text(subLines, margin, y);
    y += subLines.length * 15 + 12;
  }

  // Meta grid (right column)
  if (report.meta && report.meta.length > 0) {
    doc.setFontSize(9);
    let metaY = y;
    for (const m of report.meta) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GREY_500);
      doc.text(m.key.toUpperCase(), margin, metaY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREY_900);
      doc.text(m.value, margin + 110, metaY);
      metaY += 14;
    }
    y = metaY + 6;
  }

  // Hero card
  if (report.heroLabel && report.heroValue) {
    const cardH = 64;
    doc.setFillColor(248, 250, 252); // gray-50
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, cardH, 6, 6, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    doc.text(report.heroLabel.toUpperCase(), margin + 14, y + 18);

    doc.setFont('times', 'normal');
    doc.setFontSize(28);
    doc.setTextColor(...BRAND_NAVY);
    doc.text(report.heroValue, margin + 14, y + 48);

    y += cardH + 18;
  }

  // Sections
  for (const section of report.sections) {
    // Ensure space — break to next page if needed
    if (y > doc.internal.pageSize.getHeight() - bottomReserve - 60) {
      doc.addPage();
      y = margin;
    }

    if (section.heading) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND_NAVY);
      doc.text(section.heading.toUpperCase(), margin, y);
      y += 12;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: { top: 4, bottom: 4, left: 0, right: 0 },
        textColor: GREY_700,
        lineColor: [229, 231, 235],
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.6 },
        1: { cellWidth: contentWidth * 0.4, halign: 'right', textColor: GREY_900, fontStyle: 'bold' },
      },
      body: section.rows.map((r) => [
        { content: r.label, styles: r.emphasis ? { fontStyle: 'bold', textColor: GREY_900 } : {} },
        {
          content: r.value,
          styles: {
            fontStyle: 'bold',
            textColor: r.negative ? ROSE_700 : r.emphasis ? BRAND_NAVY : GREY_900,
            fontSize: r.emphasis ? 11 : 10,
          },
        },
      ]),
      didDrawCell: (data) => {
        // Bottom hairline between rows
        if (data.section === 'body' && data.column.index === 1) {
          const { x, y: cy, width } = data.cell;
          const rowX = margin;
          const rowW = contentWidth;
          doc.setDrawColor(243, 244, 246);
          doc.setLineWidth(0.5);
          doc.line(rowX, cy + data.cell.height, rowX + rowW, cy + data.cell.height);
          // suppress unused-var warnings
          void x; void width;
        }
      },
    });

    // jspdf-autotable v5: read lastAutoTable from the doc
    const lastY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
    y = lastY + 14;
  }

  // Disclaimer
  if (report.disclaimer) {
    if (y > doc.internal.pageSize.getHeight() - bottomReserve - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    const lines = doc.splitTextToSize(report.disclaimer, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 11;
  }

  // Brand footer first (template artwork sits above the generic page-N line)
  if (report.brandFooter) {
    try {
      await applyBrandFooter(doc, report.brandFooter);
    } catch (err) {
      console.error('[calcPdf] brand footer render failed:', err);
    }
  }

  // Generic site footer (every page) - sits flush at the very bottom
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    doc.text('realtynewsnow.app  ·  RealtyLine Austin', margin, pageH - 12);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageH - 12, { align: 'right' });
  }

  return doc;
}

export async function downloadCalcReport(report: CalcReport): Promise<void> {
  const doc = await createCalcReportPdf(report);
  doc.save(`${report.filename}.pdf`);
}

export async function createCalcReportFile(report: CalcReport): Promise<File> {
  const doc = await createCalcReportPdf(report);
  return new File([doc.output('blob')], `${report.filename}.pdf`, {
    type: 'application/pdf',
  });
}

/** Build a human-readable timestamp string for the meta header. */
export function reportTimestamp(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
