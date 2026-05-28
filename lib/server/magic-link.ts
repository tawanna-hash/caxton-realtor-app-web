/**
 * Magic link creation + verification. Reads `magic_links` and `email_log`
 * from DO Postgres (`getDoPool()`). After the data migration to Neon these
 * calls switch to `getPool()` from `lib/server/db/neon.ts`.
 */

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { doQuery } from './db/do';
import { getEmailProvider } from './email';
import { renderMagicLinkEmail } from './email/templates';
import { logger } from './logger';

function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function magicLinkExpiryMinutes(): number {
  return Number(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15');
}

/** Build the page URL the user clicks. Uses the current request origin. */
async function buildLoginUrl(rawToken: string, purpose: string): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  return `${base}/auth/verify?token=${encodeURIComponent(rawToken)}&purpose=${encodeURIComponent(purpose)}`;
}

interface CreateMagicLinkInput {
  email: string;
  firstName: string;
  purpose: 'signup_verification' | 'login';
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAndSendMagicLink(input: CreateMagicLinkInput): Promise<void> {
  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + magicLinkExpiryMinutes() * 60 * 1000);

  await doQuery(
    `INSERT INTO magic_links (email, token_hash, purpose, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.email.toLowerCase(),
      hash,
      input.purpose,
      expiresAt,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );

  const loginUrl = await buildLoginUrl(raw, input.purpose);
  const template = renderMagicLinkEmail({
    firstName: input.firstName,
    loginUrl,
    expiryMinutes: magicLinkExpiryMinutes(),
    purpose: input.purpose,
  });

  const provider = getEmailProvider();
  const result = await provider.send({
    to: { email: input.email, name: input.firstName },
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: input.purpose,
    tags: [input.purpose],
  });

  if (!result.success) {
    logger.error({ email: input.email, error: result.error }, 'Failed to send magic link email');
    throw new Error('Failed to send magic link email');
  }

  await doQuery(
    `INSERT INTO email_log (email_type, provider, provider_message_id, to_address, subject)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.purpose,
      provider.name,
      result.messageId ?? null,
      input.email.toLowerCase(),
      template.subject,
    ],
  );

  logger.info(
    { email: input.email, purpose: input.purpose, messageId: result.messageId },
    'Magic link sent',
  );
}

interface VerifyMagicLinkResult {
  valid: boolean;
  email?: string;
  purpose?: string;
  reason?: 'not_found' | 'expired' | 'already_used';
}

export async function verifyMagicLink(rawToken: string): Promise<VerifyMagicLinkResult> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const rows = await doQuery<{
    id: string;
    email: string;
    purpose: string;
    expires_at: Date;
    consumed_at: Date | null;
  }>(
    `SELECT id, email, purpose, expires_at, consumed_at
     FROM magic_links
     WHERE token_hash = $1`,
    [hash],
  );

  const link = rows[0];
  if (!link) return { valid: false, reason: 'not_found' };
  if (link.consumed_at) return { valid: false, reason: 'already_used' };
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  const consumed = await doQuery<{ id: string }>(
    `UPDATE magic_links
     SET consumed_at = NOW()
     WHERE id = $1 AND consumed_at IS NULL
     RETURNING id`,
    [link.id],
  );

  if (consumed.length === 0) return { valid: false, reason: 'already_used' };

  return { valid: true, email: link.email, purpose: link.purpose };
}
