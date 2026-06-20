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
import { rateLimit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  const input = loginSchema.parse(await req.json());

  // Two-layer rate limit to block email-bomb abuse without locking out a
  // single user retrying a typo:
  //   1. per-IP   — stops one attacker spraying many addresses
  //   2. per-email — stops a botnet flooding one mailbox from many IPs
  // Same 5-per-15min cap on both keys. Limits are deliberately tight
  // because magic-link emails cost real money via Resend and a runaway
  // loop can burn the daily quota.
  await rateLimit('magicLinkRequest');
  await rateLimit('magicLinkRequest', `email:${input.email}`);
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
