// lib/pdf/brand-footer.ts
//
// Renders one of the FOOTER_TEMPLATE_META layouts onto a jsPDF doc.
// Pure rendering - knows nothing about which page it's on; the caller
// decides between 'every-page' and 'last-page' placement.
//
// Image loading: logo / photo URLs are fetched and base64-embedded so
// the PDF is self-contained. We do this once per render call, not per
// page. If the fetch fails (CORS, 404, expired blob URL) we silently
// skip the image and fall back to text-only.
//
// All measurements are in jsPDF points (1/72in). The doc is assumed to
// be Letter, with the same 48pt margin used elsewhere.

import type { jsPDF } from 'jspdf';
import {
  type FooterBrand,
  type FooterTemplateId,
  getFooterTemplateMeta,
} from '@/lib/footer-templates';

const MARGIN = 48;

const BRAND_NAVY: [number, number, number] = [26, 42, 68];   // #1a2a44
const BRAND_GOLD: [number, number, number] = [196, 163, 90]; // #c4a35a
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

function cleanWebsite(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function primaryName(b: FooterBrand): string {
  const trimmed = (b.name || '').trim();
  if (trimmed) return trimmed;
  return (b.company || '').trim();
}

export interface BrandFooterOptions {
  template: FooterTemplateId;
  brand: FooterBrand;
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
        renderBusinessCard(doc, brand, logo, footerTop, pageWidth);
        break;
      case 'banner':
        renderBanner(doc, brand, logo, footerTop, pageWidth, meta.heightPt);
        break;
      case 'minimal':
        renderMinimal(doc, brand, footerTop, pageWidth);
        break;
      case 'signature':
        renderSignature(doc, brand, photo, footerTop, pageWidth);
        break;
      case 'two-column':
        renderTwoColumn(doc, brand, logo, footerTop, pageWidth);
        break;
      case 'stacked':
        renderStacked(doc, brand, logo, footerTop, pageWidth);
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

function renderBusinessCard(doc: jsPDF, b: FooterBrand, logo: ImgRef, top: number, pageWidth: number) {
  drawHairline(doc, top, pageWidth);
  const y = top + 14;
  const logoW = 56;
  const logoH = 56;
  let textX = MARGIN;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, MARGIN, y - 2, logoW, logoH, undefined, 'FAST');
      textX = MARGIN + logoW + 14;
    } catch { /* ignore */ }
  }

  const name = primaryName(b);
  if (name) {
    doc.setFont('times', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(...GREY_900);
    doc.text(name, textX, y + 10);
  }

  if (b.title || b.company) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GREY_700);
    const sub = [b.title, b.name ? b.company : null].filter(Boolean).join(' - ');
    if (sub) doc.text(sub, textX, y + 24);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  const line: string[] = [];
  if (b.phone) line.push(b.phone);
  if (b.email) line.push(b.email);
  const web = cleanWebsite(b.website);
  if (web) line.push(web);
  if (line.length > 0) doc.text(line.join('  -  '), textX, y + 38);

  if (b.license_number) {
    doc.setTextColor(...GREY_500);
    doc.setFontSize(8);
    doc.text(`License ${b.license_number}`, textX, y + 50);
  }
}

function renderBanner(doc: jsPDF, b: FooterBrand, logo: ImgRef, top: number, pageWidth: number, height: number) {
  doc.setFillColor(...BRAND_NAVY);
  doc.rect(0, top, pageWidth, height, 'F');

  // Gold accent strip
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, top, pageWidth, 2, 'F');

  const y = top + 18;
  let textX = MARGIN;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, MARGIN, y, 40, 40, undefined, 'FAST');
      textX = MARGIN + 52;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  const name = primaryName(b);
  if (name) doc.text(name, textX, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(230, 235, 245);
  const line: string[] = [];
  if (b.phone) line.push(b.phone);
  if (b.email) line.push(b.email);
  const web = cleanWebsite(b.website);
  if (web) line.push(web);
  if (line.length > 0) {
    doc.text(line.join('  -  '), pageWidth - MARGIN, y + 14, { align: 'right' });
  }
  const addr = joinAddress(b);
  if (addr) {
    doc.setFontSize(8);
    doc.text(addr, pageWidth - MARGIN, y + 28, { align: 'right' });
  }
}

