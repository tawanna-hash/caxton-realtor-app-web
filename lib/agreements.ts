// lib/agreements.ts
//
// Types + helpers for the `agreements` table. Pattern mirrors
// `lib/advertisers.ts`.

export type AgreementStatus =
  | 'draft' | 'sent' | 'signed' | 'active' | 'expired' | 'cancelled';

export type PaymentMode = 'card' | 'link' | 'invoice' | 'check';

export type AgreementType =
  | 'print_ad' | 'eblast' | 'sponsored_content' | 'package' | 'other';

export type AgreementAuditEntry = {
  event: string;
  timestamp: string;
  user_email?: string;
  details?: string;
};

export type AgreementAdTiming = {
  months: string[];   // e.g. ["jan","feb","mar"]
  years: number;      // count of issue years
};

export interface Agreement {
  id: string;
  advertiser_id: number | null;

  // Identity snapshot at sign time
  company_name: string | null;
  rep_name: string | null;
  advertiser_email: string | null;
  advertiser_phone: string | null;
  advertiser_address: string | null;

  // Terms
  type: AgreementType | null;
  status: AgreementStatus;
  start_date: string | null;     // ISO date
  end_date: string | null;

  // Placement
  ad_size: string | null;
  frequency: string | null;
  ad_rate_cents: number | null;
  ad_timing: AgreementAdTiming | null;
  eblast_packages: string[];

  amount_cents: number | null;

  // Signature
  sign_date: string | null;
  exp_date: string | null;
  renewal_notice_date: string | null;
  signed_at: string | null;
  signed_document: string | null;
  sent_to_email: string | null;
  is_uploaded: boolean;

  // Billing
  billing_name: string | null;
  billing_email: string | null;
  payment_mode: PaymentMode | null;

  // Stripe
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link_url: string | null;
  paid_at: string | null;

  notes: string | null;
  audit_log: AgreementAuditEntry[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgreementWithAdvertiser extends Agreement {
  advertiser_name: string | null;
  /** Total of all non-void invoice totals tied to this agreement (cents). */
  invoiced_cents: number;
  /** Total of paid invoice totals tied to this agreement (cents). */
  paid_cents: number;
}

// Allow-list for PATCH endpoint
export const AGREEMENT_PATCHABLE_FIELDS = [
  'advertiser_id',
  'company_name','rep_name','advertiser_email','advertiser_phone','advertiser_address',
  'type','status','start_date','end_date',
  'ad_size','frequency','ad_rate_cents','ad_timing','eblast_packages',
  'amount_cents',
  'sign_date','exp_date','renewal_notice_date','signed_at','signed_document',
  'sent_to_email','is_uploaded',
  'billing_name','billing_email','payment_mode',
  'stripe_customer_id','stripe_invoice_id','stripe_payment_intent_id',
  'stripe_payment_link_url','paid_at',
  'notes',
] as const;

export type AgreementPatchableField = (typeof AGREEMENT_PATCHABLE_FIELDS)[number];

export const AGREEMENT_STATUS_VALUES = new Set<AgreementStatus>([
  'draft','sent','signed','active','expired','cancelled',
]);
export const PAYMENT_MODE_VALUES = new Set<PaymentMode>([
  'card','link','invoice','check',
]);
export const AGREEMENT_TYPE_VALUES = new Set<AgreementType>([
  'print_ad','eblast','sponsored_content','package','other',
]);

/** Append an audit entry without losing existing log. */
export function appendAudit(
  log: AgreementAuditEntry[] | null | undefined,
  entry: AgreementAuditEntry,
): AgreementAuditEntry[] {
  const base = Array.isArray(log) ? log : [];
  return [...base, entry];
}
