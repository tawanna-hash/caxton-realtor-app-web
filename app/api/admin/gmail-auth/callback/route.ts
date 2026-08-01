/**
 * /api/admin/gmail-auth/callback
 *
 * GET — Google redirects here with `?code=…` after the admin grants the
 *       gmail.readonly scope. Exchanges the code for a refresh token, stores
 *       it against the mailbox that was actually connected, and bounces back
 *       to the review page.
 *
 * This URL must be registered verbatim as an Authorized redirect URI on the
 * OAuth client in Google Cloud Console — see docs/GMAIL_EVENT_SCANNER.md.
 *
 * Failures redirect back with ?error=… rather than rendering a JSON blob, so
 * the admin lands somewhere they can retry from.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { exchangeCodeForMailbox, saveGmailTokens } from '@/lib/server/gmail-client';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

const REVIEW_PAGE = '/admin/events/gmail';

export const GET = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const params = new URL(req.url).searchParams;
  const target = new URL(REVIEW_PAGE, req.url);

  // The admin can decline on the consent screen — Google sends back
  // ?error=access_denied rather than a code.
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
    // The message can quote Google's response — log it for operators, show
    // the admin a short reason.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[gmail-auth] token exchange failed',
    );
    target.searchParams.set('error', 'exchange_failed');
    return NextResponse.redirect(target);
  }
});
