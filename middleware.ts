// middleware.ts
//
// Edge-runtime CSRF protection (F-01 from prod audit).
//
// Strategy: origin/referer allowlist on state-changing verbs (POST/PATCH/
// PUT/DELETE) for cookie-authenticated API surfaces. We accept the request
// only if the Origin (or, as a fallback, Referer) is one of our own
// publication hostnames. Everything else is rejected with 403.
//
// Why origin-check and not double-submit-token?
//   - All clients already same-origin (Capacitor wraps realtynewsnow.app).
//   - Zero client-side wiring needed; no token plumbing into 200+ fetch sites.
//   - Browsers populate Origin on all POST/PATCH/PUT/DELETE.
//
// Scope:
//   - Enforced on  /api/admin/*  (admin cookie auth)
//   - Enforced on  /api/portal/* (advertiser portal cookie auth)
//   - Enforced on  /api/auth/account  (realtor account deletion)
//   - Enforced on  /api/auth/{logout,set-password,reset-password} (cookie-mutating)
//
// Deliberately NOT enforced (these can't be CSRF'd — no cookie auth or
// signature-based auth):
//   - /api/stripe/webhook  (Stripe signs the body; no cookie auth)
//   - /api/cron/*          (CRON_SECRET / x-vercel-cron header auth)
//   - /api/sign/[token]/*  (HMAC token IS the auth; no cookie ride)
//   - /api/r/advertiser/*  (share-token / grant-cookie auth — different model)
//   - /api/auth/login, signup, verify, password-login — these establish a
//     session; CSRF on a no-session POST is harmless.
//   - /api/auth/webauthn/* — authenticator-mediated; the WebAuthn signature
//     is the auth, not the cookie.
//   - Anything outside /api/

import { NextResponse, type NextRequest } from 'next/server';

// Hostnames allowed to issue state-changing API calls. Matched against the
// Origin header's hostname (no port). Sub-domain wildcards allowed via the
// leading-dot convention.
const ALLOWED_HOSTS = [
  'realtynewsnow.app',
  '.realtynewsnow.app',          // any subdomain
  'myrealtyline.com',
  '.myrealtyline.com',
  'newslinesa.com',
  '.newslinesa.com',
  'app.myrealtyline.com',
  // Local dev — Vercel preview deploys land on *.vercel.app
  '.vercel.app',
];

// Always allow localhost in non-prod.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

// Path prefixes we enforce. Matched with .startsWith().
const PROTECTED_PREFIXES = [
  '/api/admin/',
  '/api/portal/',
  '/api/auth/account',
  '/api/auth/logout',
  '/api/auth/set-password',
  '/api/auth/reset-password',
];

// Methods that mutate state. GET/HEAD/OPTIONS are never CSRF'd in a way the
// browser allows for cross-origin (without CORS preflight reveal).
const PROTECTED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function isAllowedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (LOCAL_HOSTS.has(lower)) return process.env.NODE_ENV !== 'production';
  for (const allowed of ALLOWED_HOSTS) {
    if (allowed.startsWith('.')) {
      // Suffix match — covers any subdomain.
      if (lower === allowed.slice(1) || lower.endsWith(allowed)) return true;
    } else if (lower === allowed) {
      return true;
    }
  }
  return false;
}

function originHost(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function isProtectedPath(pathname: string): boolean {
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!PROTECTED_METHODS.has(req.method)) return NextResponse.next();
  if (!isProtectedPath(pathname)) return NextResponse.next();

  // Same-origin check. Prefer Origin (always set by browsers on mutating
  // verbs). Fall back to Referer for older clients / odd setups.
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  const candidateHost = originHost(origin) || originHost(referer);

  if (!candidateHost) {
    // No origin AND no referer on a mutating request to a cookie-authed
    // endpoint. Reject — modern browsers always send at least one.
    return NextResponse.json(
      { error: 'missing origin header' },
      { status: 403 },
    );
  }

  if (!isAllowedHost(candidateHost)) {
    return NextResponse.json(
      { error: 'cross-origin request blocked' },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

// Only invoke middleware on API routes. Static assets, pages, _next, public
// files all bypass this so we don't pay edge cost on every navigation.
export const config = {
  matcher: ['/api/:path*'],
};
