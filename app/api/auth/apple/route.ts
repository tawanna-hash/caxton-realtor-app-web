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
 *      - Otherwise creates a fresh realtor (Apple has already verified the
 *        email so we trust it).
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
  insertRealtorViaApple,
  withNeonTransaction,
} from '@/lib/server/realtors-store';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { getRequestIp } from '@/lib/server/auth/admin';
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

  const ipAddress = await getRequestIp();

  // 1) Existing realtor with this apple_sub? Sign them in.
  const existingByApple = await findRealtorByAppleSub(appleSub);
  if (existingByApple) {
    return issueSession(existingByApple.id, existingByApple.email);
  }

  // 2) Existing realtor with the same email but no apple_sub yet? Link them.
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

  // 3) Brand-new realtor. We MUST have an email — without one we can't seed
  //    a useful profile. (Happens if client lost the email between calls.)
  if (!email) {
    return NextResponse.json(
      {
        error:
          'We need your email to create your account. Open Settings → Apple ID → Sign-In with Apple → Realty News Now and choose "Stop Using Apple ID", then try again.',
      },
      { status: 400 },
    );
  }

  const created = await withNeonTransaction(async (client) => {
    return insertRealtorViaApple(client, {
      email,
      firstName: body.givenName ?? '',
      lastName: body.familyName ?? '',
      appleSub,
      consentText:
        'Created account via Sign in with Apple on iOS. User agreed to receive communications from Caxton Publications, Inc.',
      ipAddress,
    });
  });

  logger.info({ realtorId: created.id }, 'Created realtor via Apple sign-in');
  return issueSession(created.id, created.email);
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
