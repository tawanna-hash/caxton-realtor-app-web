/**
 * POST /api/admin/auth/forgot-password
 * Issue a one-time reset token + email it. Always returns 200 to avoid
 * leaking which addresses belong to admins.
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { query } from '@/lib/server/db/neon';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { getRequestIp, getRequestUserAgent } from '@/lib/server/auth/admin';
import { rateLimit } from '@/lib/server/rate-limit';
import { logger } from '@/lib/server/logger';
import { getEmailProvider } from '@/lib/server/email';
import { renderPasswordResetEmail } from '@/lib/server/email/templates';
import { adminForgotPasswordSchema } from '@/lib/server/schemas/auth-admin';

export const runtime = 'nodejs';

const EXPIRY_MINUTES = 15;

export const POST = withAdminTracking(async (req: Request) => {
  await rateLimit('adminAuth');
  const input = adminForgotPasswordSchema.parse(await req.json());

  const rows = await query<{
    id: string;
    email: string;
    full_name: string;
    active: boolean;
  }>(
    `SELECT id, email, full_name, active FROM admins WHERE email = $1`,
    [input.email],
  );

  const admin = rows[0];

  if (!admin || !admin.active) {
    logger.info({ email: input.email }, 'Password reset requested for unknown/inactive admin');
    return NextResponse.json({ success: true });
  }

  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

  const ip = await getRequestIp();
  const userAgent = await getRequestUserAgent();

  await query(
    `INSERT INTO password_reset_tokens (admin_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [admin.id, tokenHash, expiresAt, ip, userAgent],
  );

  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  const resetUrl = `${base}/admin/reset-password?token=${encodeURIComponent(raw)}`;

  const template = renderPasswordResetEmail({
    fullName: admin.full_name,
    resetUrl,
    expiryMinutes: EXPIRY_MINUTES,
  });

  const provider = getEmailProvider();
  const result = await provider.send({
    to: { email: admin.email, name: admin.full_name },
    subject: template.subject,
    text: template.text,
    html: template.html,
    emailType: 'admin_password_reset',
    tags: ['admin_password_reset'],
    disableTracking: true,
  });

  if (!result.success) {
    logger.error(
      { email: admin.email, error: result.error },
      'Failed to send admin password reset email',
    );
  } else {
    await query(
      `INSERT INTO email_log (email_type, provider, provider_message_id, to_address, subject)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'admin_password_reset',
        provider.name,
        result.messageId ?? null,
        admin.email,
        template.subject,
      ],
    );
  }

  await query(
    `INSERT INTO admin_audit_log (admin_id, action, ip_address, user_agent)
     VALUES ($1, 'admin.password_reset_requested', $2, $3)`,
    [admin.id, ip, userAgent],
  );

  return NextResponse.json({ success: true });
});
