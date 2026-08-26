// lib/pdf/brand-footer.ts
//
// Renders one of the FOOTER_TEMPLATE_META layouts onto a jsPDF doc.
// Pure rendering - knows nothing about which page it's on; the caller
// decides between 'every-page' and 'last-page' placement.
//
// Every template surfaces the same canonical set of fields so the
// picker is purely about style, not about which contact details get
// dropped:
//   - profile photo (headshot)
//   - logo
//   - name
//   - title
//   - company
//   - phone (mobile)
//   - email
//   - TREC / license number
//   - date prepared
// Optional address / website are shown when present but never replace
// any of the required fields.
//
// Image loading: logo / photo URLs are fetched and base64-embedded so
// the PDF is self-contained. We do this once per render call, not per
// page. If the fetch fails (CORS, 404, expired blob URL) we silently
// skip the image and the layout shifts text back to the margin.
//
// All measurements are in jsPDF points (1/72in). The doc is assumed to
// be Letter, with the same 48pt margin used elsewhere.

import type { jsPDF } from 'jspdf';
import {
  type FooterBrand,
  type FooterPalette,
  type FooterTemplateId,
  getFooterPalette,
  getFooterTemplateMeta,
} from '@/lib/footer-templates';

const MARGIN = 48;

// Neutral colors are shared across publications.
const WHITE: [number, number, number] = [255, 255, 255];
const GREY_900: [number, number, number] = [17, 24, 39];
const GREY_700: [number, number, number] = [55, 65, 81];
const GREY_500: [number, number, number] = [107, 114, 128];
const GREY_200: [number, number, number] = [229, 231, 235];

/** Browser-only: fetch an image URL and return its base64 data URL.
 *  Returns null on any failure so the renderer can gracefully skip it. */
async function loadImage(url: string | null): Promise<{
  dataUrl: string;
  format: 'PNG' | 'JPEG';
} | null> {
  if (!url) return null;
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const mime = blob.type.toLowerCase();
    const format: 'PNG' | 'JPEG' = mime.includes('jpeg') || mime.includes('jpg') ? 'JPEG' : 'PNG';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}

function primaryName(b: FooterBrand): string {
  const trimmed = (b.name || '').trim();
  if (trimmed) return trimmed;
  return (b.company || '').trim();
}

function brokerName(b: FooterBrand): string {
  return (b.company || '').trim();
}

function formatPreparedDate(d: Date): string {
  // "Prepared June 13, 2026"
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
    return `Prepared ${fmt}`;
  } catch {
    return `Prepared ${d.toDateString()}`;
  }
}

function licenseLabel(b: FooterBrand): string | null {
  const lic = (b.license_number || '').trim();
  if (!lic) return null;
  // Already prefixed? Don't double-stamp.
  if (/trec|license|lic\./i.test(lic)) return lic;
  return `TREC #${lic}`;
}

export interface BrandFooterOptions {
  template: FooterTemplateId;
  brand: FooterBrand;
  /** Date stamped onto every footer. Defaults to "now" at render time. */
  preparedAt?: Date;
}

/** Render the configured footer template onto every applicable page of
 *  the given jsPDF document. Awaits image loads first, then walks pages
 *  in a single synchronous pass. */
