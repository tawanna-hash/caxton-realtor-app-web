/**
 * /api/auth/apple/callback  POST — Sign in with Apple OAuth callback.
 *
 * Apple posts the result back to this endpoint as application/x-www-form-urlencoded.
 * We:
 *   1. Pull state, code, id_token, and the optional `user` JSON from the form.
 *   2. Verify state HMAC against the cookie we set in /start.
 *   3. Exchange `code` for tokens (also returns the same id_token).
 *   4. Cryptographically verify id_token against Apple's JWKS, also checking
 *      the nonce binding via the cookie's nonce HMAC.
 *   5. Find or create a realtor:
 *        - by stored apple_sub             → existing Apple-linked account
 *        - else by email match             → attach apple_sub to existing
 *        - else create new realtor         → first-time signup
 *   6. Issue our normal realtor session cookie and 302-redirect to /dashboard
 *      (or to /dashboard?welcome=1 on first-time signup).
 *
 * On any error we 302-redirect to /dashboard?auth=login&apple_error=... so
 * the existing AuthGate surfaces a friendly message. We never echo Apple
 * error text directly — it's not user-friendly and may leak internals.
 *
 * Apple also supports GET callback for response_mode=query, but we requested
 * response_mode=form_post (required when asking for the `name` scope), so we
 * only handle POST here.
 */

import { NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  isAppleOAuthConfigured,
  parseAppleUserField,
  verifyAppleIdToken,
  verifyStateAgainstCookie,
} from '@/lib/server/apple-oauth';
import {
  attachAppleSubToRealtor,
  findRealtorByAppleSub,
  findRealtorByEmail,
  insertRealtorViaApple,
} from '@/lib/server/realtors-store';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'caxton_apple_oauth_state';
const MODE_COOKIE = 'caxton_apple_oauth_mode';
const CONSENT_TEXT_APPLE =
  'I authorize Realty News Now to create my account using my Apple ID and to email me account-related communications.';

/** Build a redirect that clears the OAuth cookies. */
function redirectBack(
  url: string,
  status = 302,
  extraCookieClears: string[] = [],
): NextResponse {
  const res = NextResponse.redirect(url, { status });
  for (const name of [STATE_COOKIE, MODE_COOKIE, ...extraCookieClears]) {
    res.cookies.set({
      name,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/api/auth/apple',
      maxAge: 0,
    });
  }
  return res;
}

