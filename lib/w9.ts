// Shared (client + server) W-9 schema and field validation.
// The IRS form currently in effect is Rev. March 2024. Rev. June 2026 is a
// draft marked "do not file" until the IRS publishes it as final; swap the
// template file in private-forms/irs/fw9.pdf and update W9_REVISION then.
export const W9_REVISION = 'Rev. March 2024';
export const W9_TAX_YEAR = 2026;

export const W9_CLASSIFICATIONS = [
  { value: 'individual', label: 'Individual / sole proprietor or single-member LLC' },
  { value: 'c_corp', label: 'C corporation' },
  { value: 's_corp', label: 'S corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust_estate', label: 'Trust / estate' },
  { value: 'llc', label: 'Limited liability company (LLC)' },
  { value: 'other', label: 'Other' },
] as const;
export type W9Classification = (typeof W9_CLASSIFICATIONS)[number]['value'];

export type W9Signature = {
  /** data URL (PNG or JPEG) */
  dataUrl: string;
  /** Position/size as fractions of page 1 (origin top-left). */
  x: number; y: number; w: number;
};

export type W9Data = {
  name: string;
  businessName: string;
  classification: W9Classification | '';
  llcTaxClass: 'C' | 'S' | 'P' | '';
  otherText: string;
  foreignOwners: boolean;
  exemptPayeeCode: string;
  fatcaCode: string;
  address: string;
  cityStateZip: string;
  requester: string;
  accountNumbers: string;
  tinType: 'ssn' | 'ein';
  tin: string;
  certified: boolean;
  signedDate: string; // YYYY-MM-DD
};

export const EMPTY_W9: W9Data = {
  name: '', businessName: '', classification: '', llcTaxClass: '', otherText: '',
  foreignOwners: false, exemptPayeeCode: '', fatcaCode: '', address: '', cityStateZip: '',
  requester: '', accountNumbers: '', tinType: 'ein', tin: '', certified: false, signedDate: '',
};

export const digitsOnly = (s: string) => s.replace(/\D/g, '');

export function formatTin(type: 'ssn' | 'ein', raw: string): string {
  const d = digitsOnly(raw).slice(0, 9);
  if (type === 'ssn') return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-');
  return [d.slice(0, 2), d.slice(2)].filter(Boolean).join('-');
}

/** Returns a list of problems; empty means ready to generate. */
export function validateW9(d: W9Data, sig: W9Signature | null): string[] {
  const e: string[] = [];
  if (!d.name.trim()) e.push('Line 1: enter the name shown on your income tax return.');
  if (!d.classification) e.push('Line 3a: choose a federal tax classification.');
  if (d.classification === 'llc' && !d.llcTaxClass) e.push('Line 3a: choose the LLC tax classification (C, S or P).');
  if (d.classification === 'other' && !d.otherText.trim()) e.push('Line 3a: describe the Other classification.');
  if (!d.address.trim()) e.push('Line 5: enter the street address.');
  if (!d.cityStateZip.trim()) e.push('Line 6: enter city, state and ZIP.');
  if (digitsOnly(d.tin).length !== 9) e.push(`Part I: enter a complete 9-digit ${d.tinType === 'ssn' ? 'SSN' : 'EIN'}.`);
  if (!d.certified) e.push('Part II: confirm the certification statements.');
  if (!sig) e.push('Part II: upload and place the signature.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.signedDate)) e.push('Part II: enter the signature date.');
  return e;
}
