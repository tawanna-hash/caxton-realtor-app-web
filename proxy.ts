/**
 * Edge proxy (Next.js 16): unified edge-runtime entry point handling:
 *   1. Publication permalink (?pub=<key> → cookie + clean redirect)
 *   2. Admin auth gate on /admin/* pages
 *   3. Realtor auth gate on all app content — see REALTOR_PUBLIC_PREFIXES
 *      below for the public allowlist. Logged-out users land on `/`
 *      (marketing) with ?next=<original>.
 *   4. CSRF origin/referer allowlist on cookie-authed mutating API routes (F-01)
 *
 * Same role as the old `middleware.ts` — renamed to `proxy.ts` per Next 16:
 *   https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * NOTE: Next.js refuses to build if both middleware.ts and proxy.ts exist.
 * Everything that used to live in middleware.ts is now here.
 *
 * Runtime: Edge. `jsonwebtoken` (used by lib/server/jwt.ts) depends on Node
 * `crypto` and won't bundle here.
 *
 * Admin gate: verified with `jose` directly, HS256 + ADMIN_JWT_SECRET
 * (falling back to JWT_SECRET for existing sessions issued before the
 * rotation). Payload-shape check mirrors verifyAdminSessionToken() in
 * lib/server/jwt.ts. Admin auth is NOT part of the Auth.js migration —
 * untouched here.
 *
 * Realtor gate: the caxton_session_v2 cookie is now an Auth.js-issued JWT,
 * which is an *encrypted* JWE (A256CBC-HS512), not a plain signed JWT — a
 * hand-rolled jose jwtVerify() (as this file used before the Auth.js
 * migration) cannot parse it at all. We use next-auth/jwt's getToken(),
 * Auth.js's own Edge-safe (Web Crypto, no Node APIs) helper for exactly
 * this case, with cookieName explicitly set to caxton_session_v2 so its
 * salt (which defaults to the cookie name) matches what
 * lib/server/auth/authjs.ts's cookies.sessionToken.name produces at
 * sign-in (see @auth/core/lib/actions/callback/index.js's
 * `salt = options.cookies.sessionToken.name`).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getToken } from 'next-auth/jwt';
import { ADMIN_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from './lib/auth/cookie-names';
import {
  PUB_KEYS,
  PRE_LAUNCH_PUB_KEYS,
  type PubKey,
} from './lib/pub-meta';

// ============================================================================
// CSRF: origin/referer allowlist on state-changing API routes (F-01)
// ============================================================================
//
// Hostnames allowed to issue state-changing API calls. Matched against the
// Origin header's hostname (no port). Sub-domain wildcards allowed via the
// leading-dot convention.
const CSRF_ALLOWED_HOSTS = [
  'realtynewsnow.app',
  '.realtynewsnow.app',          // any subdomain
  'myrealtyline.com',
  '.myrealtyline.com',
  'newslinesa.com',
  '.newslinesa.com',
  'app.myrealtyline.com',
  // Vercel preview deploys land on *.vercel.app
  '.vercel.app',
];
const CSRF_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const CSRF_PROTECTED_PREFIXES = [
  '/api/admin/',
  '/api/portal/',
  '/api/auth/account',
  '/api/auth/logout',
  '/api/auth/set-password',
  '/api/auth/reset-password',
];
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function csrfIsAllowedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (CSRF_LOCAL_HOSTS.has(lower)) return process.env.NODE_ENV !== 'production';
  for (const allowed of CSRF_ALLOWED_HOSTS) {
    if (allowed.startsWith('.')) {
      if (lower === allowed.slice(1) || lower.endsWith(allowed)) return true;
    } else if (lower === allowed) {
      return true;
    }
  }
  return false;
}

function csrfOriginHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function csrfIsProtectedPath(pathname: string): boolean {
  for (const prefix of CSRF_PROTECTED_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function handleCsrf(req: NextRequest): NextResponse | null {
  if (!CSRF_PROTECTED_METHODS.has(req.method)) return null;
  if (!csrfIsProtectedPath(req.nextUrl.pathname)) return null;

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const candidateHost = csrfOriginHost(origin) || csrfOriginHost(referer);

  if (!candidateHost) {
    return NextResponse.json(
      { error: 'missing origin header' },
      { status: 403 },
    );
  }
  if (!csrfIsAllowedHost(candidateHost)) {
    return NextResponse.json(
      { error: 'cross-origin request blocked' },
      { status: 403 },
    );
  }
  return null; // CSRF check passed; let the next stage run.
}

// ============================================================================
// Admin auth gate on /admin/* pages
// ============================================================================
//
// Next.js admin pages are client components — none of them verify the session
// server-side. An unauthenticated user could load /admin/giveaways and get
// HTTP 200 with the page chrome. We short-circuit with a 307 to /admin/login
// before any page renders.
//
// API routes are NOT covered — every /api/admin/* handler already calls
// `requireAdmin()` which throws 401 (and CSRF above also gates them).

const PUBLIC_ADMIN_PATHS = new Set<string>([
  '/admin/login',
  '/admin/forgot-password',
  '/admin/reset-password',
]);

function isPublicAdminPath(pathname: string): boolean {
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return true;
  for (const p of PUBLIC_ADMIN_PATHS) {
    if (pathname.startsWith(p + '/')) return true;
  }
  return false;
}

async function verifyWithSecret(token: string, secret: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return (
      payload.type === 'admin' &&
      typeof payload.adminId === 'string' &&
      typeof payload.email === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Verify an admin session token at the Edge. Tries ADMIN_JWT_SECRET first
 * (the canonical signing key after the M1 rotation), then falls back to
 * JWT_SECRET so admin sessions issued before ADMIN_JWT_SECRET was
 * provisioned keep working until they expire (7d max). Once those have
 * aged out the fallback becomes dead weight — kept as cheap insurance.
 *
 * Mirrors verifyAdminSessionToken() in lib/server/jwt.ts.
 */
