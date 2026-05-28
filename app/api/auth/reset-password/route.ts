/**
 * /api/auth/reset-password  POST — consume a reset token and set a new
 * password. Locks the token row FOR UPDATE inside a transaction so the same
 * link can never be used twice (even concurrently). On success, also issues
 * a fresh session cookie — user is signed in.
 */

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { resetPasswordSchema } from '@/lib/server/schemas/auth';
import {
  withNeonTransaction,
  lockResetTokenTx,
  applyPasswordResetTx,
  consumeResetTokenTx,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 12;

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('passwordReset');

  const input = resetPasswordSchema.parse(await req.json());
  const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

  const result = await withNeonTransaction(async (client) => {
    const tokenRow = await lockResetTokenTx(client, tokenHash);
    if (!tokenRow) {
      throw new ApiError(400, 'Invalid or expired reset link');
    }
    if (tokenRow.consumed_at) {
      throw new ApiError(400, 'This reset link has already been used');
    }
    if (tokenRow.expires_at.getTime() < Date.now()) {
      throw new ApiError(400, 'This reset link has expired \u2014 please request a new one');
    }

    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

    const updated = await applyPasswordResetTx(client, tokenRow.realtor_id, newHash);
    if (!updated) {
      throw new ApiError(400, 'Account not found');
    }

    await consumeResetTokenTx(client, tokenRow.id);

    return { realtorId: tokenRow.realtor_id, email: updated.email };
  });

  const token = signSessionToken({ realtorId: result.realtorId, email: result.email });
  const response = NextResponse.json({ success: true });
  await setRealtorSessionCookie(response, token);

  logger.info({ realtorId: result.realtorId }, 'Password reset succeeded');
  return response;
});
