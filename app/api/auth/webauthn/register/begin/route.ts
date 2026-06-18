/**
 * /api/auth/webauthn/register/begin  POST
 *
 * Step 1 of the WebAuthn registration ceremony. Returns the
 * PublicKeyCredentialCreationOptions the browser hands to
 * navigator.credentials.create(). Requires an existing realtor session —
 * passkeys are a *secondary* credential, never the primary identity-
 * establishing flow.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/auth/user';
import { getRequestIp } from '@/lib/server/auth/admin';
import {
  getRealtorIdentity,
  listExistingCredentials,
  insertChallenge,
} from '@/lib/server/webauthn-store';
import { getRpId, getRpName } from '@/lib/server/webauthn-config';

export const runtime = 'nodejs';

const CHALLENGE_TIMEOUT_MS = 5 * 60 * 1000;
const REGISTRATION_TIMEOUT_MS = 60_000;

export const POST = withErrorHandling(async () => {
  const session = await requireUser();
  await rateLimit('auth', session.realtorId);

  const realtor = await getRealtorIdentity(session.realtorId);
  if (!realtor) throw new ApiError(404, 'Account not found');

  const existing = await listExistingCredentials(session.realtorId);

  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    userID: Buffer.from(session.realtorId, 'utf8'),
    userName: realtor.email,
    userDisplayName:
      `${realtor.first_name} ${realtor.last_name}`.trim() || realtor.email,
    timeout: REGISTRATION_TIMEOUT_MS,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      // 'required' so iOS/Android store the credential as a discoverable
      // passkey. Without this, iOS may register a non-discoverable credential
      // that the user can only use if they type their email first — and the
      // 'Use Face ID' button (which omits email) throws NotAllowedError.
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'preferred',
    },
  });

  const ipAddress = (await getRequestIp()) ?? null;
  const userAgent = (await headers()).get('user-agent') ?? null;

  await insertChallenge(
    session.realtorId,
    options.challenge,
    'registration',
    CHALLENGE_TIMEOUT_MS,
    ipAddress,
    userAgent,
  );

  return NextResponse.json({ options });
});
