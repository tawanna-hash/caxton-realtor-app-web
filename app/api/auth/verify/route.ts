/**
 * /api/auth/verify  POST — verify a magic link token and issue a session.
 *
 * First-time verification additionally:
 *   - sets default notification preferences (all enabled)
 *   - auto-enrolls in any active 'signup' giveaway rules for the realtor's market
 *
 * Returning users just get last_login_at bumped.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { verifySchema } from '@/lib/server/schemas/auth';
import { verifyMagicLink } from '@/lib/server/magic-link';
import {
  bumpLastLogin,
  ensureDefaultNotificationPrefs,
  findRealtorByEmailTx,
  markVerifiedAndLogin,
  autoEnrollSignupGiveaways,
  withNeonTransaction,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const { token } = verifySchema.parse(await req.json());

  const result = await verifyMagicLink(token);
  if (!result.valid) {
    throw new ApiError(400, `Invalid or expired link (${result.reason ?? 'unknown'})`);
  }

  const txResult = await withNeonTransaction(async (client) => {
    const realtor = await findRealtorByEmailTx(client, result.email!);
    if (!realtor) throw new ApiError(400, 'Account not found');

    const isNewUser = !realtor.email_verified_at;

    if (isNewUser) {
      await markVerifiedAndLogin(client, realtor.id);
      await ensureDefaultNotificationPrefs(client, realtor.id);
      // Auto-enroll must not block verification — log and move on.
      try {
        const enrolled = await autoEnrollSignupGiveaways(client, realtor.id);
        if (enrolled > 0) {
          logger.info(
            { realtorId: realtor.id, giveawayCount: enrolled },
            'Auto-enrolled new realtor in active giveaways',
          );
        }
      } catch (err) {
        logger.warn({ err, realtorId: realtor.id }, 'Giveaway auto-enrollment failed');
      }
    } else {
      await bumpLastLogin(client, realtor.id);
    }

    return { realtorId: realtor.id, email: result.email!, isNewUser };
  });

  const sessionToken = signSessionToken({
    realtorId: txResult.realtorId,
    email: txResult.email,
  });

  const response = NextResponse.json({
    success: true,
    isNewUser: txResult.isNewUser,
  });
  await setRealtorSessionCookie(response, sessionToken);
  return response;
});
