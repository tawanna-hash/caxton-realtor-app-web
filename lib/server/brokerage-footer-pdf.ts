import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AgentAccountDetails } from '@/lib/server/agent-account-details';

const clean = (value: string) => value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();

/**
 * Draws the brokerage row (brokerage, address, agent ID, agent name) along the
 * bottom edge of every page, matching the footer shown under each form in the app.
 */
export async function stampBrokerageFooter(
  pdf: PDFDocument,
  details: Pick<AgentAccountDetails, 'brokerage' | 'address' | 'agentId' | 'agentName'> | null | undefined,
): Promise<void> {
  if (!details) return;
  const cells = [details.brokerage, details.address, details.agentId, details.agentName].map((value) => clean(value ?? ''));
  if (!cells.some(Boolean)) return;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const weights = [1, 1.6, 0.7, 1];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const size = 7.5;
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const margin = 18;
    const gap = 4;
    const usable = width - margin * 2 - gap * (cells.length - 1);
    let x = margin;
    cells.forEach((text, index) => {
      const w = (usable * weights[index]) / total;
      page.drawRectangle({ x, y: 4, width: w, height: 13, borderColor: rgb(0.9, 0.9, 0.93), borderWidth: 0.5, color: rgb(1, 1, 1) });
      if (text) {
        let shown = text;
        while (shown.length > 1 && font.widthOfTextAtSize(shown, size) > w - 6) shown = shown.slice(0, -1);
        const textWidth = font.widthOfTextAtSize(shown, size);
        page.drawText(shown, { x: x + (w - textWidth) / 2, y: 7.8, size, font, color: rgb(0.1, 0.09, 0.15) });
      }
      x += w + gap;
    });
  }
}
