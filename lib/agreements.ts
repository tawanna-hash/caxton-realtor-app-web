// lib/agreements.ts
//
// Types + helpers for the `agreements` table. Pattern mirrors
// `lib/advertisers.ts`.

export type AgreementStatus =
  | 'draft' | 'proposal_sent' | 'proposal_approved' | 'sent' | 'signed' | 'active' | 'expired' | 'cancelled';

export type PaymentMode = 'card' | 'link' | 'invoice' | 'check';

export interface AgreementLineItem {
  id: string;
  agreement_id: string;
  line_no: number;
  channel: 'print' | 'email' | 'app';
  package_id: string;
  package_label: string;
  ad_size: string | null;
  frequency: string | null;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
  publication: 'austin' | 'san_antonio' | 'both' | null;
  start_date: string | null;
  end_date: string | null;
  pay_now: boolean;
  meta: Record<string, unknown>;
  created_at: string;

  // Insertion Order pricing fields (print lines, populated by quote-drafter).
  ad_rate_cents: number | null;
  ad_rate_base_cents: number | null;
  discount_cents: number | null;
  ad_premium_cents: number | null;
  page_position: string | null;
  pos_premium_active: boolean | null;
  total_monthly_cents: number | null;

  // Print run window (per-line — mirrors the agreement's ad_timing grid).
  // ad_timing_months is a Record<monthKey, boolean> as saved from the modal;
  // ad_timing_years is Record<monthKey, yearStr>. Together they describe
  // exactly which issues this line covers.
  ad_timing_months: Record<string, boolean> | null;
  ad_timing_years: Record<string, string> | null;
  expiration_date: string | null;
  renewal_reminder_date: string | null;

  // Email lines only: ISO dates the campaign should send on.
  preferred_send_dates: string[] | null;
}

export type AgreementType =
  | 'print_ad' | 'eblast' | 'app_ad' | 'sponsored_content' | 'package' | 'other';

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

export type AgreementAttachmentFile = {
  name: string;
  size: number;
  url: string;
  uploadedAt: string;
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

  // Pressbook address fields
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;

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

  // Pressbook pricing
  discount_cents: number | null;
  ad_premium_cents: number | null;
  total_monthly_rate_cents: number | null;
  page_position: string | null;
  ad_timing_months: Record<string, string> | null;  // { january: '2026', ... }

  amount_cents: number | null;

  // Signature
  sign_date: string | null;
  exp_date: string | null;
  renewal_notice_date: string | null;
  signed_at: string | null;
  signed_document: string | null;
  sent_to_email: string | null;
  is_uploaded: boolean;

  // Pressbook signature / terms
  signer_name: string | null;
  terms_accepted: boolean | null;
  terms_accepted_at: string | null;

  // Billing
  billing_name: string | null;
  billing_email: string | null;
  payment_mode: PaymentMode | null;

  // Pressbook billing
  bill_to: string | null;
  billing_contact_name: string | null;
  billing_contact_phone: string | null;
  card_type: string | null;
  cardholder_name: string | null;
  card_number_last4: string | null;
  card_expiration: string | null;
  cardholder_address: string | null;

  // Stripe
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link_url: string | null;
  stripe_payment_method_id: string | null;
  stripe_charged_cents: number | null;
  stripe_charged_at: string | null;
  paid_at: string | null;

  attachments: { files: AgreementAttachmentFile[] } | null;

  // Renewals
  is_renewal: boolean | null;
  renewed_from_id: string | null;

  notes: string | null;

  // Publication / market: 'austin' (RealtyLine Austin),
  // 'san_antonio' (Newsline San Antonio), or 'both'. Drives the PUB column
  // on /admin/ads/orders and per-market filtering for agreement-sourced
  // orders. Defaults from the linked advertiser's publication on create.
  publication: 'austin' | 'san_antonio' | 'both' | null;

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
  'address','city','state','zip',
  'type','status','start_date','end_date',
  'ad_size','frequency','ad_rate_cents','ad_timing','eblast_packages',
  'discount_cents','ad_premium_cents','total_monthly_rate_cents',
  'page_position','ad_timing_months',
  'amount_cents',
  'sign_date','exp_date','renewal_notice_date','signed_at','signed_document',
  'sent_to_email','is_uploaded',
  'signer_name','terms_accepted','terms_accepted_at',
  'billing_name','billing_email','payment_mode',
  'bill_to','billing_contact_name','billing_contact_phone',
  'card_type','cardholder_name','card_number_last4','card_expiration','cardholder_address',
  'stripe_customer_id','stripe_invoice_id','stripe_payment_intent_id',
  'stripe_payment_link_url','paid_at',
  'attachments',
  'is_renewal','renewed_from_id',
  'notes',
  'publication',
] as const;

export const AGREEMENT_PUBLICATION_VALUES = new Set<NonNullable<Agreement['publication']>>([
  'austin', 'san_antonio', 'both',
]);

export type AgreementPatchableField = (typeof AGREEMENT_PATCHABLE_FIELDS)[number];

export const AGREEMENT_STATUS_VALUES = new Set<AgreementStatus>([
  'draft','proposal_sent','proposal_approved','sent','signed','active','expired','cancelled',
]);
export const PAYMENT_MODE_VALUES = new Set<PaymentMode>([
  'card','link','invoice','check',
]);
export const AGREEMENT_TYPE_VALUES = new Set<AgreementType>([
  'print_ad','eblast','app_ad','sponsored_content','package','other',
]);

/** Append an audit entry without losing existing log. */
export function appendAudit(
  log: AgreementAuditEntry[] | null | undefined,
  entry: AgreementAuditEntry,
): AgreementAuditEntry[] {
  const base = Array.isArray(log) ? log : [];
  return [...base, entry];
}

