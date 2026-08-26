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

function joinAddress(b: FooterBrand): string {
  const line1 = [b.address, b.address_2].filter(Boolean).join(', ');
  const cityZip = [b.city, b.state].filter(Boolean).join(', ');
  const tail = [cityZip, b.zip].filter(Boolean).join(' ').trim();
  return [line1, tail].filter(Boolean).join(' - ');
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

/** Helper: draw a photo + logo pair on the left side. Photo is the
 *  larger square (headshot), logo is a smaller chip below it.
 *  Returns the X coordinate where text should start. */
function drawPhotoAndLogo(
  doc: jsPDF,
  palette: FooterPalette,
  photo: ImgRef,
  logo: ImgRef,
  x: number,
  y: number,
  photoSize: number,
  logoSize: number,
): number {
  let drawn = false;
  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, x, y, photoSize, photoSize, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(0.8);
      doc.rect(x, y, photoSize, photoSize);
      drawn = true;
    } catch { /* ignore */ }
  }
  if (logo) {
    try {
      // Logo sits to the right of the photo when both present, otherwise in photo's spot.
      const lx = drawn ? x + photoSize + 6 : x;
      const ly = drawn ? y + photoSize - logoSize : y;
      doc.addImage(logo.dataUrl, logo.format, lx, ly, logoSize, logoSize, undefined, 'FAST');
      if (!drawn) {
        drawn = true;
        return x + logoSize + 12;
      }
      return x + photoSize + logoSize + 14;
    } catch { /* ignore */ }
  }
  return drawn ? x + photoSize + 14 : x;
}

function renderBusinessCard(
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
  const photoSize = 60;
  const logoSize = 24;
  const textX = drawPhotoAndLogo(doc, palette, photo, logo, MARGIN, y, photoSize, logoSize);

  const name = primaryName(b);
  if (name) {
    doc.setFont('times', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(...GREY_900);
    doc.text(name, textX, y + 11);
  }

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...GREY_900);
    doc.text(company, textX, y + 25);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title, textX, y + 38);
  const line: string[] = [];
  if (b.phone) line.push(b.phone);
  if (b.email) line.push(b.email);
  if (line.length > 0) doc.text(line.join('  -  '), textX, y + 50);

  // License + prepared date on a final small line
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  const tail: string[] = [];
  const lic = licenseLabel(b);
  if (lic) tail.push(lic);
  tail.push(prepared);
  doc.text(tail.join('  -  '), textX, y + 62);
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
  doc.setFillColor(...palette.primary);
  doc.rect(0, top, pageWidth, height, 'F');

  // Gold accent strip
  doc.setFillColor(...palette.accent);
  doc.rect(0, top, pageWidth, 2, 'F');

  const y = top + 10;
  let textX = MARGIN;
  // Photo first (round-ish look via gold border), then logo to its right.
  if (photo) {
    try {
      const size = 52;
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(0.8);
      doc.rect(MARGIN, y, size, size);
      textX = MARGIN + size + 10;
    } catch { /* ignore */ }
  }
  if (logo) {
    try {
      const size = 24;
      doc.addImage(logo.dataUrl, logo.format, textX, y + 22, size, size, undefined, 'FAST');
      textX += size + 10;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  const name = primaryName(b);
  if (name) doc.text(name, textX, y + 14);

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.text(company, textX, y + 29);
  }

  const lic = licenseLabel(b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(230, 235, 245);
  if (b.title) doc.text(b.title, textX, y + 42);
  if (lic) {
    doc.setFontSize(8);
    doc.setTextColor(210, 218, 235);
    doc.text(lic, textX, y + 54);
  }

  // Right side: contact stack
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(230, 235, 245);
  const rx = pageWidth - MARGIN;
  let ry = y + 14;
  if (b.phone) { doc.text(b.phone, rx, ry, { align: 'right' }); ry += 12; }
  if (b.email) { doc.text(b.email, rx, ry, { align: 'right' }); ry += 12; }
  doc.setFontSize(8);
  doc.setTextColor(210, 218, 235);
  doc.text(prepared, rx, ry, { align: 'right' });
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
  drawHairline(doc, top, pageWidth);
  const y = top + 12;

  // Headshot
  let textX = MARGIN;
  if (photo) {
    try {
      const size = 62;
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(1.2);
      doc.rect(MARGIN, y, size, size);
      textX = MARGIN + size + 14;
    } catch { /* ignore */ }
  }

  // Italic-script name
  doc.setFont('times', 'italic');
  doc.setFontSize(20);
  doc.setTextColor(...palette.primary);
  const name = primaryName(b);
  if (name) doc.text(name, textX, y + 22);

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...GREY_900);
    doc.text(company, textX, y + 37);
  }

  // Title and contact lines.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title, textX, y + 50);
  const contact: string[] = [];
  if (b.phone) contact.push(b.phone);
  if (b.email) contact.push(b.email);
  if (contact.length > 0) doc.text(contact.join('  -  '), textX, y + 63);

  // License + prepared
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  const tail: string[] = [];
  const lic = licenseLabel(b);
  if (lic) tail.push(lic);
  tail.push(prepared);
  doc.text(tail.join('  -  '), textX, y + 76);

  // Logo on the far right of the headline row
  if (logo) {
    try {
      const size = 24;
      doc.addImage(
        logo.dataUrl,
        logo.format,
        pageWidth - MARGIN - size,
        y + 4,
        size,
        size,
        undefined,
        'FAST',
      );
    } catch { /* ignore */ }
  }
}

function renderTwoColumn(
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
  const midX = pageWidth / 2;

  // Left column: photo + logo + name + title + company + address
  let leftTextX = MARGIN;
  if (photo) {
    try {
      const size = 52;
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...palette.accent);
      doc.setLineWidth(0.8);
      doc.rect(MARGIN, y, size, size);
      leftTextX = MARGIN + size + 10;
    } catch { /* ignore */ }
  }
  if (logo) {
    try {
      const size = 20;
      doc.addImage(logo.dataUrl, logo.format, leftTextX, y + 26, size, size, undefined, 'FAST');
      leftTextX += size + 8;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...GREY_900);
  const name = primaryName(b);
  if (name) doc.text(name, leftTextX, y + 10);

  const company = brokerName(b);
  if (company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...GREY_900);
    doc.text(company, leftTextX, y + 24);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.title) doc.text(b.title, leftTextX, y + 36);

  let leftY = y + 49;
  const addr = joinAddress(b);
  if (addr) {
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    const addrLines = doc.splitTextToSize(addr, midX - leftTextX - 12);
    doc.text(addrLines, leftTextX, leftY);
    const lineCount = Array.isArray(addrLines) ? addrLines.length : 1;
    leftY += lineCount * 10;
  }

  const lic = licenseLabel(b);
  if (lic) {
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    doc.text(lic, leftTextX, leftY + 2);
  }

  // Right column: contact channels + prepared date
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...palette.primary);
  doc.text('CONTACT', midX + 8, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let ry = y + 24;
  const labelX = midX + 8;
  const valueX = midX + 60;
  const drawRow = (label: string, value: string | null) => {
    if (!value) return;
    doc.setTextColor(...GREY_500);
    doc.text(label, labelX, ry);
    doc.setTextColor(...GREY_900);
    doc.text(value, valueX, ry);
    ry += 13;
  };
  drawRow('Mobile', b.phone);
  drawRow('Email',  b.email);

  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  doc.text(prepared, midX + 8, ry + 4);
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
