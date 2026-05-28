/**
 * Realtor session helpers. Read by /api/auth/* (except admin/*) and any
 * route that needs to know the current realtor.
 *
 *   const user = await requireUser();
 *   const user = await getCurrentUser();
 *
 * Cookie name: `caxton_session`. Set on signup/verify/login.
 */

import { cookies, headers } from 'next/headers';
import { ApiError } from '../error';
import { verifySessionToken, type RealtorSessionPayload } from '../jwt';

export const SESSION_COOKIE_NAME = 'caxton_session';

export async function getCurrentUser(): Promise<RealtorSessionPayload | null> {
  const cookieStore = await cookies();
  let token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    const auth = (await headers()).get('authorization') ?? '';
    if (auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    }
  }

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