export async function applyBrandFooter(
  doc: jsPDF,
  opts: BrandFooterOptions,
): Promise<void> {
  const meta = getFooterTemplateMeta(opts.template);
  const brand = opts.brand;
  const prepared = formatPreparedDate(opts.preparedAt ?? new Date());
  const palette = getFooterPalette(brand);

  // Preload images once
  const logo = await loadImage(brand.logo_url);
  const photo = await loadImage(brand.photo_url);

  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // For 'last-page' placement: replace the existing generic page-N footer
  // on the last page with the brand footer. For 'every-page': render the
  // brand footer above the generic line on every page.
  const targetPages: number[] =
    meta.placement === 'last-page' ? [pageCount] : Array.from({ length: pageCount }, (_, i) => i + 1);

  for (const pageNum of targetPages) {
    doc.setPage(pageNum);
    const footerTop = pageHeight - meta.heightPt - 16; // 16pt reserved for the generic page-N line

    switch (opts.template) {
      case 'business-card':
        renderBusinessCard(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
      case 'banner':
        renderBanner(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth, meta.heightPt);
        break;
      case 'minimal':
        renderMinimal(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
      case 'signature':
        renderSignature(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
      case 'two-column':
        renderTwoColumn(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
      case 'stacked':
        renderStacked(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
    }
  }
}

// ── Template renderers ────────────────────────────────────────────

type ImgRef = Awaited<ReturnType<typeof loadImage>>;

function drawHairline(doc: jsPDF, y: number, pageWidth: number) {
  doc.setDrawColor(...GREY_200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
}

function renderBusinessCard(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  _photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const height = 92;
  const col1 = left + 142;
  const col2 = left + 322;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, height);
  doc.line(col1, top + 12, col1, top + height - 12);
  doc.line(col2, top + 12, col2, top + height - 12);

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, left + 18, top + 14, 28, 28, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company, 88), left + 18, top + 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...palette.primary);
  const name = primaryName(b);
  if (name) doc.text(name, col1 + 18, top + 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title.toUpperCase(), col1 + 18, top + 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (company) doc.text(company, col1 + 18, top + 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_900);
  let cy = top + 22;
  for (const value of [b.phone, b.office_phone, b.email, b.website]) {
    if (!value) continue;
    doc.text(value, col2 + 16, cy);
    cy += 14;
  }
  doc.setFontSize(7);
  doc.setTextColor(...GREY_500);
  const tail = [licenseLabel(b), prepared].filter(Boolean).join('  -  ');
  doc.text(tail, col2 + 16, top + height - 10);
}

function renderBanner(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
  height: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const panelWidth = 142;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, height);
  doc.setFillColor(...palette.primary);
  doc.rect(left, top, panelWidth, height, 'F');

  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, left + 44, top + 10, 54, 54, undefined, 'FAST');
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(2);
      doc.circle(left + 71, top + 37, 28);
    } catch { /* ignore */ }
  }
  const name = primaryName(b);
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  if (name) doc.text(name, left + panelWidth / 2, top + 78, { align: 'center' });
  doc.setFontSize(10);
  if (company) doc.text(company, left + panelWidth / 2, top + 93, { align: 'center' });

  const contactX = left + panelWidth + 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY_900);
  let y = top + 24;
  for (const value of [b.phone, b.office_phone, b.email, b.website]) {
    if (!value) continue;
    doc.text(value, contactX, y);
    y += 17;
  }

  const logoX = pageWidth - MARGIN - 92;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, logoX + 31, top + 18, 30, 30, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company, 92), logoX + 46, top + 66, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...GREY_500);
  doc.text(prepared, pageWidth - MARGIN - 10, top + height - 9, { align: 'right' });
}

function renderMinimal(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
) {
  drawHairline(doc, top, pageWidth);
  const y = top + 12;

  // Small headshot + tiny logo on the left
  let textX = MARGIN;
  if (photo) {
    try {
      const size = 36;
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(0.6);
      doc.rect(MARGIN, y, size, size);
      textX = MARGIN + size + 10;
    } catch { /* ignore */ }
  }
  if (logo) {
    try {
      const size = 18;
      doc.addImage(logo.dataUrl, logo.format, textX, y + 16, size, size, undefined, 'FAST');
      textX += size + 8;
    } catch { /* ignore */ }
  }

  // Identity lines keep the broker name prominent for TREC compliance.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...GREY_900);
  const name = primaryName(b);
  if (name) doc.text(name, textX, y + 10);

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...GREY_900);
    doc.text(company, textX, y + 22);
  }

  // Final line: title and contact channels.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  const contact: string[] = [];
  if (b.title) contact.push(b.title);
  if (b.phone) contact.push(b.phone);
  if (b.email) contact.push(b.email);
  if (contact.length > 0) doc.text(contact.join('  -  '), textX, y + 36);

  // Right side: license + prepared
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  const rx = pageWidth - MARGIN;
  const lic = licenseLabel(b);
  if (lic) doc.text(lic, rx, y + 22, { align: 'right' });
  doc.text(prepared, rx, y + 36, { align: 'right' });
}

