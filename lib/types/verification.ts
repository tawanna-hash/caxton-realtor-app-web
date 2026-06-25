// lib/types/verification.ts
//
// Single Source of Truth for the email-verification status emitted by the
// Resend/SMTP verification pipeline (lib/email-verify.ts) and consumed by
// the admin subscribers / newsletter pages.

export const VERIFICATION_STATUSES = [
  'valid',
  'invalid',
  'risky',
  'unknown',
  'pending',
  'unverified',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Subset accepted as a UI filter, including '' for "all statuses". */
export const VERIFICATION_FILTER_VALUES = ['', ...VERIFICATION_STATUSES] as const;
export type VerificationFilter = (typeof VERIFICATION_FILTER_VALUES)[number];

export function isVerificationStatus(v: unknown): v is VerificationStatus {
  return typeof v === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(v);
}
