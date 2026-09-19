/**
 * /api/agents/drive-auth/start
 *
 * GET — begin the Google OAuth consent flow for one realtor's Google Drive.
 *
 * Redirects the signed-in realtor to Google's consent screen. A random
 * nonce is set as a short-lived cookie and echoed back in `state`; the
 * callback checks the two match before trusting the exchange, which is the
 * standard OAuth CSRF mitigation (a bad actor could otherwise trick a
 * signed-in agent into connecting the attacker's own Drive).
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { buildDriveConsentUrl, isDriveOAuthConfigured } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';

const STATE_COOKIE = 'drive_oauth_state';

export const GET = withErrorHandling(async (req: Request) => {
  await requireUser();

  if (!isDriveOAuthConfigured()) {
    throw new ApiError(
      503,
      'Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID and ' +
      'GOOGLE_DRIVE_CLIENT_SECRET, then redeploy.',
    );
  }

  const state = randomBytes(24).toString('hex');
  const url = buildDriveConsentUrl(state);

  const asJson = new URL(req.url).searchParams.get('json') === '1';
  const response = asJson ? NextResponse.json({ url }) : NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/agents/drive-auth',
  });
  return response;
});
