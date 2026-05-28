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

export const ADMIN_SESSION_COOKIE_NAME = 'caxton_admin_session';

export async function getCurrentAdmin(): Promise<AdminSessionPayload | null> {
  // Prefer cookie; fall back to Authorization: Bearer header for legacy
  // API clients (none in our web app, but the original Express server
  // supported it).
  const cookieStore = await cookies();
  let token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    const auth = (await headers()).get('authorization') ?? '';
    if (auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    }
  }

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
