/**
 * JWT signing and verification for admin sessions.
 *
 *   - Admin session: { adminId, email, type:'admin' }  — cookie caxton_admin_session_v2
 *
 * Realtor sessions are issued/verified by Auth.js now (lib/server/auth/authjs.ts)
 * — the signSessionToken/verifySessionToken functions that used to live here
 * were removed as part of the Auth.js migration (Phase 5). RealtorSessionPayload
 * stays exported since lib/server/auth/user.ts's getCurrentUser()/requireUser()
 * still return that shape (mapped from an Auth.js session, not a raw JWT).
 *
 * Secrets:
 *   - JWT_SECRET        also reused as Auth.js's session secret. Required everywhere.
 *   - ADMIN_JWT_SECRET  signs admin sessions. REQUIRED in production
 *                       (NODE_ENV === 'production'). In dev/test it falls
 *                       back to JWT_SECRET so local environments don't need
 *                       to provision a second secret.
 *
 * Why required in prod: previously, if ADMIN_JWT_SECRET was unset, admin
 * sessions silently used JWT_SECRET. A leaked JWT_SECRET (a realtor-level
 * event) would then escalate to admin compromise. Forcing the env var split
 * means realtor and admin sessions cannot be cross-forged.
 *
 * Verification: admin tokens are tried against ADMIN_JWT_SECRET first, then
 * against JWT_SECRET. This means rotating in a new ADMIN_JWT_SECRET is a
 * zero-downtime operation:
 *   1. Set ADMIN_JWT_SECRET in Vercel env (DONE — provisioned 2026-06-20).
 *   2. New admin logins are signed with the admin secret; existing sessions
 *      keep verifying against JWT_SECRET until they expire (7d).
 *   3. After 7 days every admin session is signed with the admin secret and
 *      the JWT_SECRET fallback in verifyAdminSessionToken is dead weight
 *      (kept indefinitely as cheap insurance).
 *
 * MUST match the encoding the Express API used during the cutover so
 * existing live sessions stay valid. Algorithm: HS256 (jsonwebtoken default).
 */

import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';

export interface RealtorSessionPayload {
  realtorId: string;
  email: string;
}

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  type: 'admin';
}

function getRealtorSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long.');
  }
  return secret;
}

/**
 * Primary admin-signing secret.
 *
 * Production: ADMIN_JWT_SECRET is required. Throw at sign time if missing
 * so the failure is loud and the bug doesn't silently degrade admin sessions
 * to the realtor JWT key.
 *
 * Dev / test: fall back to JWT_SECRET so local environments don't need to
 * provision a second secret to sign in to /admin.
 */
function getAdminSecret(): Secret {
  const adminSecret = process.env.ADMIN_JWT_SECRET;
  if (adminSecret) {
    if (adminSecret.length < 32) {
      throw new Error('ADMIN_JWT_SECRET must be at least 32 characters long.');
    }
    return adminSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ADMIN_JWT_SECRET must be set in production. ' +
      'Provision a 32+ character random secret in Vercel and redeploy.',
    );
  }
  // Dev / test: reuse the realtor secret so local /admin login works
  // without forcing every contributor to set a second env var.
  return getRealtorSecret();
}

function getExpiry(): SignOptions['expiresIn'] {
  // jsonwebtoken accepts ms-style strings like '7d', '1h', or a number of seconds.
  return (process.env.JWT_EXPIRY as SignOptions['expiresIn']) ?? '7d';
}

export function signAdminSessionToken(
  payload: Omit<AdminSessionPayload, 'type'>,
): string {
  return jwt.sign({ ...payload, type: 'admin' }, getAdminSecret(), {
    expiresIn: getExpiry(),
  });
}

// Pin the verification algorithm. jsonwebtoken's default behavior trusts the
// `alg` field in the token header, which historically opened the door to
// alg-confusion attacks (e.g. `alg=none` or swapping HS↔RS keys). We only
// ever sign with HS256 — reject anything else outright. Matches the
// `algorithms: ['HS256']` lock in proxy.ts so the cookie verifier and the
// edge gate stay in agreement.
const VERIFY_OPTIONS = { algorithms: ['HS256' as const] };

export function verifySessionToken(token: string): RealtorSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getRealtorSecret(), VERIFY_OPTIONS) as Partial<RealtorSessionPayload>;
    if (typeof decoded.realtorId !== 'string' || typeof decoded.email !== 'string') return null;
    return { realtorId: decoded.realtorId, email: decoded.email };
  } catch {
    return null;
  }
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  // Try the admin secret first. If ADMIN_JWT_SECRET isn't set, this is the
  // same as JWT_SECRET and the fallback is a no-op.
  const adminSecret = getAdminSecret();
  const realtorSecret = getRealtorSecret();

  const trySecret = (secret: Secret): AdminSessionPayload | null => {
    try {
      const decoded = jwt.verify(token, secret, VERIFY_OPTIONS) as Partial<AdminSessionPayload>;
      if (
        decoded.type !== 'admin' ||
        typeof decoded.adminId !== 'string' ||
        typeof decoded.email !== 'string'
      ) {
        return null;
      }
      return { adminId: decoded.adminId, email: decoded.email, type: 'admin' };
    } catch {
      return null;
    }
  };

  const viaAdmin = trySecret(adminSecret);
  if (viaAdmin) return viaAdmin;
  // Fallback: tokens signed with the realtor secret before the rotation
  // landed. Only triggered when adminSecret !== realtorSecret.
  if (adminSecret !== realtorSecret) {
    return trySecret(realtorSecret);
  }
  return null;
}
