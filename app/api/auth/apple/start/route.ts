/**
 * /api/auth/apple/start  GET — kick off the Sign in with Apple OAuth flow.
 *
 * Generates a fresh state + nonce, stashes their HMAC in a short-lived,
 * http-only, SameSite=None cookie (Apple posts back from its own domain so
 * SameSite=Lax would drop the cookie), then 302-redirects the browser to
 * Apple's authorize endpoint.
 *
 * The cookie is intentionally short-lived (10 minutes) — if the user takes
 * longer than that to complete Apple's flow, they'll get a friendly error
 * and can just try again.
 */

import { NextResponse } from 'next/server';
import {
  buildAppleAuthorizeUrl,
  buildStateCookieValue,
  generateStateAndNonce,
  isAppleOAuthConfigured,
} from '@/lib/server/apple-oauth';
import { logger } from '@/lib/server/logger';

const STATE_COOKIE = 'caxton_apple_oauth_state';
const STATE_COOKIE_MAX_AGE_SECONDS = 60 * 10; // 10 min

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAppleOAuthConfigured()) {
    logger.warn('Sign in with Apple start hit while env vars are missing');
    return NextResponse.json(
      {
        error: 'apple_oauth_not_configured',
        message:
          'Sign in with Apple is not yet configured for this environment.',
      },
      { status: 503 },
    );
  }

  const { state, nonce } = generateStateAndNonce();
  const cookieValue = buildStateCookieValue(state, nonce);
  const authorizeUrl = buildAppleAuthorizeUrl(state, nonce);

  // Preserve any optional `mode` query (signin/signup) so the callback can
  // route the user appropriately. We just round-trip it through Apple's
  // state parameter would be cleaner, but Apple has a hard length limit on
  // state, so we use our own cookie for it.
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'signin';

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set({
    name: STATE_COOKIE,
    value: cookieValue,
    httpOnly: true,
    secure: true,
    // SameSite=None is REQUIRED here. Apple submits the callback as a POST
    // from appleid.apple.com, which counts as a cross-site request, so a
    // SameSite=Lax cookie would not be sent on that request and we'd reject
    // the callback for "missing state cookie".
    sameSite: 'none',
    path: '/api/auth/apple',
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  res.cookies.set({
    name: 'caxton_apple_oauth_mode',
    value: mode,
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/api/auth/apple',
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
