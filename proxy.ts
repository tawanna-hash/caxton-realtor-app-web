/**
 * Edge proxy (Next.js 16): unified edge-runtime entry point handling:
 *   1. Publication permalink (?pub=<key> → cookie + clean redirect)
 *   2. Admin auth gate on /admin/* pages
 *   3. CSRF origin/referer allowlist on cookie-authed mutating API routes (F-01)
 *
 * Same role as the old `middleware.ts` — renamed to `proxy.ts` per Next 16:
 *   https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * NOTE: Next.js refuses to build if both middleware.ts and proxy.ts exist.
 * Everything that used to live in middleware.ts is now here.
 *
 * Runtime: Edge. `jsonwebtoken` (used by lib/server/jwt.ts) depends on Node
 * `crypto` and won't bundle here, so we verify with `jose` directly using the
 * same HS256 + JWT_SECRET. Payload-shape check mirrors verifyAdminSessionToken().
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

async function isValidAdminToken(token: string, secret: string): Promise<boolean> {
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

// ============================================================================
// Publication permalink: ?pub=<key> → cookie + clean redirect
// ============================================================================

const PUB_KEY_SET = new Set<string>(PUB_KEYS);
const PRE_LAUNCH_SET = new Set<string>(PRE_LAUNCH_PUB_KEYS);

function hasAdminCookie(req: NextRequest): boolean {
  return (
    req.cookies.has(ADMIN_SESSION_COOKIE_NAME) ||
    req.cookies.has(LEGACY_ADMIN_SESSION_COOKIE_NAME)
  );
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

  // 3. Admin auth gate. For non-admin paths there's nothing more to do.
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

// Matcher covers:
//   - All /api/* routes (so CSRF gate can see them) — but most early-return.
//   - All page routes that could carry ?pub= (for publication permalink) and
//     all /admin/* (for admin auth gate).
// Excludes _next, /c/ proxy, favicon, robots, sitemap, and static asset URLs.
export const config = {
  matcher: ['/((?!_next/|c/|favicon|robots|sitemap|.*\\..*).*)'],
};