function originFrom(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const origin = originFrom(req);

  if (!isAppleOAuthConfigured()) {
    logger.warn('Apple OAuth callback hit while env vars are missing');
    return redirectBack(
      `${origin}/dashboard?auth=login&apple_error=not_configured`,
    );
  }

  // 1. Parse the form body Apple sent us.
  const form = await req.formData();
  const code = String(form.get('code') ?? '');
  const idToken = String(form.get('id_token') ?? '');
  const state = String(form.get('state') ?? '');
  const userField = form.get('user');
  const userJson = typeof userField === 'string' ? userField : null;

  // Apple may post `error=user_cancelled_authorize` instead of code/id_token.
  const appleError = form.get('error');
  if (appleError) {
    logger.info({ appleError }, 'Apple sign-in canceled or rejected by user');
    return redirectBack(`${origin}/dashboard?auth=login`);
  }

  if (!code || !idToken || !state) {
    logger.warn(
      { hasCode: !!code, hasIdToken: !!idToken, hasState: !!state },
      'Apple callback missing required fields',
    );
    return redirectBack(`${origin}/dashboard?auth=login&apple_error=bad_request`);
  }

  // 2. Verify state against the cookie we issued in /start.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const stateCookie = readCookie(cookieHeader, STATE_COOKIE);
  if (!stateCookie) {
    return redirectBack(
      `${origin}/dashboard?auth=login&apple_error=state_expired`,
    );
  }
  const { ok: stateOk, nonceHmac } = verifyStateAgainstCookie(state, stateCookie);
  if (!stateOk) {
    logger.warn('Apple callback state mismatch');
    return redirectBack(
      `${origin}/dashboard?auth=login&apple_error=state_mismatch`,
    );
  }

  // 3. Verify id_token signature + nonce.
  //    Apple posts the id_token directly in the form body (response_type=
  //    "code id_token"). The id_token is signed by Apple's JWKS; verifying it
  //    is sufficient to authenticate the user. The code exchange is only
  //    needed to obtain a refresh_token, which we don't currently use.
  //    We attempt the exchange but fall back to the form-body id_token if it
  //    fails (e.g., the Services ID's Web URLs haven't propagated yet).
  let idTokenToVerify = idToken;
  try {
    const tokenResp = await exchangeCodeForTokens(code);
    idTokenToVerify = tokenResp.id_token;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Apple token exchange failed; falling back to form-body id_token',
    );
  }

  // 4. Verify id_token signature + nonce.
  let claims;
  try {
    claims = await verifyAppleIdToken(idTokenToVerify, nonceHmac);
  } catch (err) {
    logger.error({ err }, 'Apple id_token verification failed');
    return redirectBack(
      `${origin}/dashboard?auth=login&apple_error=token_invalid`,
    );
  }

  const appleSub = claims.sub;
  const appleEmail = (claims.email ?? '').toLowerCase().trim();
  const isPrivateEmail =
    claims.is_private_email === true || claims.is_private_email === 'true';

  // 5. Find or create the realtor.
  const firstAuthName = parseAppleUserField(userJson);
  let realtorId: string;
  let realtorEmail: string;
  let firstTime = false;

  // 5a. Lookup by apple_sub.
  const byApple = await findRealtorByAppleSub(appleSub);
  if (byApple) {
    realtorId = byApple.id;
    realtorEmail = byApple.email;
  } else if (appleEmail) {
    // 5b. Lookup by email and attach apple_sub.
    const byEmail = await findRealtorByEmail(appleEmail);
    if (byEmail) {
      await attachAppleSubToRealtor(byEmail.id, appleSub);
      realtorId = byEmail.id;
      realtorEmail = byEmail.email;
    } else {
      // 5c. Brand new. Create realtor record.
      // If Apple didn't share an email (very rare — only when we don't have
      // the email scope or user is hidden behind private relay and we lost
      // their first-auth payload), bail out and route them to manual signup.
      firstTime = true;
      const created = await withNeonTransaction(async (client) => {
        return insertRealtorViaApple(client, {
          email: appleEmail,
          firstName: firstAuthName.firstName,
          lastName: firstAuthName.lastName,
          appleSub,
          consentText: CONSENT_TEXT_APPLE,
          ipAddress: clientIp(req),
        });
      });
      realtorId = created.id;
      realtorEmail = created.email;
    }
  } else {
    // No apple_sub match AND no email shared. We can't link or create safely.
    logger.warn({ appleSub }, 'Apple sign-in with no email and no existing link');
    return redirectBack(
      `${origin}/dashboard?auth=signup&apple_error=email_required`,
    );
  }

  // 6. Issue our normal session cookie and redirect to dashboard.
  const sessionToken = signSessionToken({
    realtorId,
    email: realtorEmail,
  });
  const dest = firstTime
    ? `${origin}/dashboard?welcome=1`
    : `${origin}/dashboard`;
  const res = redirectBack(dest);
  await setRealtorSessionCookie(res, sessionToken);

  logger.info(
    {
      realtorId,
      firstTime,
      isPrivateEmail,
    },
    'Apple sign-in succeeded',
  );
  return res;
}

// ---------------------------------------------------------------------------
// Tiny cookie reader. We can't use next/headers cookies() here because Apple's
// POST callback may have a Content-Type that next can't parse if we awaited
// req.formData() above — we read the raw Cookie header instead, which is
// always available.
// ---------------------------------------------------------------------------
function readCookie(header: string, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const p of parts) {
    const [k, ...v] = p.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
