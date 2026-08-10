/**
 * /api/admin/gmail-auth/callback
 *
 * GET — Google redirects here with `?code=…` after the admin grants the
 *       gmail.readonly scope. Exchanges the code for a refresh token, stores
 *       it against the mailbox that was actually connected, and bounces back
 *       to the review page.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { exchangeCodeForMailbox, saveGmailTokens } from '@/lib/server/gmail-client';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const REVIEW_PAGE = '/admin/events/gmail';
const SAFE_OAUTH_REASONS = new Set([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'redirect_uri_mismatch',
  'unauthorized_client',
  'access_denied',
]);

type GmailCallbackReason =
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'redirect_uri_mismatch'
  | 'unauthorized_client'
  | 'access_denied'
  | 'oauth_config_missing'
  | 'no_refresh_token'
  | 'gmail_profile_failed'
  | 'token_exchange_failed'
  | 'token_save_failed';

type OAuthFailure = {
  reason: GmailCallbackReason;
  status?: number;
};

function oauthFailure(err: unknown): OAuthFailure {
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
  if (SAFE_OAUTH_REASONS.has(reason)) {
    return { reason: reason as GmailCallbackReason, status };
  }

  const message = typeof candidate?.message === 'string'
    ? candidate.message.toLowerCase()
    : '';
  if (message.includes('no refresh token')) return { reason: 'no_refresh_token', status };
  if (message.includes('could not read the connected mailbox')) {
    return { reason: 'gmail_profile_failed', status };
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

export const GET = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const params = new URL(req.url).searchParams;
  const target = new URL(REVIEW_PAGE, req.url);

  const denied = params.get('error');
  if (denied) {
    target.searchParams.set('error', denied);
    return NextResponse.redirect(target);
  }

  const code = params.get('code');
  if (!code) {
    target.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(target);
  }

  let mailbox;
  try {
    mailbox = await exchangeCodeForMailbox(code);
  } catch (err) {
    const failure = oauthFailure(err);
    logger.warn(failure, '[gmail-auth] token exchange failed');
    target.searchParams.set('error', 'exchange_failed');
    target.searchParams.set('reason', failure.reason);
    if (failure.status) target.searchParams.set('status', String(failure.status));
    return NextResponse.redirect(target);
  }

  try {
    await saveGmailTokens(mailbox);
  } catch {
    const reason: GmailCallbackReason = 'token_save_failed';
    logger.warn({ reason }, '[gmail-auth] token save failed');
    target.searchParams.set('error', 'exchange_failed');
    target.searchParams.set('reason', reason);
    return NextResponse.redirect(target);
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'gmail.connect',
    entityType: 'gmail_oauth_token',
    entityId: null,
    afterState: { email_address: mailbox.emailAddress, scope: mailbox.scope },
    ipAddress: await getRequestIp(),
  });
  target.searchParams.set('connected', '1');
  return NextResponse.redirect(target);
});