function renderSignature(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const panelWidth = 142;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, 100);
  doc.setFillColor(...palette.primary);
  doc.rect(left, top, panelWidth, 100, 'F');
  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(5);
  doc.circle(left + 78, top + 50, 36);
  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, left + 48, top + 20, 60, 60, undefined, 'FAST');
    } catch { /* ignore */ }
  }

  const name = primaryName(b);
  const company = brokerName(b);
  const textX = left + panelWidth + 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...palette.primary);
  if (name) doc.text(name, textX, top + 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title.toUpperCase(), textX, top + 38);
  doc.setFillColor(...palette.accent);
  doc.rect(textX - 8, top + 47, 16, 43, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_900);
  let y = top + 56;
  for (const value of [b.phone, b.office_phone, b.email, b.website]) {
    if (!value) continue;
    doc.text(value, textX + 18, y);
    y += 13;
  }

  const logoX = pageWidth - MARGIN - 86;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, logoX + 28, top + 16, 30, 30, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company, 86), logoX + 43, top + 62, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...GREY_500);
  doc.text([licenseLabel(b), prepared].filter(Boolean).join('  -  '), pageWidth - MARGIN - 8, top + 92, { align: 'right' });
}

function renderTwoColumn(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  _photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const bodyHeight = 78;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, 104);
  const col1 = left + 180;
  const col2 = left + 382;
  doc.line(col1, top + 12, col1, top + bodyHeight - 10);

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, left + 18, top + 20, 28, 28, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company, 112), left + 56, top + 31);

  const name = primaryName(b);
  doc.setFontSize(14);
  doc.setTextColor(...palette.primary);
  if (name) doc.text(name.toUpperCase(), col1 + 22, top + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title.toUpperCase(), col1 + 22, top + 34);
  let y = top + 48;
  for (const value of [b.phone, b.office_phone, b.email, b.website]) {
    if (!value) continue;
    doc.text(value, col1 + 22, y);
    y += 11;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  doc.text('CONNECT WITH ME', col2 + 22, top + 36);

  doc.setFillColor(...GREY_900);
  doc.rect(left, top + bodyHeight, width, 26, 'F');
  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text(b.tagline || 'Your trusted real estate professional', left + width / 2, top + bodyHeight + 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...GREY_500);
  doc.text([licenseLabel(b), prepared].filter(Boolean).join('  -  '), pageWidth - MARGIN, top + 112, { align: 'right' });
}

function renderStacked(
  doc: jsPDF,
  b: FooterBrand,
  palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  prepared: string,
  top: number,
  pageWidth: number,
) {
  drawHairline(doc, top, pageWidth);
  const cx = pageWidth / 2;
  let y = top + 10;

  // Centered headshot with logo chip beside it
  if (photo) {
    try {
      const size = 46;
      const px = cx - size / 2;
      doc.addImage(photo.dataUrl, photo.format, px, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(0.8);
      doc.rect(px, y, size, size);
      if (logo) {
        try {
          const ls = 20;
          doc.addImage(
            logo.dataUrl,
            logo.format,
            px + size + 8,
            y + size - ls,
            ls,
            ls,
            undefined,
            'FAST',
          );
        } catch { /* ignore */ }
      }
      y += size + 16;
    } catch {
      // fall through to logo-only block
    }
  } else if (logo) {
    try {
      const size = 20;
      doc.addImage(logo.dataUrl, logo.format, cx - size / 2, y, size, size, undefined, 'FAST');
      y += size + 16;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...GREY_900);
  const name = primaryName(b);
  if (name) {
    doc.text(name, cx, y, { align: 'center' });
    y += 13;
  }

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...GREY_900);
    doc.text(company, cx, y, { align: 'center' });
    y += 12;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.title) {
    doc.text(b.title, cx, y, { align: 'center' });
    y += 12;
  }

  const contactLine: string[] = [];
  if (b.phone) contactLine.push(b.phone);
  if (b.email) contactLine.push(b.email);
  if (contactLine.length > 0) {
    doc.text(contactLine.join('  -  '), cx, y, { align: 'center' });
    y += 12;
  }

  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  const tail: string[] = [];
  const lic = licenseLabel(b);
  if (lic) tail.push(lic);
  tail.push(prepared);
  doc.text(tail.join('  -  '), cx, y, { align: 'center' });
}
