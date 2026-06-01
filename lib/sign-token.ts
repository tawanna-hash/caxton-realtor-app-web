// lib/sign-token.ts
//
// HMAC-based signing token for the public sign wizard.
// Format: base64url(payload).hmac(payload)
// where payload is JSON { aid: agreementId, exp: unixEpochSeconds }.
//
// Uses process.env.SIGN_SECRET (64 hex chars / 32 bytes).

import { createHmac, timingSafeEqual } from 'crypto';

const TTL_DEFAULT = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Buffer {
  const s = process.env.SIGN_SECRET;
  if (!s) throw new Error('SIGN_SECRET env var is not configured');
  return Buffer.from(s, 'hex');
}

function toBase64Url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function fromBase64Url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function hmac(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function signToken(agreementId: string, ttlSeconds: number = TTL_DEFAULT): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ aid: agreementId, exp });
  const encoded = toBase64Url(payload);
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string): { agreementId: string } | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    // Constant-time compare
    const expected = hmac(encoded);
    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(sig, 'hex');
    if (expectedBuf.length !== sigBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, sigBuf)) return null;

    const payload = JSON.parse(fromBase64Url(encoded)) as { aid: string; exp: number };
    if (typeof payload.aid !== 'string' || typeof payload.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;

    return { agreementId: payload.aid };
  } catch {
    return null;
  }
}
