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

function oauthFailureReason(err: unknown): string {
  const candidate = err as {
    code?: unknown;
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
      : 'unknown';
  return SAFE_OAUTH_REASONS.has(reason) ? reason : 'unknown';
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

  try {
    const mailbox = await exchangeCodeForMailbox(code);
    await saveGmailTokens(mailbox);
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
  } catch (err) {
    const reason = oauthFailureReason(err);
    logger.warn({ reason }, '[gmail-auth] token exchange failed');
    target.searchParams.set('error', 'exchange_failed');
    target.searchParams.set('reason', reason);
    return NextResponse.redirect(target);
  }
});