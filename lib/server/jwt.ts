/**
 * JWT signing and verification. Two payload shapes:
 *
 *   - Realtor session: { realtorId, email }                — cookie caxton_session_v2
 *   - Admin session:   { adminId,   email, type:'admin' }  — cookie caxton_admin_session_v2
 *
 * One secret (JWT_SECRET) signs both. The admin verifier additionally checks
 * `type === 'admin'` so a realtor token can never be used as an admin token.
 *
 * MUST match the encoding the Express API used during the cutover so existing
 * live sessions stay valid. Algorithm: HS256 (jsonwebtoken default).
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

function getSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long.');
  }
  return secret;
}

function getExpiry(): SignOptions['expiresIn'] {
  // jsonwebtoken accepts ms-style strings like '7d', '1h', or a number of seconds.
  return (process.env.JWT_EXPIRY as SignOptions['expiresIn']) ?? '7d';
}

export function signSessionToken(payload: RealtorSessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: getExpiry() });
}

export function signAdminSessionToken(payload: Omit<AdminSessionPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'admin' }, getSecret(), { expiresIn: getExpiry() });
}

export function verifySessionToken(token: string): RealtorSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as Partial<RealtorSessionPayload>;
    if (typeof decoded.realtorId !== 'string' || typeof decoded.email !== 'string') return null;
    return { realtorId: decoded.realtorId, email: decoded.email };
  } catch {
    return null;
  }
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as Partial<AdminSessionPayload>;
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
}
