/**
 * /api/auth/verify  POST — verify a magic link token and issue a session.
 *
 * First-time verification additionally:
 *   - sets default notification preferences (all enabled)
 *
 * Returning users just get last_login_at bumped.
 *
 * Note: Auto-enrollment in active 'signup' giveaways was disabled
 * 2026-06-16 per Tawanna's direction. The `autoEnrollSignupGiveaways`
 * helper in realtors-store.ts is intentionally kept (no callers) so it
 * can be re-wired here cheaply if we ever turn the perk back on.
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
  withNeonTransaction,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';

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
      // Giveaway auto-enrollment disabled 2026-06-16. See header comment.
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
