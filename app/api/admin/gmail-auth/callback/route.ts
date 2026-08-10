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
  | 'no_refresh_token'
  | 'gmail_profile_failed'
  | 'token_exchange_failed'
  | 'token_save_failed'
  | 'unknown';

function oauthFailureReason(err: unknown): GmailCallbackReason {
  const candidate = err as {
    code?: unknown;
    message?: unknown;
    response?: { data?: unknown };
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
  if (SAFE_OAUTH_REASONS.has(reason)) return reason as GmailCallbackReason;

  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  if (message.includes('Google returned no refresh token')) return 'no_refresh_token';
  if (message.includes('Could not read the connected mailbox')) return 'gmail_profile_failed';
  return 'token_exchange_failed';
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
    const reason = oauthFailureReason(err);
    logger.warn({ reason }, '[gmail-auth] token exchange failed');
    target.searchParams.set('error', 'exchange_failed');
    target.searchParams.set('reason', reason);
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