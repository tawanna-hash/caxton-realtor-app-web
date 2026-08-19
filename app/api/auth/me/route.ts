/**
 * /api/auth/me  GET — return the current realtor.
 *
 * Returns 200 with `{ realtor: null }` for guests (no session cookie). The
 * client polls this on every navigation; returning 401 spammed the console
 * and broke the network panel for QA without adding any security value
 * (the cookie's absence is itself the signal). BUG-23.
 */

import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { withErrorHandling } from '@/lib/server/error';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getRealtorMe, bumpLastAppOpen } from '@/lib/server/realtors-store';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  // DIAGNOSTIC (temporary): drawer sometimes shows LOGIN after login on iOS.
  // Log cookie presence + auth() decode result to find where the chain
  // breaks. REMOVE after root cause is confirmed.
  try {
    const ck = await cookies();
    const hh = await headers();
    const sessionCookie = ck.get(SESSION_COOKIE_NAME);
    logger.info(
      {
        diag: 'auth-me',
        ua: hh.get('user-agent')?.slice(0, 80),
        cookieNames: ck.getAll().map((c) => c.name),
        hasSessionCookie: Boolean(sessionCookie),
        sessionCookieLen: sessionCookie?.value?.length ?? 0,
      },
      'DIAG /api/auth/me — cookies',
    );
  } catch {}

  const user = await getCurrentUser();
  logger.info(
    { diag: 'auth-me-decode', hasUser: Boolean(user), realtorId: user?.realtorId ?? null },
    'DIAG /api/auth/me — getCurrentUser()',
  );
  if (!user) {
    return NextResponse.json({ realtor: null });
  }

  const realtor = await getRealtorMe(user.realtorId);
  if (!realtor) {
    logger.warn({ diag: 'auth-me-missing-realtor', realtorId: user.realtorId }, 'DIAG /api/auth/me — realtor row missing');
    // Session token references a deleted/missing account — treat as a guest
    // so the client falls back to the sign-in flow without a noisy 404.
    return NextResponse.json({ realtor: null });
  }

  // Best-effort, fire-and-forget. Don't block the response on this.
  bumpLastAppOpen(realtor.id).catch((err) => {
    logger.warn({ err }, 'Failed to update last_app_open_at');
  });

  const { password_set_at: passwordSetAt, ...rest } = realtor;
  // Also expose camelCase aliases so client code that expects firstName /
  // lastName works without a snake_case lookup. The login route returns
  // camelCase, so without these the post-login `user` object disagrees with
  // the post-rehydrate `user` object, which is how the dashboard greeting
  // ended up reading 'Welcome, Subscriber' for signed-in users on cold
  // launch (https://realtynewsnow.app/dashboard).
  return NextResponse.json({
    realtor: {
      ...rest,
      firstName: rest.first_name ?? null,
      lastName: rest.last_name ?? null,
      hasPassword: passwordSetAt !== null,
      passwordSetAt,
    },
  });
});
