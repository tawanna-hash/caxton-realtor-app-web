/**
 * JWT signing and verification. Two payload shapes:
 *
 *   - Realtor session: { realtorId, email }                — cookie caxton_session_v2
 *   - Admin session:   { adminId,   email, type:'admin' }  — cookie caxton_admin_session_v2
 *
 * Secrets (F-07 from prod audit):
 *   - JWT_SECRET        signs realtor sessions.
 *   - ADMIN_JWT_SECRET  signs admin sessions when set. If unset, admin
 *                       sessions fall back to JWT_SECRET for backward
 *                       compatibility (existing sessions stay valid).
 *
 * Verification: admin tokens are tried against ADMIN_JWT_SECRET first, then
 * against JWT_SECRET. This means rotating in a new ADMIN_JWT_SECRET is a
 * zero-downtime operation:
 *   1. Set ADMIN_JWT_SECRET in Vercel env.
 *   2. New admin logins are signed with the admin secret; existing sessions
 *      keep verifying against JWT_SECRET until they expire (7d).
 *   3. After 7 days every admin session is signed with the admin secret and
 *      JWT_SECRET fallback is dead weight.
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

/** Primary admin-signing secret. Falls back to JWT_SECRET if not configured. */
function getAdminSecret(): Secret {
  const adminSecret = process.env.ADMIN_JWT_SECRET;
  if (adminSecret) {
    if (adminSecret.length < 32) {
      throw new Error('ADMIN_JWT_SECRET must be at least 32 characters long.');
    }
    return adminSecret;
  }
  // Backward-compat: before ADMIN_JWT_SECRET is provisioned, admin sessions
  // use the realtor secret. This is the pre-audit behavior.
  return getRealtorSecret();
}

function getExpiry(): SignOptions['expiresIn'] {
  // jsonwebtoken accepts ms-style strings like '7d', '1h', or a number of seconds.
  return (process.env.JWT_EXPIRY as SignOptions['expiresIn']) ?? '7d';
}

export function signSessionToken(payload: RealtorSessionPayload): string {
  return jwt.sign(payload, getRealtorSecret(), { expiresIn: getExpiry() });
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
