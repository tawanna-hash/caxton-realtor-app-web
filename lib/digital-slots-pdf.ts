// Client-side PDF of the Digital Ad Slots card (per publication).
import type { AppAdSlot } from '@/lib/media-kit';

const ZONE: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed', article: 'Article', calendar: 'Calendar', account: 'Account', newsletter: 'Email', app: 'App-wide',
};
const usd = (n: number | null) => (n === null ? '—' : `$${n.toLocaleString('en-US')}`);
// jsPDF core fonts are WinAnsi; swap glyphs it can't draw.
const clean = (s: string) => s.replace(/×/g, 'x').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/≥/g, '>=').replace(/·/g, '|');

export async function buildDigitalSlotsPdf(slots: AppAdSlot[], pubLabel: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setFontSize(16);
  doc.setTextColor(66, 39, 124);
  doc.text(`Digital Ad Slots — ${clean(pubLabel)}`.replace('—', '-'), 40, 44);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Weekly + monthly rates shown for 1 market. Multi-market: 2 = 1.7x, 3 = 2.4x, 4 = 3.0x. realtynewsnow.app/advertise', 40, 60);
  autoTable(doc, {
    startY: 72,
    head: [['Slot', 'Zone', 'Tier', 'Weekly', 'Monthly', 'Sizes / Video']],
    body: slots.map((s) => [
      `${s.name}\n${clean(s.notes)}`,
      ZONE[s.zone],
      s.tier.toUpperCase(),
      usd(s.weeklySingle) + (s.pricingUnit ? `\n${s.pricingUnit}` : ''),
      usd(s.monthlySingle),
      clean(s.sizes) + (s.video ? `\n${s.video.kind === 'gif' ? 'e-Blast video' : 'Video'}: ${clean(s.video.spec)}` : ''),
    ]),
    styles: { fontSize: 8, cellPadding: 5, valign: 'top' },
    headStyles: { fillColor: [66, 39, 124] },
    columnStyles: { 0: { cellWidth: 200 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { cellWidth: 260 } },
  });
  const slug = pubLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { doc, filename: `digital-ad-slots-${slug}.pdf` };
}
