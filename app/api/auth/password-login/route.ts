/**
 * /api/auth/password-login  POST — sign in with email + password.
 *
 * Generic error message ("Invalid email or password") for unknown email, null
 * password_hash, and bad password — to prevent enumeration.
 *
 * Mints the session cookie directly via Auth.js's encode() rather than
 * calling signIn(): empirically, signIn({ redirect: false }) called from a
 * custom Route Handler never writes the cookie at all (verified by reading
 * back cookies() immediately after signIn() resolved — nothing was there).
 * encode() is the documented low-level primitive Auth.js itself uses to
 * produce the session JWE (https://authjs.dev/reference/core/jwt), so a
 * manually-set cookie here is byte-compatible with what auth() and
 * proxy.ts's getToken() expect to read.
 *
 * NOTE: encode()'s own doc comment says "This module *will* be
 * refactored/changed. We do not recommend relying on it right now." It's
 * still the officially-documented mechanism (every custom-cookie example in
 * the Auth.js docs uses it) — next-auth and @auth/core are pinned exactly
 * in package.json specifically so an upgrade can't silently change this
 * function's behavior out from under us. Revisit on any major version bump.
 */

import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { passwordLoginSchema } from '@/lib/server/schemas/auth';
import { verifyCredentials } from '@/lib/server/auth/verify-credentials';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import { getRealtorMe } from '@/lib/server/realtors-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const INVALID_CREDENTIALS_MSG = 'Invalid email or password';
// Must match lib/server/auth/authjs.ts's session.maxAge exactly.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = passwordLoginSchema.parse(await req.json());

  const result = await verifyCredentials(input.email, input.password);
  if (!result) {
    throw new ApiError(401, INVALID_CREDENTIALS_MSG);
  }

  // salt must match authjs.ts's cookies.sessionToken.name exactly — Auth.js
  // derives its encryption salt from that config value at sign-in time (see
  // @auth/core/lib/actions/callback/index.js: `salt =
  // options.cookies.sessionToken.name`), not a fixed constant. token fields
  // must match what lib/server/auth/authjs.ts's jwt() callback produces
  // (sub, email, realtorId) so getToken() in proxy.ts sees the same shape
  // regardless of which path issued the session.
  logger.info(
    { jwtSecretLength: (process.env.JWT_SECRET ?? '').length },
    'DIAGNOSTIC: JWT_SECRET length at encode() call site',
  );
  const token = await encode({
    secret: process.env.JWT_SECRET!,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: result.realtorId,
      email: result.email,
      realtorId: result.realtorId,
    },
  });

  logger.info({ email: input.email }, 'Password login succeeded (Auth.js encode())');
  // Fetch full realtor payload so the client can skip a second /auth/me
  // round-trip (BUG-C in the sign-in audit). Same shape as /api/auth/me.
  const realtor = await getRealtorMe(result.realtorId);
  const payload = realtor
    ? (() => {
        const { password_set_at: passwordSetAt, ...rest } = realtor;
        return {
          ...rest,
          firstName: rest.first_name ?? null,
          lastName: rest.last_name ?? null,
          hasPassword: passwordSetAt !== null,
          passwordSetAt,
        };
      })()
    : null;

  const response = NextResponse.json({ success: true, realtor: payload });
  // WKWebView on iOS treats cookies with only Max-Age (no Expires) as
  // session cookies and drops them on app termination. Setting both
  // Max-Age (for standards-compliant browsers) and Expires (for WKWebView)
  // guarantees the cookie survives cold launches in the iOS Capacitor app.
  const sessionExpires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: sessionExpires,
  });
  return response;
});
