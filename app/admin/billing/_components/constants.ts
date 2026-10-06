// app/admin/billing/_components/constants.ts
//
// Status/type option tables shared by lists, filters, and drawers.

import type { AgreementStatus, AgreementType, PaymentMode } from '@/lib/agreements';
import type { InvoiceStatus } from '@/lib/invoices';

export const AG_STATUS: { value: AgreementStatus; label: string; tone: string }[] = [
  { value: 'draft',     label: 'Draft',     tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',      label: 'Sent',      tone: 'bg-[#E3F7FF] text-[#285766] border-[#64D9FF]/30' },
  { value: 'signed',    label: 'Signed',    tone: 'bg-[#F6F3FB] text-[#42277C] border-[#D9CFF0]' },
  { value: 'active',    label: 'Active',    tone: 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30' },
  { value: 'expired',   label: 'Expired',   tone: 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-[#FFEAE6] text-[#661102] border-[#FF2A04]/30' },
];

export const INV_STATUS: { value: InvoiceStatus; label: string; tone: string }[] = [
  { value: 'draft',   label: 'Draft',   tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',    label: 'Sent',    tone: 'bg-[#E3F7FF] text-[#285766] border-[#64D9FF]/30' },
  { value: 'paid',    label: 'Paid',    tone: 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30' },
  { value: 'overdue', label: 'Overdue', tone: 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30' },
  { value: 'void',    label: 'Void',    tone: 'bg-[#FFEAE6] text-[#661102] border-[#FF2A04]/30' },
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
  'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#7059A8]';
export const INPUT_READONLY =
  'w-full px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-600 cursor-not-allowed';
