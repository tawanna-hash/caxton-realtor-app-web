/**
 * Internal-trust token — lets a route that has already verified a user by
 * some other means (magic-link token, reset-token) hand off to Auth.js's
 * Credentials provider WITHOUT a password.
 *
 * Signed with JWT_SECRET (HS256, matching lib/server/jwt.ts's convention),
 * scoped with `aud: "internal-trusted"` so it can never be confused with a
 * realtor session token or a magic-link token, and expires in 5 minutes.
 * Each token carries a random `jti` that is atomically claimed (via Redis
 * SET NX EX, falling back to an in-memory Set when Upstash isn't
 * configured — same degradation as lib/server/rate-limit.ts) so a token can
 * only ever be redeemed once, even though it's never sent over the network
 * (minted and consumed synchronously, server-side, in the same request).
 *
 * Only lib/server/auth/authjs.ts's "internal-trusted" Credentials provider
 * verifies these. That provider must never be exposed to a client-facing
 * form — see the comment on its definition.
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getRedis } from '@/lib/server/rate-limit';
import { logger } from '@/lib/server/logger';

const AUDIENCE = 'internal-trusted';
const EXPIRY_SECONDS = 5 * 60;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long.');
  }
  return secret;
}

export interface InternalTrustPayload {
  realtorId: string;
  email: string;
}

export function signInternalTrustToken(payload: InternalTrustPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: EXPIRY_SECONDS,
    audience: AUDIENCE,
    jwtid: crypto.randomUUID(),
  });
}

// In-memory fallback for single-use enforcement when Upstash isn't
// configured. Per-instance only — same defense-in-depth tradeoff
// rate-limit.ts accepts for its memory fallback. The 5-minute JWT expiry
// is the hard backstop either way.
const usedJtiMemory = new Map<string, number>(); // jti -> expiresAt (ms)
const MEMORY_MAX_KEYS = 5_000;

function pruneMemory(now: number) {
  for (const [jti, expiresAt] of usedJtiMemory) {
    if (expiresAt <= now) usedJtiMemory.delete(jti);
  }
}

async function claimJti(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const result = await redis.set(`internal-trust-jti:${jti}`, '1', {
      ex: EXPIRY_SECONDS,
      nx: true,
    });
    return result === 'OK';
  }

  const now = Date.now();
  if (usedJtiMemory.size > MEMORY_MAX_KEYS) pruneMemory(now);
  if (usedJtiMemory.has(jti)) return false;
  usedJtiMemory.set(jti, now + EXPIRY_SECONDS * 1000);
  return true;
}

/**
 * Verifies signature, expiry, and audience, then atomically claims the
 * token's jti so it can't be redeemed twice. Returns null on ANY failure
 * (invalid signature/expired/wrong audience/already used) — callers must
 * treat all of those identically (reject) rather than branching on why.
 */
export async function verifyAndClaimInternalTrustToken(
  token: string,
): Promise<InternalTrustPayload | null> {
  let decoded: (InternalTrustPayload & { jti?: string }) | null = null;
  try {
    decoded = jwt.verify(token, getSecret(), {
      algorithms: ['HS256'],
      audience: AUDIENCE,
    }) as InternalTrustPayload & { jti?: string };
  } catch {
    return null;
  }

  if (
    !decoded ||
    typeof decoded.realtorId !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.jti !== 'string'
  ) {
    return null;
  }

  const claimed = await claimJti(decoded.jti);
  if (!claimed) {
    logger.warn({ jti: decoded.jti }, 'Internal-trust token replay attempt rejected');
    return null;
  }

  return { realtorId: decoded.realtorId, email: decoded.email };
}
