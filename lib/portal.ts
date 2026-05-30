// lib/portal.ts
//
// Helpers + types for the client portal (magic links, files, forms).
//
// Magic-link model:
//   1. Staff calls createMagicLink(advertiserId) → DB row + raw token.
//   2. Token is emailed to the advertiser via Resend (route handles this).
//   3. Advertiser hits /portal/consume?token=<raw>; we hash it, look up
//      the row, mark consumed_at + session_expires_at = NOW() + 4h, and
//      set a signed session cookie containing the magic_link_id.
//   4. Each portal page checks the cookie, looks up the link, and confirms
//      session_expires_at > NOW() AND revoked_at IS NULL.
//   5. Cookie has NO Max-Age — closing the browser kills it.
//      Even within the 4-hour DB window, the cookie ends with the session.

import crypto from 'node:crypto';

// ── Constants ───────────────────────────────────────────────────────
export const PORTAL_SESSION_COOKIE = 'caxton_portal_sid';
export const PORTAL_LINK_TTL_MS = 1000 * 60 * 60 * 24;  // 24h to click
export const PORTAL_SESSION_TTL_MS = 1000 * 60 * 60 * 4; // 4h after consume

// ── Types ───────────────────────────────────────────────────────────
export type PortalLinkPurpose = 'login' | 'sign_agreement' | 'pay_invoice' | 'form';

export interface PortalMagicLink {
  id: string;
  advertiser_id: number;
  purpose: PortalLinkPurpose;
  link_expires_at: string;
  consumed_at: string | null;
  session_expires_at: string | null;
  sent_to_email: string | null;
  sent_at: string;
  created_by: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface PortalFile {
  id: string;
  advertiser_id: number;
  agreement_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  category: string;
  visibility: 'visible' | 'hidden';
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PortalFormFieldType = 'text' | 'tel' | 'url' | 'email' | 'textarea' | 'select';
export interface PortalFormField {
  key: string;
  label: string;
  type: PortalFormFieldType;
  required?: boolean;
  options?: string[];
}
export interface PortalFormSchema {
  fields: PortalFormField[];
}
export interface PortalForm {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  schema: PortalFormSchema;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PortalFormAssignmentStatus = 'pending' | 'in_progress' | 'submitted';
export interface PortalFormAssignment {
  id: string;
  form_id: string;
  advertiser_id: number;
  status: PortalFormAssignmentStatus;
  answers: Record<string, string | number | boolean | null>;
  assigned_by: string | null;
  assigned_at: string;
  submitted_at: string | null;
  due_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Token helpers ───────────────────────────────────────────────────
/** Generate a URL-safe random token (43 chars base64url). */
export function generateMagicLinkToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Hash the raw token before persisting. SHA-256, lowercase hex. */
export function hashMagicLinkToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Allow-lists ─────────────────────────────────────────────────────
export const PORTAL_LINK_PURPOSE_VALUES = new Set<PortalLinkPurpose>(
  ['login', 'sign_agreement', 'pay_invoice', 'form']);

export const PORTAL_FILE_PATCHABLE_FIELDS = [
  'title', 'description', 'category', 'visibility',
  'file_url', 'file_name', 'file_mime', 'file_size_bytes',
  'agreement_id', 'invoice_id',
] as const;

export const PORTAL_FORM_PATCHABLE_FIELDS = [
  'title', 'description', 'schema', 'active', 'slug',
] as const;

export const PORTAL_ASSIGNMENT_STATUS_VALUES = new Set<PortalFormAssignmentStatus>(
  ['pending', 'in_progress', 'submitted']);

// ── Session helpers ─────────────────────────────────────────────────
/** Validates that a magic-link row is currently a valid session bearer. */
export function isSessionActive(row: Pick<PortalMagicLink, 'session_expires_at' | 'revoked_at' | 'consumed_at'>): boolean {
  if (!row.consumed_at) return false;
  if (row.revoked_at) return false;
  if (!row.session_expires_at) return false;
  return new Date(row.session_expires_at).getTime() > Date.now();
}

/** Validates that a magic-link is still consumable (not yet used, not expired, not revoked). */
export function isLinkConsumable(row: Pick<PortalMagicLink, 'link_expires_at' | 'consumed_at' | 'revoked_at'>): boolean {
  if (row.consumed_at) return false;
  if (row.revoked_at) return false;
  if (new Date(row.link_expires_at).getTime() < Date.now()) return false;
  return true;
}
