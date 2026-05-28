/**
 * /api/auth/webauthn/authenticate/finish  POST
 *
 * Verifies the browser's assertion, updates the credential counter, bumps
 * last_login_at, and issues a fresh realtor session cookie (same shape as
 * the magic-link verify flow).
 *
 * Counter regression check: if the new counter is <= stored counter we treat
 * it as a probable cloned authenticator and reject. Some platform
 * authenticators (notably Apple/iCloud Keychain) always report counter=0;
 * accept-and-don't-update in that case.
 */

import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import {
  withNeonTransaction,
  lookupCredentialTx,
  lockOpenChallengeForAuthTx,
  consumeChallengeTx,
  updateCounterTx,
  touchLastUsedTx,
  bumpRealtorLoginTx,
} from '@/lib/server/webauthn-store';
import { getExpectedRPIDs, getExpectedOrigins } from '@/lib/server/webauthn-config';
import { finishAuthSchema } from '@/lib/server/schemas/webauthn';
import { signSessionToken } from '@/lib/server/jwt';
import { setRealtorSessionCookie } from '@/lib/server/auth/cookies';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  await rateLimit('auth');

  const input = finishAuthSchema.parse(await req.json());

  const responseObj = input.response as { id?: unknown } | null;
  const assertionId = responseObj?.id;
  if (typeof assertionId !== 'string' || !assertionId) {
    throw new ApiError(400, 'Invalid assertion');
  }

  const result = await withNeonTransaction(async (client) => {
    const cred = await lookupCredentialTx(client, assertionId);
    if (!cred) throw new ApiError(400, 'Passkey not recognized');

    const challengeRow = await lockOpenChallengeForAuthTx(client, cred.realtor_id);
    if (!challengeRow) {
      throw new ApiError(400, 'No active authentication challenge \u2014 please restart');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response as AuthenticationResponseJSON,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: getExpectedOrigins(),
        expectedRPID: getExpectedRPIDs(),
        credential: {
          id: assertionId,
          publicKey: new Uint8Array(cred.public_key),
          counter: Number(cred.counter),
          transports: cred.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
    } catch (err) {
      logger.warn(
        { err, realtorId: cred.realtor_id },
        'WebAuthn auth verification threw',
      );
      throw new ApiError(400, 'Passkey verification failed');
    }

    if (!verification.verified) {
      throw new ApiError(400, 'Passkey verification failed');
    }

    const newCounter = verification.authenticationInfo.newCounter;

    if (newCounter !== 0 && newCounter <= Number(cred.counter)) {
      logger.warn(
        {
          realtorId: cred.realtor_id,
          credentialId: cred.id,
          stored: cred.counter,
          received: newCounter,
        },
        'WebAuthn counter regression \u2014 possible cloned authenticator',
      );
      throw new ApiError(400, 'Passkey verification failed');
    }

    if (newCounter !== 0) {
      await updateCounterTx(client, cred.id, newCounter);
    } else {
      await touchLastUsedTx(client, cred.id);
    }

    await consumeChallengeTx(client, challengeRow.id);

    const realtor = await bumpRealtorLoginTx(client, cred.realtor_id);
    if (!realtor) throw new ApiError(400, 'Account not found');

    return { realtorId: cred.realtor_id, email: realtor.email };
  });

  const token = signSessionToken({
    realtorId: result.realtorId,
    email: result.email,
  });

  const response = NextResponse.json({ success: true });
  await setRealtorSessionCookie(response, token);

  logger.info({ realtorId: result.realtorId }, 'WebAuthn authentication succeeded');
  return response;
});
