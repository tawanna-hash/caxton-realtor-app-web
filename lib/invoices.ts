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
  'stripe_checkout_session_id','stripe_customer_id',
  'issued_at','due_date','paid_at','voided_at',
  'bill_to_name','bill_to_email','bill_to_address',
  'memo','line_items',
  'last_reminder_sent_at','reminder_count',
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

// ── Accounts Receivable aging ──────────────────────────────────────

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export interface AgingBucketTotals {
  current: number;   // not yet due, cents
  d1_30: number;      // 1-30 days past due, cents
  d31_60: number;     // 31-60 days past due, cents
  d61_90: number;     // 61-90 days past due, cents
  d90_plus: number;   // 90+ days past due, cents
}

export function emptyAgingTotals(): AgingBucketTotals {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

/** Classify an unpaid invoice's outstanding balance into an aging bucket, given days past due (negative = not yet due). */
export function agingBucketForDaysPastDue(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
};
