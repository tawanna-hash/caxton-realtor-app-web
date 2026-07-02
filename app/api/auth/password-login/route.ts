/**
 * /api/auth/password-login  POST — sign in with email + password.
 *
 * Generic error message ("Invalid email or password") for unknown email, null
 * password_hash, and bad password — to prevent enumeration. Signing in now
 * goes through Auth.js's Credentials provider (lib/server/auth/authjs.ts),
 * which does the timing-safe dummy-hash compare, the email_verified_at gate,
 * and bumps last_login_at.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { passwordLoginSchema } from '@/lib/server/schemas/auth';
import { signIn, EmailNotVerifiedError } from '@/lib/server/auth/authjs';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const INVALID_CREDENTIALS_MSG = 'Invalid email or password';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = passwordLoginSchema.parse(await req.json());

  try {
    // redirect: false → do not throw a NEXT_REDIRECT; return the response
    // so we can also return JSON. Auth.js sets the cookie on the response.
    await signIn('credentials', {
      email: input.email,
      password: input.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof EmailNotVerifiedError) {
      throw new ApiError(
        403,
        'Please verify your email first — check your inbox for the verification link',
      );
    }
    throw new ApiError(401, INVALID_CREDENTIALS_MSG);
  }

  logger.info({ email: input.email }, 'Password login succeeded (Auth.js)');
  return NextResponse.json({ success: true });
});
