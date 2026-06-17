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
import {
  ADMIN_SESSION_COOKIE_NAME,
  LEGACY_ADMIN_SESSION_COOKIE_NAME,
} from './lib/auth/cookie-names';
import {
  PUB_KEYS,
  PRE_LAUNCH_PUB_KEYS,
  type PubKey,
} from './lib/pub-meta';

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

// Publication permalink: ?pub=<key> sets the caxton_pub cookie, strips
// the query param, and 308-redirects to the clean URL. This is what makes
//   https://realtynewsnow.app/calendar?pub=newsline
// work as a durable permalink that survives Incognito visits, cleared
// localStorage, and bookmarks. See lib/publication.ts for the full model.
//
// Pre-launch markets (realtyline-houston, realtyline-dallas as of Phase 2
// PR B) are admin-only: the redirect+cookie only fires when the request
// carries an admin session cookie. Everyone else gets a silent strip of
// the query param so a leaked link doesn't drop a visitor into an empty
// market. Cookie signature verification still happens downstream in
// requireAdmin() - middleware can only check presence.
const PUB_KEY_SET = new Set<string>(PUB_KEYS);
const PRE_LAUNCH_SET = new Set<string>(PRE_LAUNCH_PUB_KEYS);

function hasAdminCookie(req: NextRequest): boolean {
  return (
    req.cookies.has(ADMIN_SESSION_COOKIE_NAME) ||
    req.cookies.has(LEGACY_ADMIN_SESSION_COOKIE_NAME)
  );
}

// Paths where pre-launch markets are intentionally previewable without an
// admin session. The digital rate card is the canonical place advertisers
// browse upcoming markets and join the waitlist, so the picker there must
// be able to switch into Houston/Dallas even for logged-out visitors. The
// page itself renders a Coming Soon empty state instead of selling sold
// inventory.
const PRE_LAUNCH_PREVIEW_PATHS = new Set<string>([
  '/advertise/digital',
]);

function isPreLaunchPreviewPath(pathname: string): boolean {
  if (PRE_LAUNCH_PREVIEW_PATHS.has(pathname)) return true;
  for (const p of PRE_LAUNCH_PREVIEW_PATHS) {
    if (pathname.startsWith(p + '/')) return true;
  }
  return false;
}

function handlePubPermalink(req: NextRequest): NextResponse | null {
  const param = req.nextUrl.searchParams.get('pub');
  if (!param) return null;

  // Unknown pub key: strip the param so a typo doesn't linger forever,
  // but don't mutate cookie state.
  if (!PUB_KEY_SET.has(param)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('pub');
    return NextResponse.redirect(clean, 308);
  }

  // Pre-launch markets gated on admin cookie presence — except on
  // explicitly previewable paths (the rate card), where the page itself
  // handles the coming-soon empty state safely.
  if (
    PRE_LAUNCH_SET.has(param) &&
    !hasAdminCookie(req) &&
    !isPreLaunchPreviewPath(req.nextUrl.pathname)
  ) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('pub');
    return NextResponse.redirect(clean, 308);
  }

  // Valid + permitted: persist the cookie and clean the URL.
  const clean = req.nextUrl.clone();
  clean.searchParams.delete('pub');
  const res = NextResponse.redirect(clean, 308);
  res.cookies.set('caxton_pub', param as PubKey, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Publication permalink handling runs first so it applies to every page
  // route (public + dashboard + admin), not just admin.
  const pubRedirect = handlePubPermalink(req);
  if (pubRedirect) return pubRedirect;

  // Admin-only logic below. For non-admin paths there's nothing more to do.
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

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
  // Two concerns share this proxy:
  //   1. Admin auth gate — /admin/* (excluding /admin/api/*).
  //   2. Publication permalink — every page route that could carry ?pub=,
  //      so we exclude _next, API, /c/ proxy, and static asset URLs.
  // The union of the two is expressed as a single negative-lookahead
  // matcher that simply rules out internals and assets.
  matcher: ['/((?!_next/|api/|c/|favicon|robots|sitemap|.*\\..*).*)'],
};
