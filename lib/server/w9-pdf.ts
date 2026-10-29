import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { digitsOnly, type W9Data, type W9Signature } from '@/lib/w9';

const P1 = 'topmostSubform[0].Page1[0].';
const CHECK_INDEX: Record<string, number> = { individual: 0, c_corp: 1, s_corp: 2, partnership: 3, trust_estate: 4, llc: 5, other: 6 };

function decodeDataUrl(url: string): { bytes: Uint8Array; type: 'png' | 'jpg' } {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) throw new Error('Signature must be a PNG or JPEG image.');
  return { bytes: Buffer.from(m[2], 'base64'), type: m[1] === 'png' ? 'png' : 'jpg' };
}

/** Fill the official IRS W-9, stamp the signature image and date, and flatten. */
export async function generateW9Pdf(d: W9Data, sig: W9Signature): Promise<Buffer> {
  const template = await fs.readFile(path.join(process.cwd(), 'private-forms', 'irs', 'fw9.pdf'));
  const pdf = await PDFDocument.load(template);
  const form = pdf.getForm();
  const text = (name: string, v: string) => { if (v) form.getTextField(P1 + name).setText(v); };

  text('f1_01[0]', d.name.trim());
  text('f1_02[0]', d.businessName.trim());
  const idx = CHECK_INDEX[d.classification];
  if (idx !== undefined) form.getCheckBox(`${P1}Boxes3a-b_ReadOrder[0].c1_1[${idx}]`).check();
  if (d.classification === 'llc') text('Boxes3a-b_ReadOrder[0].f1_03[0]', d.llcTaxClass);
  if (d.classification === 'other') text('Boxes3a-b_ReadOrder[0].f1_04[0]', d.otherText.trim());
  if (d.foreignOwners && (d.classification === 'partnership' || d.classification === 'trust_estate' || d.classification === 'llc')) {
    form.getCheckBox(P1 + 'c1_2[0]').check();
  }
  text('f1_05[0]', d.exemptPayeeCode.trim());
  text('f1_06[0]', d.fatcaCode.trim());
  text('Address_ReadOrder[0].f1_07[0]', d.address.trim());
  text('Address_ReadOrder[0].f1_08[0]', d.cityStateZip.trim());
  text('f1_09[0]', d.requester.trim());
  text('f1_10[0]', d.accountNumbers.trim());

  const t = digitsOnly(d.tin);
  if (t.length !== 9) throw new Error('TIN must be 9 digits.');
  if (d.tinType === 'ssn') {
    text('f1_11[0]', t.slice(0, 3)); text('f1_12[0]', t.slice(3, 5)); text('f1_13[0]', t.slice(5));
  } else {
    text('f1_14[0]', t.slice(0, 2)); text('f1_15[0]', t.slice(2));
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  form.flatten();

  const page = pdf.getPage(0);
  const { width: pw, height: ph } = page.getSize();
  const { bytes, type } = decodeDataUrl(sig.dataUrl);
  const img = type === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const w = clamp(sig.w, 0.03, 0.6) * pw;
  const h = (img.height / img.width) * w;
  const x = clamp(sig.x, 0, 1) * pw;
  const yTop = clamp(sig.y, 0, 1) * ph;
  page.drawImage(img, { x: Math.min(x, pw - w), y: Math.max(0, ph - yTop - h), width: w, height: h });

  // Date beside the "Date" label on the signature row.
  const [yy, mm, dd] = d.signedDate.split('-');
  page.drawText(`${mm}/${dd}/${yy}`, { x: 425, y: 196, size: 10, font, color: rgb(0, 0, 0) });

  pdf.setTitle(`Form W-9 (${'Rev. March 2024'}) - ${d.name.trim()}`);
  pdf.setProducer('Realty News Now Get Paid');
  return Buffer.from(await pdf.save());
}
