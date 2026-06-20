/**
 * Helpers for setting and clearing the session cookies on a NextResponse.
 *
 * Cookie semantics (post-merge, same-origin):
 *   - httpOnly: true
 *   - secure:   true in production
 *   - sameSite: 'lax'   (both realtor + admin — same origin now)
 *   - path:     '/'
 *   - domain:   resolved from request host
 *   - maxAge:   7 days (in seconds — NextResponse.cookies uses seconds, not ms)
 */

import { headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import { resolveCookieDomain } from '../cookie-domain';
import { ADMIN_SESSION_COOKIE_NAME } from './admin';
import { SESSION_COOKIE_NAME } from './user';

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

export async function setRealtorSessionCookie(res: NextResponse, token: string): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: SESSION_COOKIE_NAME, value: token, ...opts });
}

export async function clearRealtorSessionCookie(res: NextResponse): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: SESSION_COOKIE_NAME, value: '', ...opts, maxAge: 0 });
}

export async function setAdminSessionCookie(res: NextResponse, token: string): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: ADMIN_SESSION_COOKIE_NAME, value: token, ...opts });
}

export async function clearAdminSessionCookie(res: NextResponse): Promise<void> {
  const opts = await buildOpts();
  res.cookies.set({ name: ADMIN_SESSION_COOKIE_NAME, value: '', ...opts, maxAge: 0 });
}