async function isValidAdminToken(
  token: string,
  realtorSecret: string,
  adminSecret: string | undefined,
): Promise<boolean> {
  if (adminSecret && adminSecret.length >= 32) {
    if (await verifyWithSecret(token, adminSecret)) return true;
    if (adminSecret === realtorSecret) return false;
  }
  return verifyWithSecret(token, realtorSecret);
}

// ============================================================================
// Realtor auth gate on all app content
// ============================================================================
//
// The dashboard, portal, and all (public)/* content routes previously had no
// server-side auth check — the dashboard's AuthGate runs client-side only and
// could be bypassed via a stale localStorage flag. We now gate everything at
// the edge so unauthenticated users never see app content.
//
// Public allowlist (anything matched here bypasses the realtor gate):
//   /                       — marketing landing page
//   /auth/*                 — sign-in, sign-up, verify, forgot/reset password
//   /privacy, /terms        — App Store / CAN-SPAM legal pages (must be public)
//   /support                — support contact (must be reachable without sign-in)
//   /subscribe              — newsletter signup (top-of-funnel)
//   /submit-event           — public event submission form
//   /magazine, /magazine/*  — published issues are top-of-funnel content;
//                             everything else (feed, calendar, advertisers,
//                             builders, etc.) still requires an account
//   /manifest.webmanifest   — PWA manifest (static, but explicit for clarity)
//
// Note: /admin/* is handled by its own gate above and never reaches this code.
// Note: /api/* routes have their own server-side auth (requireUser/requireAdmin)
//       and CSRF is already enforced above. We do not gate /api at the edge
//       so that the auth endpoints themselves (/api/auth/login etc.) remain
//       callable from the sign-in form.

const REALTOR_PUBLIC_PREFIXES: ReadonlyArray<string> = [
  '/auth/',
  '/api/',
  '/privacy',
  '/terms',
  '/support',
  '/subscribe',
  '/submit-event',
  '/magazine/',
  '/communities/',
  '/inventory/',
  '/builders/',
  '/promotions/',
  '/event-images',
];

const REALTOR_PUBLIC_EXACT = new Set<string>([
  '/',
  '/magazine',
  '/manifest.webmanifest',
]);

function isPublicRealtorPath(pathname: string): boolean {
  if (REALTOR_PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of REALTOR_PUBLIC_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, '')) return true;
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Verify a realtor session at the Edge via Auth.js's getToken() — decrypts
 * the caxton_session_v2 JWE and returns the claims lib/server/auth/authjs.ts's
 * jwt() callback puts there (realtorId, email). See file header for why this
 * replaced a hand-rolled jose jwtVerify().
 */
