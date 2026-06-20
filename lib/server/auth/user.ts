/**
 * Realtor session helpers. Read by /api/auth/* (except admin/*) and any
 * route that needs to know the current realtor.
 *
 *   const user = await requireUser();
 *   const user = await getCurrentUser();
 *
 * Cookie name: `caxton_session`. Set on signup/verify/login.
 */

import { cookies } from 'next/headers';
import { ApiError } from '../error';
import { verifySessionToken, type RealtorSessionPayload } from '../jwt';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';

// Re-exported so existing call sites keep working. Canonical declaration
// lives in lib/auth/cookie-names.ts (see admin.ts for the same pattern).
export { SESSION_COOKIE_NAME };

/**
 * Read the current realtor session from the `caxton_session_v2` cookie.
 *
 * NOTE: there used to be an `Authorization: Bearer <jwt>` fallback here for
 * the old Express server. It was removed because no current client (web,
 * Capacitor iOS, server-to-server) sets that header, and leaving it in place
 * meant any CORS-permissive endpoint could accept a leaked JWT outside the
 * cookie's httpOnly + sameSite=lax protection. If a native client ever needs
 * Bearer auth, add it back with an explicit per-endpoint allowlist.
 *
 * /api/auth/me intentionally returns 200 with `{ realtor: null }` for guests
 * (see L3 in the sign-in audit). Routes that need a 401 must call requireUser.
 */
export async function getCurrentUser(): Promise<RealtorSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<RealtorSessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }
  return user;
}
