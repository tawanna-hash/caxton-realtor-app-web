/**
 * /api/auth/account  DELETE
 *
 * Permanently deletes the current realtor's account, all related data
 * (push subscriptions, notification preferences, etc.) and clears
 * the session cookie.
 *
 * Required by App Store Review Guideline 5.1.1(v): an app that supports
 * account creation must offer in-app account deletion. This is the backing
 * endpoint for the "Delete Account" control on the profile screen.
 *
 * Safety:
 *   - Requires an authenticated session.
 *   - Body must include { confirmEmail } that matches the current user's
 *     email (case-insensitive). The UI requires the user to type their email
 *     before this fires, so an accidental click cannot wipe the account.
 *
 * Returns 200 with { ok: true } on success, 401 if no session, 400 on bad
 * confirmation, 404 if the row is already gone, 500 on transaction failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { getCurrentUser } from '@/lib/server/auth/user';
import { signOut } from '@/lib/server/auth/authjs';
import { getRealtorMe, deleteRealtorAccount } from '@/lib/server/realtors-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Unauthorized');

  let body: { confirmEmail?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'Body must be JSON: { confirmEmail }');
  }

  const confirmEmail = typeof body.confirmEmail === 'string'
    ? body.confirmEmail.trim().toLowerCase()
    : '';
  if (!confirmEmail) {
    throw new ApiError(400, 'confirmEmail is required');
  }

  const realtor = await getRealtorMe(user.realtorId);
  if (!realtor) {
    // Already gone — clear the cookie so the client lands on the sign-in
    // screen instead of looping.
    await signOut({ redirect: false });
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  if (confirmEmail !== realtor.email.trim().toLowerCase()) {
    throw new ApiError(400, 'Confirmation email does not match your account email');
  }

  const deleted = await deleteRealtorAccount(user.realtorId);
  if (!deleted) {
    // Row vanished between the lookup and the delete — treat as success.
    logger.warn(
      { realtorId: user.realtorId },
      'deleteRealtorAccount: row already gone',
    );
  } else {
    logger.info(
      { realtorId: user.realtorId, email: realtor.email },
      'Realtor account deleted at user request',
    );
  }

  await signOut({ redirect: false });
  return NextResponse.json({ ok: true });
});
