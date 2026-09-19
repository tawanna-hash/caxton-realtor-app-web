// lib/invoices.ts
//
// Types + helpers for the `invoices` table.

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export type InvoiceLineItem = {
  description: string;
  qty: number;
  unit_cents: number;       // pre-tax unit price
};

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  payment_date: string;
  payment_method: string | null;
  reference: string | null;
  memo: string | null;
  source: string;
  external_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceAuditEntry {
  event:
    | 'invoice_updated'
    | 'invoice_auto_charge_succeeded'
    | 'invoice_auto_charge_failed'
    | string;
  timestamp: string;
  user_email?: string | null;
  fields?: string[];
  changes?: Record<string, { from: unknown; to: unknown }>;
  /** Free-text context for non-field events (e.g. an auto-charge failure reason). */
  details?: string | null;
}

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
  audit_log?: InvoiceAuditEntry[];
  payments?: InvoicePayment[];
  amount_paid_cents?: number;
  balance_cents?: number;
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

/**
 * Compute total cents from line items (excluding tax). Throws rather than
 * silently truncating/wrapping — `| 0` coerces to signed 32-bit and drops
 * fractional quantities, which let malformed line items pass validation
 * with a wrong total. Every quantity/unit price must be a safe nonnegative
 * integer and the running sum must stay in the safe-integer range.
 */
export function lineItemsTotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, li) => {
    if (!Number.isSafeInteger(li.qty) || li.qty <= 0) {
      throw new Error(`line item has an invalid quantity: ${li.qty}`);
    }
    if (!Number.isSafeInteger(li.unit_cents) || li.unit_cents < 0) {
      throw new Error(`line item has an invalid unit price: ${li.unit_cents}`);
    }
    const next = sum + li.qty * li.unit_cents;
    if (!Number.isSafeInteger(next)) {
      throw new Error('line item total is too large');
    }
    return next;
  }, 0);
}

/**
 * Live-edit preview total — tolerant of transient invalid rows (e.g. a
 * blank quantity mid-keystroke) so form UIs don't crash while typing.
 * Server-side validation must use the strict `lineItemsTotal` above, never
 * this one.
 */
export function previewLineItemsTotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, li) => {
    const qty = Number.isFinite(li.qty) && li.qty > 0 ? li.qty : 0;
    const unit = Number.isFinite(li.unit_cents) && li.unit_cents > 0 ? li.unit_cents : 0;
    return sum + Math.round(qty) * Math.round(unit);
  }, 0);
}

/** True when `value` is a safe integer cents amount, nonnegative unless `allowZero` is false and > 0 is required by the caller. */
export function isSafeCents(value: unknown, opts: { positive?: boolean } = {}): value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false;
  return opts.positive ? value > 0 : value >= 0;
}

/** Strict ISO calendar date check — rejects shapes like `2026-99-99` that a regex alone would accept and Postgres would later reject as a 500. */
export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Amount actually still owed on an invoice. Prefer this over `total_cents`
 * anywhere the semantic value is "amount due" — a partially paid invoice's
 * total is not what remains to be collected, and a `paid` invoice with no
 * ledger rows should read as 0 due (the fallback below), never as if unpaid.
 */
export function outstandingCents(invoice: {
  total_cents: number;
  status: InvoiceStatus;
  balance_cents?: number | null;
  amount_paid_cents?: number | null;
}): number {
  if (typeof invoice.balance_cents === 'number') return Math.max(invoice.balance_cents, 0);
  if (invoice.status === 'paid' || invoice.status === 'void') return 0;
  if (typeof invoice.amount_paid_cents === 'number') {
    return Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  }
  return invoice.total_cents;
}

// ── Payment types (tender) ─────────────────────────────────────────

/**
 * Canonical payment types offered anywhere a payment is recorded or edited.
 * Stored as free text on invoice_payments.payment_method, so historical rows
 * may hold values outside this list.
 */
export const PAYMENT_METHODS = ['Check', 'Cash', 'ACH / bank transfer', 'Credit card', 'Other'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** True when a stored payment_method represents a check. */
export function isCheckPayment(method: string | null | undefined): boolean {
  return /^\s*check/i.test(method ?? '');
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
