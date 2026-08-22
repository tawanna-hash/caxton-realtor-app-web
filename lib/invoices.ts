// lib/invoices.ts
//
// Types + helpers for the `invoices` table.

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export type InvoiceLineItem = {
  description: string;
  qty: number;
  unit_cents: number;       // pre-tax unit price
};

export interface Invoice {
  id: string;
  advertiser_id: number;
  agreement_id: string | null;
  number: string | null;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;           // generated column (amount + tax)
  status: InvoiceStatus;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link_url: string | null;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  voided_at: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  memo: string | null;
  line_items: InvoiceLineItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithAdvertiser extends Invoice {
  advertiser_name: string | null;
  /** Computed: due_date < today && status != paid/void. */
  is_overdue: boolean;
}

export const INVOICE_PATCHABLE_FIELDS = [
  'agreement_id',
  'number',
  'amount_cents','tax_cents',
  'status',
  'stripe_invoice_id','stripe_payment_intent_id','stripe_payment_link_url',
  'issued_at','due_date','paid_at','voided_at',
  'bill_to_name','bill_to_email','bill_to_address',
  'memo','line_items',
] as const;
export const INVOICE_STATUS_VALUES = new Set<InvoiceStatus>([
  'draft','sent','paid','overdue','void',
]);

/**
 * Generate next invoice number for a publication, e.g. RLM-2026-0042.
 * `seq` should come from a SELECT COUNT(*) + 1 in the route — kept
 * here so the format is one place to change.
 */
export function formatInvoiceNumber(publication: string, year: number, seq: number): string {
  const code =
    publication === 'austin'      ? 'RLM'
    : publication === 'san_antonio' ? 'NSL'
    : publication === 'both'      ? 'CAX'
    : publication.toUpperCase().slice(0, 3);
  return `${code}-${year}-${String(seq).padStart(4, '0')}`;
}

/** Compute total cents from line items (excluding tax). */
export function lineItemsTotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, li) => sum + (li.qty | 0) * (li.unit_cents | 0), 0);
}

/** Pretty-print dollars from cents. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