async function isValidRealtorToken(
  req: NextRequest,
  realtorSecret: string,
): Promise<boolean> {
  try {
    const token = await getToken({
      req,
      secret: realtorSecret,
      cookieName: SESSION_COOKIE_NAME,
    });
    return (
      !!token &&
      typeof token.realtorId === 'string' &&
      typeof token.email === 'string'
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Publication permalink: ?pub=<key> → cookie + clean redirect
// ============================================================================

const PUB_KEY_SET = new Set<string>(PUB_KEYS);
const PRE_LAUNCH_SET = new Set<string>(PRE_LAUNCH_PUB_KEYS);

function hasAdminCookie(req: NextRequest): boolean {
  return req.cookies.has(ADMIN_SESSION_COOKIE_NAME);
}

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
  // The ?pub= permalink is a user-facing URL concept (deep-link a visitor
  // into a specific publication). It must NOT fire on API routes, which
  // pass pub=realtyline|newsline as a real query argument — e.g.
  // /api/ads/active?slot=feed_top_banner&pub=newsline. Without this guard
  // the proxy 308-redirects the API call to the same URL minus ?pub=,
  // dropping the parameter and breaking every ad slot.
  if (req.nextUrl.pathname.startsWith('/api/')) return null;

  const param = req.nextUrl.searchParams.get('pub');
  if (!param) return null;

  if (!PUB_KEY_SET.has(param)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('pub');
    return NextResponse.redirect(clean, 308);
  }

  if (
    PRE_LAUNCH_SET.has(param) &&
    !hasAdminCookie(req) &&
    !isPreLaunchPreviewPath(req.nextUrl.pathname)
  ) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('pub');
    return NextResponse.redirect(clean, 308);
  }

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

// ============================================================================
// Entry point
// ============================================================================

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1. CSRF gate on protected API routes — runs first because it can
  //    short-circuit with a 403 before any other work.
  const csrf = handleCsrf(req);
  if (csrf) return csrf;

  // 2. Publication permalink handling — applies to every page route.
  const pubRedirect = handlePubPermalink(req);
  if (pubRedirect) return pubRedirect;

  // 3. Admin auth gate (only when on /admin/*).
  if (pathname.startsWith('/admin')) {
    if (isPublicAdminPath(pathname)) {
      return NextResponse.next();
    }

    const realtorSecret = process.env.JWT_SECRET;
    const adminSecret = process.env.ADMIN_JWT_SECRET;
    if (!realtorSecret || realtorSecret.length < 32) {
      // Fail closed: if the server is misconfigured we refuse to serve the
      // admin UI at all rather than letting it render unauthenticated.
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      return NextResponse.redirect(url, 307);
    }

    const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    if (token && (await isValidAdminToken(token, realtorSecret, adminSecret))) {
      return NextResponse.next();
    }

    // Redirect to /admin/login?next=<original path + query>
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url, 307);
  }

  // 4. Realtor auth gate. Everything that isn't on the public allowlist
  //    requires a valid realtor session cookie. Unauthenticated visitors are
  //    sent to `/` (marketing) with ?next=<original path+query> so the
  //    landing page can deep-link them back after sign-in.
  if (isPublicRealtorPath(pathname)) {
    return NextResponse.next();
  }

  // Special case: the dashboard hosts the AuthGate component, and existing
  // links across the app use /auth/sign-in and /auth/sign-up which then
  // redirect to /dashboard?auth=login|signup. Allow that specific entry
  // through the gate so the sign-in form itself stays reachable to
  // logged-out visitors. The dashboard component refuses to render feed
  // content when /api/auth/me reports no session, so no protected content
  // leaks from this bypass.
  if (pathname === '/dashboard') {
    const authParam = req.nextUrl.searchParams.get('auth');
    if (authParam === 'login' || authParam === 'signup') {
      return NextResponse.next();
    }
  }

  const realtorSecret = process.env.JWT_SECRET;
  if (!realtorSecret || realtorSecret.length < 32) {
    // Fail closed: misconfigured server → send to marketing rather than
    // rendering protected content unauthenticated.
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }

  if (await isValidRealtorToken(req, realtorSecret)) {
    return NextResponse.next();
  }

  // Logged-out → marketing landing page. Preserve original destination via
  // ?next= so post-sign-in we can bounce back.
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url, 307);
}

// Matcher covers:
//   - All /api/* routes (so CSRF gate can see them) — but most early-return.
//   - All page routes that could carry ?pub= (for publication permalink) and
//     all /admin/* (for admin auth gate).
// Excludes _next, /c/ proxy, favicon, robots, sitemap, and static asset URLs.
export const config = {
  matcher: ['/((?!_next/|c/|favicon|robots|sitemap|.*\\..*).*)'],
};
