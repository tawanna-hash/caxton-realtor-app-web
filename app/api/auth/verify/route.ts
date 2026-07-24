/**
 * /api/auth/verify  POST — verify a magic link token and issue a session.
 *
 * First-time verification additionally:
 *   - sets default notification preferences (all enabled)
 *   - auto-enrolls in active 'signup' giveaways (re-enabled 2026-07-24)
 *
 * Returning users just get last_login_at bumped.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { verifySchema } from '@/lib/server/schemas/auth';
import { verifyMagicLink } from '@/lib/server/magic-link';
import {
  autoEnrollSignupGiveaways,
  bumpLastLogin,
  ensureDefaultNotificationPrefs,
  findRealtorByEmailTx,
  markVerifiedAndLogin,
  withNeonTransaction,
} from '@/lib/server/realtors-store';
import { signIn, INTERNAL_TRUSTED_PROVIDER_ID } from '@/lib/server/auth/authjs';
import { signInternalTrustToken } from '@/lib/server/auth/internal-trust-token';
import { logger } from '@/lib/server/logger';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const { token } = verifySchema.parse(await req.json());

  const result = await verifyMagicLink(token);
  if (!result.valid) {
    captureServerEvent('verify_failed', 'server', {
      surface: 'auth_verify',
      reason: result.reason ?? 'unknown',
    });
    await flushServerEvents();
    throw new ApiError(400, `Invalid or expired link (${result.reason ?? 'unknown'})`);
  }

  const txResult = await withNeonTransaction(async (client) => {
    const realtor = await findRealtorByEmailTx(client, result.email!);
    if (!realtor) throw new ApiError(400, 'Account not found');

    const isNewUser = !realtor.email_verified_at;

    if (isNewUser) {
      await markVerifiedAndLogin(client, realtor.id);
      await ensureDefaultNotificationPrefs(client, realtor.id);
      // Auto-enroll in active signup giveaways. Re-enabled 2026-07-24 —
      // new subscribers get a ticket for each signup rule on active giveaways
      // (including the early-bird bonus if before the rule's deadline_at).
      const enrolled = await autoEnrollSignupGiveaways(client, realtor.id);
      if (enrolled > 0) {
        logger.info({ realtorId: realtor.id, enrolled }, 'Giveaway auto-enroll on verify');
      }
    } else {
      await bumpLastLogin(client, realtor.id);
    }

    return { realtorId: realtor.id, email: result.email!, isNewUser };
  });

  const trustToken = signInternalTrustToken({
    realtorId: txResult.realtorId,
    email: txResult.email,
  });

  try {
    await signIn(INTERNAL_TRUSTED_PROVIDER_ID, {
      realtorId: txResult.realtorId,
      token: trustToken,
      redirect: false,
    });
  } catch (err) {
    // The account is already marked verified at this point — a failure
    // here just means the auto-sign-in didn't happen; the user can still
    // sign in manually.
    logger.error({ err, realtorId: txResult.realtorId }, 'Verify succeeded but auto-sign-in failed');
    return NextResponse.json({ success: true, isNewUser: txResult.isNewUser });
  }

  return NextResponse.json({
    success: true,
    isNewUser: txResult.isNewUser,
  });
});
