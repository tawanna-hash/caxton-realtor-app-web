/**
 * /api/auth/login  POST — magic-link login.
 *
 * Returns the same response whether the email is known or not, to prevent
 * email enumeration. Unknown / unverified accounts get logged internally.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { loginSchema } from '@/lib/server/schemas/auth';
import { findRealtorForLogin } from '@/lib/server/realtors-store';
import { createAndSendMagicLink } from '@/lib/server/magic-link';
import { logger } from '@/lib/server/logger';
import { getRequestIp } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  // Rate limiting intentionally removed for the magic-link request endpoint.
  // Real abuse is bounded by mailbox access (the attacker needs to read the
  // emailed link) and by the magic-link table's own token expiry, so the
  // brute-force surface is low. The previous 5-per-15min cap was locking
  // out legitimate users during normal sign-in retries.
  //
  // Admin password login (/api/admin/auth/login) and realtor password login
  // (/api/auth/password-login) still keep the rateLimit('auth') gate because
  // they accept arbitrary password guesses.
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
