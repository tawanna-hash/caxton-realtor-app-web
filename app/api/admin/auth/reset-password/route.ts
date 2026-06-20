/**
 * POST /api/admin/auth/reset-password
 * Consume a one-time reset token and set a new password.
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getRequestIp, getRequestUserAgent } from '@/lib/server/auth/admin';
import { hashPassword } from '@/lib/server/auth/passwords';
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');
  const input = resetPasswordSchema.parse(await req.json());

  const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
  const ip = await getRequestIp();
  const userAgent = await getRequestUserAgent();

  await withNeonTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      admin_id: string;
      expires_at: Date;
      consumed_at: Date | null;
      active: boolean;
    }>(
      `SELECT pr.id, pr.admin_id, pr.expires_at, pr.consumed_at, a.active
       FROM admin_password_resets pr
       JOIN admins a ON a.id = pr.admin_id
       WHERE pr.token_hash = $1`,
      [tokenHash],
    );

    const reset = rows[0];
    if (!reset) throw new ApiError(400, 'Invalid or expired reset link');
    if (reset.consumed_at) throw new ApiError(400, 'This reset link has already been used');
    if (new Date(reset.expires_at).getTime() < Date.now()) {
      throw new ApiError(400, 'This reset link has expired');
    }
    if (!reset.active) throw new ApiError(403, 'This admin account is not active');

    const passwordHash = await hashPassword(input.newPassword);

    await client.query(
      `UPDATE admins SET password_hash = $1 WHERE id = $2`,
      [passwordHash, reset.admin_id],
    );

    const consumed = await client.query(
      `UPDATE admin_password_resets SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL`,
      [reset.id],
    );
    if (consumed.rowCount === 0) {
      throw new ApiError(400, 'This reset link has already been used');
    }

    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, ip_address, user_agent)
       VALUES ($1, 'admin.password_reset_completed', $2, $3)`,
      [reset.admin_id, ip, userAgent],
    );
  });

  return NextResponse.json({ success: true });
});
