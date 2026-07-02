/**
 * Helpers for setting and clearing the admin session cookie on a
 * NextResponse. Realtor session cookies are now handled by Auth.js
 * (lib/server/auth/authjs.ts's cookies.sessionToken config + signIn/signOut)
 * — the realtor-specific helpers that used to live here were removed as
 * part of the Auth.js migration (Phase 5).
 *
 * Cookie semantics:
 *   - httpOnly: true
 *   - secure:   true in production
 *   - sameSite: 'lax'
 *   - path:     '/'
 *   - domain:   resolved from request host
 *   - maxAge:   7 days (in seconds — NextResponse.cookies uses seconds, not ms)
 */

import { headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import { resolveCookieDomain } from '../cookie-domain';
import { ADMIN_SESSION_COOKIE_NAME } from './admin';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

async function buildOpts() {
  const host = (await headers()).get('host');
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: resolveCookieDomain(host),
    path: '/',
    maxAge: SEVEN_DAYS_SECONDS,
  };
}

export async function setAdminSessionCookie(res: NextResponse, token: string): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: ADMIN_SESSION_COOKIE_NAME, value: token, ...opts });
}

export async function clearAdminSessionCookie(res: NextResponse): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: ADMIN_SESSION_COOKIE_NAME, value: '', ...opts, maxAge: 0 });
}
