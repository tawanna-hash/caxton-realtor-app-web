/**
 * /api/agents/drive-auth/callback
 *
 * GET — Google redirects here with `?code=&state=` after the realtor grants
 *       the drive.file scope. Verifies `state` against the nonce cookie set
 *       by /start, exchanges the code for a refresh token, stores it against
 *       this realtor, and bounces back to account settings.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { exchangeCodeForDriveAccount, saveDriveTokens } from '@/lib/server/google-drive-client';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const SETTINGS_PAGE = '/agents/account';
const STATE_COOKIE = 'drive_oauth_state';

type DriveCallbackReason =
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'redirect_uri_mismatch'
  | 'unauthorized_client'
  | 'access_denied'
  | 'state_mismatch'
  | 'oauth_config_missing'
  | 'no_refresh_token'
  | 'drive_profile_failed'
  | 'token_exchange_failed'
  | 'token_save_failed';

const SAFE_OAUTH_REASONS = new Set<DriveCallbackReason>([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'redirect_uri_mismatch',
  'unauthorized_client',
  'access_denied',
]);

function oauthFailure(err: unknown): { reason: DriveCallbackReason; status?: number } {
  const candidate = err as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const data = candidate?.response?.data;
  const fromResponse = data && typeof data === 'object'
    ? (data as { error?: unknown }).error
    : undefined;
  const reason = typeof fromResponse === 'string'
    ? fromResponse
    : typeof candidate?.code === 'string'
      ? candidate.code
      : '';
  const status = typeof candidate?.response?.status === 'number'
    ? candidate.response.status
    : undefined;
  if (SAFE_OAUTH_REASONS.has(reason as DriveCallbackReason)) {
    return { reason: reason as DriveCallbackReason, status };
  }

  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
  if (message.includes('no refresh token')) return { reason: 'no_refresh_token', status };
  if (message.includes('could not read the connected google account')) {
    return { reason: 'drive_profile_failed', status };
  }
  if (/(not configured|missing.*oauth|oauth.*missing|client id.*missing|client secret.*missing)/.test(message)) {
    return { reason: 'oauth_config_missing', status };
  }
  if (/(invalid client|client secret|client authentication)/.test(message)) {
    return { reason: 'invalid_client', status };
  }
  if (/(redirect.?uri|redirect url)/.test(message)) {
    return { reason: 'redirect_uri_mismatch', status };
  }
  if (/(invalid grant|authorization code|auth code|code expired|code already)/.test(message)) {
    return { reason: 'invalid_grant', status };
  }
  return { reason: 'token_exchange_failed', status };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const target = new URL(SETTINGS_PAGE, req.url);

  const denied = params.get('error');
  if (denied) {
    target.searchParams.set('drive_error', denied);
    return NextResponse.redirect(target);
  }

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const state = params.get('state');
  if (!expectedState || !state || state !== expectedState) {
    target.searchParams.set('drive_error', 'exchange_failed');
    target.searchParams.set('drive_reason', 'state_mismatch');
    return NextResponse.redirect(target);
  }

  const code = params.get('code');
  if (!code) {
    target.searchParams.set('drive_error', 'missing_code');
    return NextResponse.redirect(target);
  }

  let account;
  try {
    account = await exchangeCodeForDriveAccount(code);
  } catch (err) {
    const failure = oauthFailure(err);
    logger.warn(failure, '[drive-auth] token exchange failed');
    target.searchParams.set('drive_error', 'exchange_failed');
    target.searchParams.set('drive_reason', failure.reason);
    if (failure.status) target.searchParams.set('status', String(failure.status));
    const response = NextResponse.redirect(target);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  try {
    await saveDriveTokens({ realtorId: user.realtorId, ...account });
  } catch {
    const reason: DriveCallbackReason = 'token_save_failed';
    logger.warn({ reason }, '[drive-auth] token save failed');
    target.searchParams.set('drive_error', 'exchange_failed');
    target.searchParams.set('drive_reason', reason);
    const response = NextResponse.redirect(target);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  target.searchParams.set('drive_connected', '1');
  const response = NextResponse.redirect(target);
  response.cookies.delete(STATE_COOKIE);
  return response;
});
