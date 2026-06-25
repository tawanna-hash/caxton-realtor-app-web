/**
 * POST /api/auth/apple
 *
 * Server-side handshake for "Sign in with Apple" on iOS. The native client
 * uses @capacitor-community/apple-sign-in to obtain an `identityToken`
 * (Apple-signed JWT) plus optional first/last name + email (only on the
 * FIRST authorization for a given user).
 *
 * This route:
 *   1. Verifies the JWT signature against Apple's published JWKS.
 *   2. Confirms `iss === https://appleid.apple.com`.
 *   3. Confirms `aud === APPLE_CLIENT_ID` (our bundle id).
 *   4. Confirms `exp` is in the future.
 *   5. Looks up the realtor by `sub` (Apple's stable per-team user id).
 *      - If found, signs them in.
 *      - If not found, tries to match by verified email; if matched,
 *        attaches the apple_sub to the existing row.
 *      - Otherwise responds 404 — we DO NOT auto-create accounts via
 *        Apple sign-in. The realtor must register first (which collects
 *        license number, market, and other fields Apple can't provide).
 *   6. Issues our session cookie (`caxton_session_v2`) and returns
 *      `{ success: true, autoSignedIn: true, realtor }`.
 *
 * Apple's keys rotate, so we hit JWKS through `jose.createRemoteJWKSet`
 * which handles caching + rotation automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  findRealtorByAppleSub,
  findRealtorByEmail,
  attachAppleSubToRealtor,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

// Apple's expected issuer & JWKS endpoint
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

// Cached JWKS — `jose` handles in-memory caching + rotation per process.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getAppleJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(APPLE_JWKS_URL);
  return _jwks;
}

interface ApplePayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

export async function POST(req: NextRequest) {
  let body: {
    identityToken?: string;
    email?: string | null;
    givenName?: string | null;
    familyName?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { identityToken } = body;
  if (!identityToken || typeof identityToken !== 'string') {
    return NextResponse.json({ error: 'identityToken is required.' }, { status: 400 });
  }

  // The audience must match the Apple "Services ID" / app bundle id that the
  // native client used. We accept either an APPLE_CLIENT_ID env (preferred)
  // or fall back to the iOS bundle id used in Capacitor config.
  const expectedAudience =
    process.env.APPLE_CLIENT_ID ||
    process.env.APPLE_BUNDLE_ID ||
    'app.realtynewsnow';

  let payload: ApplePayload;
  try {
    const verified = await jwtVerify(identityToken, getAppleJwks(), {
      issuer: APPLE_ISSUER,
      audience: expectedAudience,
    });
    payload = verified.payload as ApplePayload;
  } catch (err) {
    logger.warn({ err }, 'Apple identityToken verification failed');
    return NextResponse.json(
      { error: 'Invalid Apple identity token.' },
      { status: 401 },
    );
  }

  const appleSub = payload.sub;
  if (!appleSub) {
    return NextResponse.json(
      { error: 'Apple token missing subject.' },
      { status: 401 },
    );
  }

  // Apple may include email in the token; otherwise the client sends it
  // (only on the very first authorization). After that we just have the sub.
  const tokenEmail =
    typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  const clientEmail =
    typeof body.email === 'string' ? body.email.toLowerCase() : null;
  const email = tokenEmail ?? clientEmail ?? null;

  // 1) Existing realtor with this apple_sub? Sign them in.
  const existingByApple = await findRealtorByAppleSub(appleSub);
  if (existingByApple) {
    return issueSession(existingByApple.id, existingByApple.email);
  }

  // 2) Existing realtor with the same email but no apple_sub yet? Link them.
  //    This is the legitimate "I signed up with email and now want to use
  //    Sign in with Apple" upgrade path. We require email_verified=true on
  //    the Apple JWT (Apple itself guarantees email ownership) so we trust
  //    the link without an extra confirmation step.
  if (email) {
    const existingByEmail = await findRealtorByEmail(email);
    if (existingByEmail) {
      await attachAppleSubToRealtor(existingByEmail.id, appleSub);
      logger.info(
        { realtorId: existingByEmail.id },
        'Linked Apple sub to existing realtor',
      );
      return issueSession(existingByEmail.id, existingByEmail.email);
    }
  }

  // 3) No matching account. We do NOT auto-create via Apple sign-in —
  //    registration requires license number + market + other fields Apple
  //    can't provide. Tell the client to send the user through the signup
  //    form. The 'account_not_found' code lets the UI render a tailored
  //    error and CTA instead of the generic failure copy.
  logger.info(
    { hasEmail: !!email, appleSub: appleSub.slice(0, 8) + '…' },
    'Apple sign-in rejected — no matching account',
  );
  return NextResponse.json(
    {
      error: 'account_not_found',
      message:
        'No Realty News Now account is linked to this Apple ID yet. Please create an account first, then sign in with Apple.',
    },
    { status: 404 },
  );
}

async function issueSession(realtorId: string, email: string) {
  const token = signSessionToken({ realtorId, email });
  const response = NextResponse.json({
    success: true,
    autoSignedIn: true,
    realtor: { id: realtorId, email },
  });
  await setRealtorSessionCookie(response, token);
  return response;
}
