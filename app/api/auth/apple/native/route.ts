/**
 * /api/auth/apple/native  POST — native iOS Apple Sign In callback.
 *
 * The Capacitor iOS app calls @capacitor-community/apple-sign-in which uses
 * Apple's native ASAuthorizationController to get an identityToken. That
 * token is POSTed here, we verify it against Apple's JWKS, look up (or
 * link) the realtor by apple_sub, and mint caxton_session_v2 exactly the
 * same way password-login does (via next-auth/jwt encode()) so proxy.ts's
 * getToken() sees an identical session shape.
 *
 * Signup rule: user must have signed up first (findRealtorByEmail must find
 * a match). If not, returns 404 with signup_required so the app can route
 * to /dashboard?auth=signup&apple_email=... just like the web flow.
 */

import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  findRealtorByAppleSub,
  findRealtorByEmail,
  attachAppleSubToRealtor,
} from '@/lib/server/realtors-store';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ALLOWED_AUDIENCES = [
  process.env.APPLE_SERVICES_ID ?? 'app.realtynewsnow.web',
  'app.realtynewsnow',
];

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const body = (await req.json()) as {
    identityToken?: string;
    email?: string;
    fullName?: { givenName?: string; familyName?: string };
  };

  if (!body.identityToken || typeof body.identityToken !== 'string') {
    throw new ApiError(400, 'Missing identityToken');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(body.identityToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: ALLOWED_AUDIENCES,
    }));
  } catch (err) {
    logger.warn({ err }, 'Apple native token verify failed');
    throw new ApiError(401, 'Invalid Apple identity token');
  }

  const appleSub = payload.sub as string | undefined;
  const tokenEmail = (payload.email as string | undefined) ?? body.email;

  if (!appleSub) {
    throw new ApiError(400, 'Apple token missing sub');
  }

  // 1. Already linked? Sign them in.
  let realtor = await findRealtorByAppleSub(appleSub);

  // 2. Not linked, but email matches an existing account? Link and re-fetch.
  if (!realtor && tokenEmail) {
    const existing = await findRealtorByEmail(tokenEmail);
    if (existing) {
      await attachAppleSubToRealtor(existing.id, appleSub);
      realtor = await findRealtorByAppleSub(appleSub);
    }
  }

  // 3. No account yet — user must sign up first (per product rule).
  if (!realtor) {
    return NextResponse.json(
      {
        error: 'signup_required',
        apple_email: tokenEmail ?? '',
        apple_first_name: body.fullName?.givenName ?? '',
        apple_last_name: body.fullName?.familyName ?? '',
      },
      { status: 404 },
    );
  }

  const token = await encode({
    secret: process.env.JWT_SECRET!,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: realtor.id,
      email: realtor.email,
      realtorId: realtor.id,
    },
  });

  logger.info({ email: realtor.email }, 'Apple native sign-in succeeded');

  const response = NextResponse.json({ ok: true, redirect: '/dashboard' });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
});
