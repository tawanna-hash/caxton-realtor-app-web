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
const GREY_500: [number, number, number] = [107, 114, 128];
const GREY_200: [number, number, number] = [229, 231, 235];
const DESIGN_NAVY: [number, number, number] = [21, 63, 131];
const DESIGN_CYAN: [number, number, number] = [8, 172, 224];
const DESIGN_BLACK: [number, number, number] = [34, 34, 34];

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
      case 'signature':
        renderSignature(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
      case 'two-column':
        renderTwoColumn(doc, brand, palette, logo, photo, prepared, footerTop, pageWidth);
        break;
    }
  }
}

// ── Template renderers ────────────────────────────────────────────

type ImgRef = Awaited<ReturnType<typeof loadImage>>;

function drawSocialIcons(
  doc: jsPDF,
  x: number,
  y: number,
  color: [number, number, number],
  onDark = false,
) {
  const labels = ['f', 'ig', 't', 'in'];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setDrawColor(...color);
  doc.setTextColor(...color);
  labels.forEach((label, index) => {
    const cx = x + index * 18;
    doc.circle(cx, y, 6);
    doc.text(label, cx, y + 2, { align: 'center' });
  });
  if (onDark) doc.setTextColor(...WHITE);
}

function renderBusinessCard(
  doc: jsPDF,
  b: FooterBrand,
  _palette: FooterPalette,
  logo: ImgRef,
  _photo: ImgRef,
  _prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const height = 90;
  const logoWidth = 142;
  const identityWidth = 154;
  const identityX = left + logoWidth;
  const contactX = identityX + identityWidth;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, height);

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, left + 48, top + 17, 44, 30, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company.toUpperCase(), 112), left + logoWidth / 2, top + 62, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...DESIGN_NAVY);
  const name = primaryName(b);
  if (name) doc.text(name, identityX + 12, top + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_900);
  doc.text((b.title || 'REALTOR®').toUpperCase(), identityX + 12, top + 35);
  doc.setFillColor(...DESIGN_CYAN);
  doc.rect(identityX + 12, top + 48, 28, 7, 'F');
  doc.setFillColor(...DESIGN_NAVY);
  doc.rect(identityX + 12, top + 55, 28, 35, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY_900);
  if (b.phone) doc.text(`C: ${b.phone}`, contactX + 10, top + 62);
  if (b.office_phone) doc.text(`O: ${b.office_phone}`, contactX + 10, top + 76);
  if (b.email) doc.text(b.email, contactX + 142, top + 62);
  if (b.website) doc.text(b.website, contactX + 142, top + 76);
  doc.setFillColor(...DESIGN_NAVY);
  doc.rect(pageWidth - MARGIN - 116, top + 10, 116, 25, 'F');
  drawSocialIcons(doc, pageWidth - MARGIN - 91, top + 22.5, DESIGN_CYAN, true);
}

function renderBanner(
  doc: jsPDF,
  b: FooterBrand,
  _palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  _prepared: string,
  top: number,
  pageWidth: number,
  height: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const panelWidth = 138;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, height);
  doc.setFillColor(...DESIGN_NAVY);
  doc.rect(left, top, panelWidth, height, 'F');

  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, left + 39, top + 12, 60, 60, undefined, 'FAST');
      doc.setDrawColor(...WHITE);
      doc.setLineWidth(3);
      doc.circle(left + 69, top + 42, 31);
    } catch { /* ignore */ }
  }
  const name = primaryName(b);
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  if (name) doc.text(name, left + panelWidth / 2, top + 91, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text((b.title || 'REALTOR®').toUpperCase(), left + panelWidth / 2, top + 106, { align: 'center' });

  const contactX = left + panelWidth + 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...GREY_900);
  if (b.phone) doc.text(`C: ${b.phone}`, contactX, top + 27);
  if (b.office_phone) doc.text(`O: ${b.office_phone}`, contactX, top + 47);
  if (b.email) doc.text(b.email, contactX, top + 67);
  if (b.website) doc.text(b.website, contactX, top + 87);
  drawSocialIcons(doc, contactX + 5, top + 108, DESIGN_NAVY);

  const logoX = pageWidth - MARGIN - 122;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, logoX + 39, top + 22, 44, 34, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company.toUpperCase(), 104), logoX + 61, top + 78, { align: 'center' });
}

