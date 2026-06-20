/**
 * Admin session helpers. Read by every /admin/* route handler.
 *
 *   const admin = await requireAdmin();   // throws ApiError(401) if not signed in
 *   const admin = await getCurrentAdmin();  // returns null instead of throwing
 *
 * Cookie name: `caxton_admin_session`. Set / cleared by /api/admin/auth/login
 * and /logout respectively.
 */

import { cookies, headers } from 'next/headers';
import { ApiError } from '../error';
import { verifyAdminSessionToken, type AdminSessionPayload } from '../jwt';
import {
  ADMIN_SESSION_COOKIE_NAME,
  LEGACY_ADMIN_SESSION_COOKIE_NAME,
} from '@/lib/auth/cookie-names';

// Re-exported so existing call sites (`from '@/lib/server/auth/admin'`)
// keep working. The canonical declarations live in lib/auth/cookie-names.ts
// so that Edge middleware can import them without dragging in `next/headers`.
export { ADMIN_SESSION_COOKIE_NAME, LEGACY_ADMIN_SESSION_COOKIE_NAME };

/**
 * Read the current admin session from the `caxton_admin_session_v2` cookie.
 *
 * NOTE: there used to be an `Authorization: Bearer <jwt>` fallback here for
 * the old Express server. It was removed because no current client uses it
 * and leaving it in place meant any CORS-permissive endpoint could accept a
 * leaked admin JWT outside the cookie's httpOnly + sameSite=lax protection.
 * If we ever need Bearer admin auth (e.g. for a CLI), add it back behind an
 * explicit per-endpoint allowlist.
 */
export async function getCurrentAdmin(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

export async function requireAdmin(): Promise<AdminSessionPayload> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new ApiError(401, 'Unauthorized');
  }
  return admin;
}

/** Read the request's IP for audit logging. Vercel forwards X-Forwarded-For. */
export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || null;
}

export async function getRequestUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent') ?? null;
}
