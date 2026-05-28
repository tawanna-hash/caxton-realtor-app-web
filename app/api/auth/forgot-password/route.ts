/**
 * /api/auth/forgot-password  POST — request a password reset email.
 *
 * Always returns the same generic 200 response regardless of whether the
 * email is known, to prevent account enumeration. Only verified accounts get
 * an actual reset email.
 */

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { forgotPasswordSchema } from '@/lib/server/schemas/auth';
import {
  findVerifiedRealtorForReset,
  insertPasswordResetToken,
  logEmailSent,
} from '@/lib/server/realtors-store';
import { getEmailProvider } from '@/lib/server/email';
import { renderPasswordResetEmail } from '@/lib/server/email/templates';
import { getRequestIp } from '@/lib/server/auth/admin';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const RESET_TOKEN_EXPIRY_MINUTES = 60;

function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function buildResetUrl(rawToken: string): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  return `${base}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('passwordReset');

  const input = forgotPasswordSchema.parse(await req.json());
  const ipAddress = (await getRequestIp()) ?? null;
  const userAgent = (await headers()).get('user-agent') ?? null;

  const realtor = await findVerifiedRealtorForReset(input.email);

  if (realtor) {
    const { raw, hash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await insertPasswordResetToken(realtor.id, hash, expiresAt, ipAddress, userAgent);

    const resetUrl = await buildResetUrl(raw);
    const tpl = renderPasswordResetEmail({
      fullName: realtor.first_name,
      resetUrl,
      expiryMinutes: RESET_TOKEN_EXPIRY_MINUTES,
    });

    try {
      const provider = getEmailProvider();
      const result = await provider.send({
        to: { email: realtor.email, name: realtor.first_name },
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
        emailType: 'password_reset',
        tags: ['password_reset'],
      });
      if (result.success) {
        await logEmailSent(
          'password_reset',
          provider.name,
          result.messageId ?? null,
          realtor.email,
          tpl.subject,
        );
      } else {
        logger.error(
          { realtorId: realtor.id, error: result.error },
          'Password reset email send failed',
        );
      }
    } catch (err) {
      logger.error({ err, realtorId: realtor.id }, 'Password reset email threw');
    }
  } else {
    logger.info(
      { email: input.email },
      'Password reset requested for unknown/unverified email',
    );
  }

  return NextResponse.json({
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.',
  });
});