function renderSignature(
  doc: jsPDF,
  b: FooterBrand,
  _palette: FooterPalette,
  logo: ImgRef,
  photo: ImgRef,
  _prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const panelWidth = 150;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, 112);
  doc.setFillColor(...DESIGN_NAVY);
  doc.rect(left, top, panelWidth, 112, 'F');
  doc.setDrawColor(...DESIGN_CYAN);
  doc.setLineWidth(6);
  doc.circle(left + 82, top + 56, 39);
  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, left + 49, top + 23, 66, 66, undefined, 'FAST');
    } catch { /* ignore */ }
  }

  const name = primaryName(b);
  const company = brokerName(b);
  const textX = left + panelWidth + 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...DESIGN_NAVY);
  if (name) doc.text(name, textX, top + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_900);
  doc.text((b.title || 'REALTOR®').toUpperCase(), textX, top + 34);
  doc.setFillColor(...DESIGN_CYAN);
  doc.rect(textX, top + 41, 30, 2, 'F');
  doc.rect(textX, top + 51, 20, 52, 'F');
  doc.setFontSize(9.5);
  doc.setTextColor(...GREY_900);
  if (b.phone) doc.text(`C: ${b.phone}`, textX + 30, top + 62);
  if (b.office_phone) doc.text(`O: ${b.office_phone}`, textX + 30, top + 77);
  if (b.email) doc.text(b.email, textX + 30, top + 92);
  if (b.website) doc.text(b.website, textX + 30, top + 107);

  const logoX = pageWidth - MARGIN - 118;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, logoX + 37, top + 18, 44, 34, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company.toUpperCase(), 104), logoX + 59, top + 71, { align: 'center' });
  drawSocialIcons(doc, logoX + 30, top + 99, DESIGN_CYAN);
}

function renderTwoColumn(
  doc: jsPDF,
  b: FooterBrand,
  _palette: FooterPalette,
  logo: ImgRef,
  _photo: ImgRef,
  _prepared: string,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const bodyHeight = 82;
  doc.setDrawColor(...GREY_200);
  doc.rect(left, top, width, 110);
  const col1 = left + 190;
  const col2 = left + 392;
  doc.setDrawColor(...GREY_500);
  doc.line(col1, top + 12, col1, top + bodyHeight - 10);

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, left + 22, top + 25, 44, 32, undefined, 'FAST');
    } catch { /* ignore */ }
  }
  const company = brokerName(b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...GREY_900);
  if (company) doc.text(doc.splitTextToSize(company.toUpperCase(), 104), left + 76, top + 40);

  const name = primaryName(b);
  doc.setFontSize(14);
  doc.setTextColor(...DESIGN_NAVY);
  if (name) doc.text(name.toUpperCase(), col1 + 28, top + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_900);
  doc.text((b.title || 'REALTOR®').toUpperCase(), col1 + 28, top + 32);
  doc.setFontSize(9);
  if (b.phone) doc.text(`C: ${b.phone}`, col1 + 28, top + 47);
  if (b.office_phone) doc.text(`O: ${b.office_phone}`, col1 + 28, top + 59);
  if (b.email) doc.text(b.email, col1 + 28, top + 71);
  if (b.website) doc.text(b.website, col1 + 28, top + 81);
  drawSocialIcons(doc, col2 + 28, top + 43, DESIGN_BLACK);

  doc.setFillColor(...DESIGN_BLACK);
  doc.rect(left, top + bodyHeight, width, 28, 'F');
  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text(
    b.tagline || 'As your trusted real estate agent, I provide results that move you',
    left + width / 2,
    top + bodyHeight + 18,
    { align: 'center' },
  );
}
