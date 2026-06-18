/**
 * /api/auth/webauthn/authenticate/begin  POST
 *
 * Returns PublicKeyCredentialRequestOptions for the browser. Optional `email`
 * narrows allowCredentials to that realtor's keys — omit it for true
 * passwordless sign-in via discoverable credentials.
 *
 * NOTE: No session required (this *is* the session-establishment path).
 * authRateLimit prevents credential stuffing.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { getRequestIp } from '@/lib/server/auth/admin';
import {
  lookupCredentialsForEmail,
  insertChallenge,
} from '@/lib/server/webauthn-store';
import { getRpId } from '@/lib/server/webauthn-config';
import { beginAuthSchema } from '@/lib/server/schemas/webauthn';

export const runtime = 'nodejs';

const CHALLENGE_TIMEOUT_MS = 5 * 60 * 1000;
const AUTHENTICATION_TIMEOUT_MS = 60_000;

export const POST = withErrorHandling(async (req: Request) => {
  const input = beginAuthSchema.parse(await req.json());

  // Skip rate-limiting the conditional-UI prefetch — it can fire on every
  // page load with no user gesture and would otherwise eat the budget.
  // The corresponding /finish route is still rate-limited.
  if (!input.autofill) {
    await rateLimit('auth');
  }

  let realtorId: string | null = null;
  let allowCredentials: Array<{ id: string; transports?: string[] }> = [];

  if (input.email) {
    const found = await lookupCredentialsForEmail(input.email);
    if (found) {
      realtorId = found.realtorId;
      allowCredentials = found.credentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports,
      }));
    }
    // Important: if email is unknown we deliberately fall through and issue
    // a challenge anyway. Verify will fail naturally — this prevents email
    // enumeration via the begin endpoint.
  }

  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    timeout: AUTHENTICATION_TIMEOUT_MS,
    userVerification: 'preferred',
    allowCredentials: allowCredentials.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[] | undefined,
    })),
  });

  const ipAddress = (await getRequestIp()) ?? null;
  const userAgent = (await headers()).get('user-agent') ?? null;

  await insertChallenge(
    realtorId,
    options.challenge,
    'authentication',
    CHALLENGE_TIMEOUT_MS,
    ipAddress,
    userAgent,
  );

  return NextResponse.json({ options });
});
