// app/admin/billing/_components/constants.ts
//
// Status/type option tables shared by lists, filters, and drawers.

import type { AgreementStatus, AgreementType, PaymentMode } from '@/lib/agreements';
import type { InvoiceStatus } from '@/lib/invoices';

export const AG_STATUS: { value: AgreementStatus; label: string; tone: string }[] = [
  { value: 'draft',     label: 'Draft',     tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',      label: 'Sent',      tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'signed',    label: 'Signed',    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'active',    label: 'Active',    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'expired',   label: 'Expired',   tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const INV_STATUS: { value: InvoiceStatus; label: string; tone: string }[] = [
  { value: 'draft',   label: 'Draft',   tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',    label: 'Sent',    tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'paid',    label: 'Paid',    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'overdue', label: 'Overdue', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'void',    label: 'Void',    tone: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const AG_TYPES: { value: AgreementType; label: string }[] = [
  { value: 'print_ad',          label: 'Print ad' },
  { value: 'eblast',            label: 'Eblast' },
  { value: 'sponsored_content', label: 'Sponsored content' },
  { value: 'package',           label: 'Package' },
  { value: 'other',             label: 'Other' },
];

export const PAY_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'card',    label: 'Card' },
  { value: 'link',    label: 'Stripe link' },
  { value: 'invoice', label: 'Invoice (manual)' },
  { value: 'check',   label: 'Check' },
];

// Shared input-class shortcuts used by both drawers.
export const INPUT =
  'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
export const INPUT_READONLY =
  'w-full px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-600 cursor-not-allowed';
