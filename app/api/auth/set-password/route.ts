/**
 * /api/auth/set-password  POST — authenticated realtor sets a new password.
 *
 * If the realtor already has a password_hash, `currentPassword` is required
 * and must match. First-time password set requires only `newPassword`.
 *
 * Unlike the magic-link routes this does NOT re-issue a session cookie — the
 * caller is already authenticated.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { setPasswordSchema } from '@/lib/server/schemas/auth';
import { requireUser } from '@/lib/server/auth/user';
import {
  getPasswordHash,
  updatePasswordHash,
} from '@/lib/server/realtors-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 12;

export const POST = withErrorHandling(async (req: Request) => {
  const session = await requireUser();
  await rateLimit('passwordReset', session.realtorId);

  const input = setPasswordSchema.parse(await req.json());

  const realtor = await getPasswordHash(session.realtorId);
  if (!realtor) {
    throw new ApiError(404, 'Account not found');
  }

  if (realtor.password_hash) {
    if (!input.currentPassword) {
      throw new ApiError(400, 'Current password is required to change your password');
    }
    const ok = await bcrypt.compare(input.currentPassword, realtor.password_hash);
    if (!ok) {
      throw new ApiError(400, 'Current password is incorrect');
    }
  }

  const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await updatePasswordHash(session.realtorId, newHash);

  logger.info(
    { realtorId: session.realtorId, wasInitialSet: !realtor.password_hash },
    'Password set',
  );
  return NextResponse.json({ success: true });
});