function renderMinimal(doc: jsPDF, b: FooterBrand, top: number, pageWidth: number) {
  drawHairline(doc, top, pageWidth);
  const y = top + 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  const left = primaryName(b);
  if (left) doc.text(left, MARGIN, y);

  const right: string[] = [];
  if (b.phone) right.push(b.phone);
  const web = cleanWebsite(b.website);
  if (web) right.push(web);
  if (right.length > 0) {
    doc.text(right.join('  -  '), pageWidth - MARGIN, y, { align: 'right' });
  }
}

function renderSignature(doc: jsPDF, b: FooterBrand, photo: ImgRef, top: number, pageWidth: number) {
  drawHairline(doc, top, pageWidth);
  const y = top + 14;

  // Circular-ish headshot (jsPDF can't easily clip to a circle, so we
  // draw a square photo and a subtle gold ring overlay).
  let textX = MARGIN;
  if (photo) {
    try {
      const size = 56;
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, size, size, undefined, 'FAST');
      doc.setDrawColor(...BRAND_GOLD);
      doc.setLineWidth(1.2);
      doc.rect(MARGIN, y, size, size);
      textX = MARGIN + size + 16;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'italic');
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_NAVY);
  const name = primaryName(b);
  if (name) doc.text(name, textX, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  const sub = [b.title, b.name ? b.company : null].filter(Boolean).join(' - ');
  if (sub) doc.text(sub, textX, y + 40);

  if (b.tagline) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...GREY_500);
    const lines = doc.splitTextToSize(b.tagline, pageWidth - textX - MARGIN);
    doc.text(lines, textX, y + 56);
  }
}

function renderTwoColumn(doc: jsPDF, b: FooterBrand, logo: ImgRef, top: number, pageWidth: number) {
  drawHairline(doc, top, pageWidth);
  const y = top + 14;
  const midX = pageWidth / 2;

  // Left: logo + name + address
  let leftTextX = MARGIN;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, MARGIN, y, 44, 44, undefined, 'FAST');
      leftTextX = MARGIN + 56;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...GREY_900);
  const name = primaryName(b);
  if (name) doc.text(name, leftTextX, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  if (b.company && b.name) doc.text(b.company, leftTextX, y + 24);
  const addr = joinAddress(b);
  if (addr) {
    const addrLines = doc.splitTextToSize(addr, midX - leftTextX - 12);
    doc.text(addrLines, leftTextX, y + 38);
  }

  // Right column: contact channels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_NAVY);
  doc.text('CONTACT', midX + 8, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
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
  drawRow('Office', b.office_phone);
  drawRow('Email',  b.email);
  drawRow('Web',    cleanWebsite(b.website));
}

function renderStacked(doc: jsPDF, b: FooterBrand, logo: ImgRef, top: number, pageWidth: number) {
  drawHairline(doc, top, pageWidth);
  const cx = pageWidth / 2;
  let y = top + 12;

  if (logo) {
    try {
      const size = 36;
      doc.addImage(logo.dataUrl, logo.format, cx - size / 2, y, size, size, undefined, 'FAST');
      y += size + 6;
    } catch { /* ignore */ }
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...GREY_900);
  const name = primaryName(b);
  if (name) {
    doc.text(name, cx, y, { align: 'center' });
    y += 14;
  }

  if (b.title || (b.name && b.company)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GREY_700);
    const sub = [b.title, b.name ? b.company : null].filter(Boolean).join(' - ');
    if (sub) {
      doc.text(sub, cx, y, { align: 'center' });
      y += 12;
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_700);
  const contactLine: string[] = [];
  if (b.phone) contactLine.push(b.phone);
  if (b.email) contactLine.push(b.email);
  const web = cleanWebsite(b.website);
  if (web) contactLine.push(web);
  if (contactLine.length > 0) {
    doc.text(contactLine.join('  -  '), cx, y, { align: 'center' });
    y += 12;
  }
  const addr = joinAddress(b);
  if (addr) {
    doc.setTextColor(...GREY_500);
    doc.text(addr, cx, y, { align: 'center' });
  }
}
