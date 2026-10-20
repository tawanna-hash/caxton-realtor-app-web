// lib/agreements-v2/prepay.ts
//
// Agreements (Beta): digital products (e-Blast, app placements, anything that
// is not print) are paid before signing, by bank (ACH) or credit card. A
// partner who wants to pay by check has to ask, and an admin approves. The
// request and the approval live in the agreement's activity log.

export const CHECK_REQUEST_EVENT = 'newpartner_v2_check_request';
export const CHECK_APPROVED_EVENT = 'newpartner_v2_check_approved';

export const PREPAY_NOTE = 'Digital products and e-Blasts are paid before you sign, by bank account (ACH) or credit card. Services will not be provided until payment is received.';

/** True when any part of the agreement is not print. */
export function prepayRequired(agreementChannel: string | null | undefined, lineChannels: Array<string | null | undefined>): boolean {
  return (agreementChannel ?? 'print') !== 'print' || lineChannels.some((c) => c != null && c !== 'print');
}

export type CheckRequestState = 'approved' | 'requested' | null;

export function checkRequestState(auditLog: unknown): CheckRequestState {
  const log = Array.isArray(auditLog) ? (auditLog as Array<{ event?: string }>) : [];
  let state: CheckRequestState = null;
  for (const e of log) {
    if (e.event === CHECK_REQUEST_EVENT && state === null) state = 'requested';
    if (e.event === CHECK_APPROVED_EVENT) state = 'approved';
  }
  return state;
}
