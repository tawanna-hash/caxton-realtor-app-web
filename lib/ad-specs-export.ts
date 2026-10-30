// Client-side exports for the Digital Ad Slots card and the Video Ad Specs
// sheet: PDF (jsPDF), CSV, and Excel (.xlsx via exceljs). All data comes
// from lib/media-kit.ts so every export matches the live rate card.
import {
  APP_AD_SLOTS,
  EXTRA_VIDEO_PLACEMENTS,
  VIDEO_FILE_SPECS,
  EBLAST_VIDEO_SPECS,
  type AppAdSlot,
} from '@/lib/media-kit';

const ZONE: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed', article: 'Article', calendar: 'Calendar', account: 'Account', newsletter: 'Email', app: 'App-wide',
};
const clean = (s: string) =>
  s.replace(/×/g, 'x').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/’/g, "'").replace(/≥/g, '>=').replace(/·/g, '|');

export type Sheet = { name: string; header: string[]; rows: Array<Array<string | number | null>> };

export function digitalSlotsSheet(slots: AppAdSlot[]): Sheet {
  return {
    name: 'Digital Ad Slots',
    header: ['Slot', 'Zone', 'Tier', 'Weekly (1 mkt)', 'Weekly (both)', 'Monthly (1 mkt)', 'Monthly (both)', 'Pricing unit', 'Sizes', 'Video', 'Video spec', 'Notes'],
    rows: slots.map((s) => [
      s.name, ZONE[s.zone], s.tier, s.weeklySingle, s.weeklyBoth, s.monthlySingle, s.monthlyBoth,
      s.pricingUnit ?? (s.monthlySingle === null ? '' : 'week / month'),
      s.sizes, s.video ? (s.video.kind === 'gif' ? 'Via GIF (email)' : 'Yes') : 'Image only', s.video?.spec ?? '', s.notes,
    ]),
  };
}

export function videoSpecsSheets(): Sheet[] {
  const videoSlots = [
    ...APP_AD_SLOTS.filter((s) => s.video?.kind === 'video').map((s) => ({ name: s.name, spec: s.video!.spec })),
    ...EXTRA_VIDEO_PLACEMENTS.map((p) => ({ name: p.name, spec: p.video.spec })),
  ];
  return [
    { name: 'Video Placements', header: ['Placement', 'Video spec'], rows: videoSlots.map((v) => [v.name, v.spec]) },
    { name: 'File Requirements', header: ['Requirement', 'Value'], rows: VIDEO_FILE_SPECS.map((r) => [r.label, r.value]) },
    { name: 'e-Blast Video', header: ['Requirement', 'Value'], rows: EBLAST_VIDEO_SPECS.map((r) => [r.label, r.value]) },
    {
      name: 'Image-Only',
      header: ['Placement', 'Sizes'],
      rows: APP_AD_SLOTS.filter((s) => !s.video).map((s) => [s.name, s.sizes]),
    },
  ];
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number | null) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(sheets: Sheet[], filename: string) {
  const parts = sheets.map((sh) =>
    [...(sheets.length > 1 ? [csvCell(sh.name)] : []), sh.header.map(csvCell).join(','), ...sh.rows.map((r) => r.map(csvCell).join(','))].join('\r\n'),
  );
  save(new Blob(['\ufeff' + parts.join('\r\n\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function downloadXlsx(sheets: Sheet[], filename: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Realty News Now';
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    ws.addRow(sh.header).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF42277C' } };
    sh.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: false }, (c) => { max = Math.max(max, Math.min(60, String(c.value ?? '').length + 2)); });
      col.width = max;
      col.alignment = { wrapText: true, vertical: 'top' };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export async function buildVideoSpecsPdf() {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  doc.setFontSize(16);
  doc.setTextColor(66, 39, 124);
  doc.text('Video Ad Specifications - Realty News Now', 40, 48);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('RealtyLine (Austin) and Newsline (San Antonio). Videos autoplay muted and link to your landing page.', 40, 64);
  doc.text('Full sheet: realtynewsnow.app/advertise/video-specs', 40, 76);
  let y = 92;
  for (const sh of videoSpecsSheets()) {
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(sh.name, 40, y + 6);
    autoTable(doc, {
      startY: y + 12,
      head: [sh.header],
      body: sh.rows.map((r) => r.map((c) => clean(String(c ?? '')))),
      styles: { fontSize: 8.5, cellPadding: 5, valign: 'top' },
      headStyles: { fillColor: [66, 39, 124] },
      columnStyles: { 0: { cellWidth: 190 } },
      margin: { left: 40, right: 40 },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  }
  return { doc, filename: 'video-ad-specs-realty-news-now.pdf' };
}
