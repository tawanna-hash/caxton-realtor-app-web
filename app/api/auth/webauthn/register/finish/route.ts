/**
 * /api/auth/webauthn/register/finish  POST
 *
 * Step 2 of the registration ceremony. The browser returns a signed
 * attestation produced by the authenticator; we verify it against the
 * challenge we issued, then persist the credential.
 */

import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/auth/user';
import {
  withNeonTransaction,
  lockOpenChallengeForRegistrationTx,
  insertCredentialTx,
  consumeChallengeTx,
} from '@/lib/server/webauthn-store';
import { getExpectedRPIDs, getExpectedOrigins } from '@/lib/server/webauthn-config';
import { finishRegistrationSchema } from '@/lib/server/schemas/webauthn';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) => {
  const session = await requireUser();
  await rateLimit('auth', session.realtorId);

  const input = finishRegistrationSchema.parse(await req.json());

  const result = await withNeonTransaction(async (client) => {
    const challengeRow = await lockOpenChallengeForRegistrationTx(
      client,
      session.realtorId,
    );
    if (!challengeRow) {
      throw new ApiError(400, 'No active registration challenge \u2014 please restart');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response as RegistrationResponseJSON,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: getExpectedOrigins(),
        expectedRPID: getExpectedRPIDs(),
        requireUserVerification: false,
      });
    } catch (err) {
      logger.warn(
        { err, realtorId: session.realtorId },
        'WebAuthn registration verification threw',
      );
      throw new ApiError(400, 'Passkey verification failed');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new ApiError(400, 'Passkey verification failed');
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    const authenticatorType: 'platform' | 'cross-platform' | null =
      credentialDeviceType === 'singleDevice'
        ? 'platform'
        : credentialDeviceType === 'multiDevice'
          ? 'cross-platform'
          : null;

    const responseObj = input.response as {
      response?: { transports?: unknown };
    } | null;
    const rawTransports = responseObj?.response?.transports;
    const transports: string[] = Array.isArray(rawTransports)
      ? (rawTransports.filter((t) => typeof t === 'string') as string[])
      : [];

    const inserted = await insertCredentialTx(client, {
      realtorId: session.realtorId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports,
      deviceName: input.deviceName ?? null,
      authenticatorType,
    });

    await consumeChallengeTx(client, challengeRow.id);

    return {
      id: inserted.id,
      createdAt: inserted.createdAt,
      authenticatorType,
    };
  });

  logger.info(
    {
      realtorId: session.realtorId,
      credentialId: result.id,
      authenticatorType: result.authenticatorType,
    },
    'WebAuthn credential registered',
  );

  return NextResponse.json({
    success: true,
    credential: {
      id: result.id,
      deviceName: input.deviceName ?? null,
      createdAt: result.createdAt,
    },
  });
});
