// lib/server/auth/owner.ts
//
// "Owner" is a single hard-gated admin identity — not a role system.
// Team management (app/admin/team, /api/admin/team/*) is intentionally
// restricted to just this one account so nobody can grant themselves or
// anyone else admin access without going through the actual account owner.
//
// Configured via OWNER_ADMIN_EMAIL so it can change without a code deploy;
// falls back to the current owner's address if unset.

import type { AdminSessionPayload } from '../jwt';

const DEFAULT_OWNER_EMAIL = 'tawanna@myrealtyline.com';

export function getOwnerAdminEmail(): string {
  return (process.env.OWNER_ADMIN_EMAIL || DEFAULT_OWNER_EMAIL).toLowerCase();
}

export function isOwnerAdmin(admin: Pick<AdminSessionPayload, 'email'> | null): boolean {
  if (!admin?.email) return false;
  return admin.email.toLowerCase() === getOwnerAdminEmail();
}
