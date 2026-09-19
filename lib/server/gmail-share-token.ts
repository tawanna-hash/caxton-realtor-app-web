/**
 * Share-token issuance and verification for /admin/events/gmail.
 *
 * HS256 signed with JWT_SECRET (same secret as realtor sessions — no new
 * env var). 7-day TTL. Payload: { kind:'gmail-queue-share', adminId }.
 *
 * A token grants read-only access to whatever the pending queue looks
 * like at the moment the recipient opens the link. It's not a snapshot;
 * approving/rejecting events changes what the shared page shows.
 */

import jwt from 'jsonwebtoken';

const GMAIL_SHARE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const TOKEN_KIND = 'gmail-queue-share' as const;

interface GmailShareTokenPayload {
  kind: typeof TOKEN_KIND;
  adminId: string;
}

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set and at least 32 chars');
  return s;
}

export function signGmailShareToken(adminId: string): string {
  return jwt.sign({ kind: TOKEN_KIND, adminId }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: GMAIL_SHARE_TOKEN_TTL_SECONDS,
  });
}

export function verifyGmailShareToken(token: string): GmailShareTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) return null;
    const payload = decoded as jwt.JwtPayload;
    if (payload.kind !== TOKEN_KIND) return null;
    if (typeof payload.adminId !== 'string') return null;
    return { kind: TOKEN_KIND, adminId: payload.adminId };
  } catch {
    return null;
  }
}

export { GMAIL_SHARE_TOKEN_TTL_SECONDS };
