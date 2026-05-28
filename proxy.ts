/**
 * Edge proxy (Next.js 16): gate /admin/* pages behind a valid admin session.
 * Same role as the old `middleware.ts` — renamed to `proxy.ts` per the
 * Next 16 file convention. See:
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Why this exists:
 *   Next.js admin pages are client components — none of them verified the
 *   session server-side before this middleware. An unauthenticated user
 *   could load /admin/giveaways and get HTTP 200 with the page chrome
 *   (data fetches would 401, but the shell was visible). This middleware
 *   closes that gap by short-circuiting the request with a 307 redirect to
 *   /admin/login before any page renders.
 *
 *   API routes are NOT covered here — every /api/admin/* handler already
 *   calls `requireAdmin()` which throws 401. Middleware running on API
 *   routes would only add overhead.
 *
 * Runtime note:
 *   This file runs in the Edge runtime. `jsonwebtoken` (used by
 *   lib/server/jwt.ts) depends on Node `crypto` and won't bundle here, so
 *   we verify with `jose` directly using the same HS256 + JWT_SECRET.
 *   The payload-shape check mirrors verifyAdminSessionToken() exactly.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { ADMIN_SESSION_COOKIE_NAME } from './lib/auth/cookie-names';

// Pages anyone can hit without a session. Everything else under /admin
// requires a valid admin JWT.
const PUBLIC_ADMIN_PATHS = new Set<string>([
  '/admin/login',
  '/admin/forgot-password',
  '/admin/reset-password',
]);

function isPublicAdminPath(pathname: string): boolean {
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return true;
  // Allow nested public paths like /admin/reset-password/<token> if they ever appear.
  for (const p of PUBLIC_ADMIN_PATHS) {
    if (pathname.startsWith(p + '/')) return true;
  }
  return false;
}

async function isValidAdminToken(token: string, secret: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    // Same discriminator check as verifyAdminSessionToken() — a realtor
    // token signed with the same secret must not pass.
    return (
      payload.type === 'admin' &&
      typeof payload.adminId === 'string' &&
      typeof payload.email === 'string'
    );
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicAdminPath(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed: if the server is misconfigured we refuse to serve the
    // admin UI at all rather than letting it render unauthenticated.
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (token && (await isValidAdminToken(token, secret))) {
    return NextResponse.next();
  }

  // Redirect to /admin/login?next=<original path + query>
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Run on every /admin/* page except the API namespace. Static assets
  // under /admin (there are none today) and Next.js internals are skipped
  // by the negative lookahead.
  matcher: ['/admin/((?!api/).*)'],
};
