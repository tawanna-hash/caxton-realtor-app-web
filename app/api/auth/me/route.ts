/**
 * /api/auth/me  GET — return the current realtor.
 *
 * Returns 200 with `{ realtor: null }` for guests (no session cookie). The
 * client polls this on every navigation; returning 401 spammed the console
 * and broke the network panel for QA without adding any security value
 * (the cookie's absence is itself the signal). BUG-23.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getRealtorMe, bumpLastAppOpen } from '@/lib/server/realtors-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ realtor: null });
  }

  const realtor = await getRealtorMe(user.realtorId);
  if (!realtor) {
    // Session token references a deleted/missing account — treat as a guest
    // so the client falls back to the sign-in flow without a noisy 404.
    return NextResponse.json({ realtor: null });
  }

  // Best-effort, fire-and-forget. Don't block the response on this.
  bumpLastAppOpen(realtor.id).catch((err) => {
    logger.warn({ err }, 'Failed to update last_app_open_at');
  });

  const { password_set_at: passwordSetAt, ...rest } = realtor;
  return NextResponse.json({
    realtor: {
      ...rest,
      hasPassword: passwordSetAt !== null,
      passwordSetAt,
    },
  });
});
