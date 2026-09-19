/**
 * Realtor session helpers. Read by /api/auth/* (except admin/*) and any
 * route that needs to know the current realtor.
 *
 *   const user = await requireUser();
 *   const user = await getCurrentUser();
 *
 * Backed by Auth.js's auth() (lib/server/auth/authjs.ts), which reads the
 * `caxton_session_v2` cookie itself. Signatures/shapes kept identical to
 * the pre-Auth.js version so every call site (app/page.tsx,
 * app/api/auth/me, app/api/auth/account, app/api/auth/set-password) keeps
 * working unchanged.
 */

import { ApiError } from '../error';
import type { RealtorSessionPayload } from '../jwt';
import { auth } from './authjs';
// Re-exported so existing call sites keep working. Canonical declaration
// lives in lib/auth/cookie-names.ts (see admin.ts for the same pattern).
;

/**
 * /api/auth/me intentionally returns 200 with `{ realtor: null }` for guests
 * (see L3 in the sign-in audit). Routes that need a 401 must call requireUser.
 */
export async function getCurrentUser(): Promise<RealtorSessionPayload | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;
    if (typeof session.user.realtorId !== 'string' || typeof session.user.email !== 'string') {
      return null;
    }
    return { realtorId: session.user.realtorId, email: session.user.email };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<RealtorSessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }
  return user;
}
