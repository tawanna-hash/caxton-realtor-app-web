/**
 * /api/auth/password-login  POST — sign in with email + password.
 *
 * Generic error message ("Invalid email or password") for unknown email, null
 * password_hash, and bad password — to prevent enumeration. We also compare
 * against a dummy hash in the unknown / null-hash paths to keep timing roughly
 * equal.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { passwordLoginSchema } from '@/lib/server/schemas/auth';
import {
  findRealtorForPasswordLogin,
  bumpLoginNow,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const INVALID_CREDENTIALS_MSG = 'Invalid email or password';
const DUMMY_HASH = '$2b$12$0000000000000000000000.0000000000000000000000000000000';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = passwordLoginSchema.parse(await req.json());
  const realtor = await findRealtorForPasswordLogin(input.email);

  if (!realtor) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new ApiError(401, INVALID_CREDENTIALS_MSG);
  }

  if (!realtor.password_hash) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new ApiError(401, INVALID_CREDENTIALS_MSG);
  }

  const ok = await bcrypt.compare(input.password, realtor.password_hash);
  if (!ok) {
    throw new ApiError(401, INVALID_CREDENTIALS_MSG);
  }

  if (!realtor.email_verified_at) {
    throw new ApiError(
      403,
      'Please verify your email first \u2014 check your inbox for the verification link',
    );
  }

  await bumpLoginNow(realtor.id);

  const token = signSessionToken({ realtorId: realtor.id, email: realtor.email });
  const response = NextResponse.json({ success: true });
  await setRealtorSessionCookie(response, token);

  logger.info({ realtorId: realtor.id }, 'Password login succeeded');
  return response;
});
