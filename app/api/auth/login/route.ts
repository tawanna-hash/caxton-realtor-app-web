/**
 * /api/auth/login  POST — magic-link login.
 *
 * Returns the same response whether the email is known or not, to prevent
 * email enumeration. Unknown / unverified accounts get logged internally.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { loginSchema } from '@/lib/server/schemas/auth';
import { findRealtorForLogin } from '@/lib/server/realtors-store';
import { createAndSendMagicLink } from '@/lib/server/magic-link';
import { logger } from '@/lib/server/logger';
import { getRequestIp } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = loginSchema.parse(await req.json());
  const ipAddress = (await getRequestIp()) ?? undefined;
  const userAgent = (await headers()).get('user-agent') ?? undefined;

  const realtor = await findRealtorForLogin(input.email);

  if (realtor?.email_verified_at) {
    await createAndSendMagicLink({
      email: input.email,
      firstName: realtor.first_name,
      purpose: 'login',
      ipAddress,
      userAgent,
    });
  } else {
    logger.info({ email: input.email }, 'Login attempt for unknown or unverified email');
  }

  return NextResponse.json({
    success: true,
    message: 'If an account exists for that email, a sign-in link has been sent.',
  });
});
