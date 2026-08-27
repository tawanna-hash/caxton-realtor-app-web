import type { jsPDF } from 'jspdf';
import {
  type FooterBrand,
  DEFAULT_FOOTER_COLUMN_WIDTHS,
  type FooterColumnWidths,
  type FooterPalette,
  type FooterTemplateId,
  getFooterPalette,
  getFooterTemplateMeta,
} from '@/lib/footer-templates';

const MARGIN = 48;
const WHITE: [number, number, number] = [255, 255, 255];
const GREY_900: [number, number, number] = [17, 24, 39];
const GREY_600: [number, number, number] = [75, 85, 99];
const GREY_300: [number, number, number] = [209, 213, 219];

async function loadImage(url: string | null): Promise<{
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
} | null> {
  if (!url || typeof window === 'undefined') return null;
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
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('image dimensions unavailable'));
      image.onload = () => resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
      image.src = dataUrl;
    });
    return { dataUrl, format, ...dimensions };
  } catch {
    return null;
  }
}

function primaryName(brand: FooterBrand): string {
  return (brand.name || brand.company || '').trim();
}

function addImage(
  doc: jsPDF,
  image: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!image) return;
  try {
    const scale = Math.min(width / image.width, height / image.height);
    const renderedWidth = image.width * scale;
    const renderedHeight = image.height * scale;
    const renderedX = x + (width - renderedWidth) / 2;
    const renderedY = y + (height - renderedHeight) / 2;
    doc.addImage(
      image.dataUrl,
      image.format,
      renderedX,
      renderedY,
      renderedWidth,
      renderedHeight,
      undefined,
      'FAST',
    );
  } catch {
    // A broken or cross-origin brand image should not block the report.
  }
}

function drawIdentity(
  doc: jsPDF,
  brand: FooterBrand,
  palette: FooterPalette,
  x: number,
  top: number,
  maxWidth: number,
  stacked: boolean,
) {
  const name = primaryName(brand);
  doc.setTextColor(...GREY_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  if (name) doc.text(doc.splitTextToSize(name, maxWidth), x, top + 24);

  doc.setTextColor(...palette.primary);
  doc.setFontSize(8.5);
  doc.text((brand.title || 'REALTOR®').toUpperCase(), x, top + 39);

  doc.setTextColor(...GREY_900);
  doc.setFontSize(9);
  if (brand.company) {
    doc.text(doc.splitTextToSize(brand.company, maxWidth), x, top + (stacked ? 55 : 53));
  }

  const contact = [
    brand.phone ? `C: ${brand.phone}` : null,
    brand.office_phone ? `O: ${brand.office_phone}` : null,
    brand.email,
    brand.website,
  ].filter(Boolean) as string[];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY_600);
  if (stacked) {
    contact.slice(0, 3).forEach((line, index) => {
      doc.text(doc.splitTextToSize(line, maxWidth), x, top + 70 + index * 11);
    });
  } else {
    const first = contact.slice(0, 2).join('  ·  ');
    const second = contact.slice(2).join('  ·  ');
    if (first) doc.text(doc.splitTextToSize(first, maxWidth), x, top + 68);
    if (second) doc.text(doc.splitTextToSize(second, maxWidth), x, top + 81);
  }
}

function renderSplitColumn(
  doc: jsPDF,
  brand: FooterBrand,
  palette: FooterPalette,
  logo: Awaited<ReturnType<typeof loadImage>>,
  photo: Awaited<ReturnType<typeof loadImage>>,
  top: number,
  pageWidth: number,
  columns: FooterColumnWidths,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const height = 96;
  const availableWidth = width;
  const requestedTotal = columns.headshot + columns.details + columns.logo;
  const photoWidth = availableWidth * (columns.headshot / requestedTotal);
  const logoWidth = availableWidth * (columns.logo / requestedTotal);
  const detailsX = left + photoWidth + 22;
  const detailsWidth = width - photoWidth - logoWidth - 44;

  doc.setFillColor(...WHITE);
  doc.setDrawColor(...GREY_300);
  doc.rect(left, top, width, height, 'FD');
  doc.line(left + photoWidth, top, left + photoWidth, top + height);
  doc.line(pageWidth - MARGIN - logoWidth, top, pageWidth - MARGIN - logoWidth, top + height);

  if (photo) {
    addImage(doc, photo, left + 18, top + 18, 60, 60);
  } else {
    doc.setFillColor(238, 242, 247);
    doc.circle(left + 48, top + 48, 30, 'F');
  }

  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(2.5);
  doc.line(detailsX, top + 17, detailsX, top + 80);
  drawIdentity(doc, brand, palette, detailsX + 12, top, detailsWidth - 12, false);

  addImage(doc, logo, pageWidth - MARGIN - logoWidth + 18, top + 22, 70, 46);
  if (!logo && brand.company) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_600);
    doc.text(
      doc.splitTextToSize(brand.company.toUpperCase(), logoWidth - 20),
      pageWidth - MARGIN - logoWidth / 2,
      top + 46,
      { align: 'center' },
    );
  }
}

function renderMinimalRows(
  doc: jsPDF,
  brand: FooterBrand,
  palette: FooterPalette,
  logo: Awaited<ReturnType<typeof loadImage>>,
  photo: Awaited<ReturnType<typeof loadImage>>,
  top: number,
  pageWidth: number,
) {
  const left = MARGIN;
  const width = pageWidth - MARGIN * 2;
  const height = 96;
  const photoWidth = 82;
  const logoWidth = 106;
  const detailsX = left + photoWidth + 18;
  const detailsWidth = width - photoWidth - logoWidth - 34;

  doc.setFillColor(...WHITE);
  doc.setDrawColor(...GREY_300);
  doc.rect(left, top, width, height, 'FD');
  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(2);
  doc.line(left, top, pageWidth - MARGIN, top);

  if (photo) {
    addImage(doc, photo, left + 12, top + 18, 56, 56);
  } else {
    doc.setFillColor(238, 242, 247);
    doc.circle(left + 40, top + 46, 28, 'F');
  }

  drawIdentity(doc, brand, palette, detailsX, top, detailsWidth, true);
  addImage(doc, logo, pageWidth - MARGIN - logoWidth + 18, top + 22, 70, 46);
}

export interface BrandFooterOptions {
  template: FooterTemplateId;
  brand: FooterBrand;
  columns?: FooterColumnWidths;
  preparedAt?: Date;
}

export async function applyBrandFooter(doc: jsPDF, opts: BrandFooterOptions): Promise<void> {
  const meta = getFooterTemplateMeta(opts.template);
  const palette = getFooterPalette(opts.brand);
  const columns = opts.columns ?? DEFAULT_FOOTER_COLUMN_WIDTHS;
  const [logo, photo] = await Promise.all([
    loadImage(opts.brand.logo_url),
    loadImage(opts.brand.photo_url),
  ]);
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const targetPages = meta.placement === 'last-page'
    ? [pageCount]
    : Array.from({ length: pageCount }, (_, index) => index + 1);

  for (const pageNum of targetPages) {
    doc.setPage(pageNum);
    const top = pageHeight - meta.heightPt - 16;
    if (opts.template === 'minimal-rows') {
      renderMinimalRows(doc, opts.brand, palette, logo, photo, top, pageWidth);
    } else {
      renderSplitColumn(doc, opts.brand, palette, logo, photo, top, pageWidth, columns);
    }
  }
}
