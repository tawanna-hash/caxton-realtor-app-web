/**
 * Get Paid development lock.
 *
 * The entire Get Paid module (payment links, statements, recurring
 * payments, sales transactions, invoices, Stripe payouts) is gated behind
 * a development code ("Ripley10") on top of normal admin auth, per an
 * explicit request to prevent any change to money-handling pages without
 * that code. Every admin — including ones who are otherwise fully
 * authenticated — sees a lock screen until they enter it.
 *
 * Design:
 *   - The code itself is never sent to the client and never stored
 *     verbatim anywhere (not in a cookie, not in localStorage).
 *   - Unlock state is an HMAC-SHA256 of (adminId + a server secret),
 *     stored in an httpOnly cookie. It's bound to the signed-in admin's
 *     id, so copying the cookie to a different admin session (or a
 *     logged-out browser) does not work — the derived tag won't match.
 *   - The cookie has no code-derived material in it, so even a leaked
 *     cookie value cannot be used to recover or brute-force the code
 *     (the tag space is 256 bits; nothing about the code leaks from it).
 *   - This file is imported from both Edge (proxy.ts) and Node
 *     (API routes, layouts) contexts, so it only uses Web Crypto
 *     (`crypto.subtle`), which is available in both runtimes.
 *
 * This is a workflow safety gate, not a cryptographic access-control
 * boundary — the real security boundary remains admin session auth
 * (requireAdmin / the proxy admin gate). The point of this layer is to
 * force a deliberate, out-of-band confirmation step before anyone
 * (including the admin's own future self, or another admin with a valid
 * session) can view or mutate Get Paid data.
 */

const ENCODER = new TextEncoder();

function getGateSecret(): string {
  // Reuse ADMIN_JWT_SECRET (falls back to JWT_SECRET, matching the same
  // fallback lib/server/jwt.ts and proxy.ts already use) rather than
  // provisioning a third secret. Never expose or derive the raw dev code
  // from this — it's just an HMAC key.
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'ADMIN_JWT_SECRET or JWT_SECRET must be set (32+ chars) to use the Get Paid gate.',
    );
  }
  return secret;
}

/** The development code required to unlock Get Paid. Never sent to the client. */
export function getGetPaidUnlockCode(): string {
  return process.env.GETPAID_UNLOCK_CODE || 'Ripley10';
}

async function hmac(key: string, message: string): Promise<string> {
  const keyData = ENCODER.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENCODER.encode(message));
  return Buffer.from(sig).toString('hex');
}

/** Compute the expected unlock-cookie value for a given admin id. */
export async function computeGetPaidUnlockTag(adminId: string): Promise<string> {
  return hmac(getGateSecret(), `getpaid-unlock:${adminId}`);
}

/** Constant-time-ish compare (length-checked, then byte compare via crypto). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Verify a submitted development code against the configured unlock code. */
export function isCorrectGetPaidCode(submitted: string): boolean {
  return safeEqual(submitted.trim(), getGetPaidUnlockCode());
}

/** Verify a cookie tag against the expected value for `adminId`. */
export async function isValidGetPaidUnlockTag(
  adminId: string,
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await computeGetPaidUnlockTag(adminId);
  return safeEqual(cookieValue, expected);
}

/**
 * Path prefixes (relative to `/admin`) that make up the Get Paid module's
 * pages. Kept in one place so the proxy page-gate and any nav/link code
 * can't drift apart.
 */
export const GETPAID_PAGE_PREFIXES = ['/admin/getpaid', '/admin/ar', '/admin/invoices'] as const;

export function isGetPaidPagePath(pathname: string): boolean {
  return GETPAID_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * API path prefixes that mutate or read Get Paid money-handling data.
 * Scattered across the API tree (not a single /api/admin/getpaid/* root),
 * so we enumerate every route that Get Paid / AR pages call.
 */
export const GETPAID_API_PREFIXES = [
  '/api/admin/invoices',
  '/api/admin/invoice-payments',
  '/api/admin/recurring-invoices',
  '/api/admin/sales-receipts',
  '/api/portal/invoices', // portal-facing Stripe checkout for invoices
] as const;

// /api/admin/advertisers/* is shared by many non-Get-Paid features (channels,
// staff, locations, industries, ...). Only these specific sub-paths are
// Get Paid statement functionality, so match those exactly rather than the
// whole advertisers prefix.
const GETPAID_ADVERTISER_SUFFIXES = ['/send-statement', '/statement-history'];

function isGetPaidAdvertiserPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/admin/advertisers/')) return false;
  return GETPAID_ADVERTISER_SUFFIXES.some((suffix) => pathname.endsWith(suffix));
}

export function isGetPaidApiPath(pathname: string): boolean {
  if (GETPAID_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return isGetPaidAdvertiserPath(pathname);
}

/** Only these methods mutate state; GETs are allowed to render dashboards elsewhere. */
export const GETPAID_GATED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
