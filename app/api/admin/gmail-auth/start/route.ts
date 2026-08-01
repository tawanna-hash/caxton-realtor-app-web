/**
 * /api/admin/gmail-auth/start
 *
 * GET — begin the Google OAuth consent flow for the Gmail event scanner.
 *
 * Redirects the admin straight to Google's consent screen. The admin UI links
 * here with a plain anchor, so a 302 is friendlier than returning JSON the
 * page would have to follow itself. Pass ?json=1 to get the URL instead —
 * useful when debugging the client/redirect-URI configuration.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { buildConsentUrl, isGmailOAuthConfigured } from '@/lib/server/gmail-client';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();

  if (!isGmailOAuthConfigured()) {
    throw new ApiError(
      503,
      'Gmail OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and ' +
      'GOOGLE_OAUTH_CLIENT_SECRET, then redeploy.',
    );
  }

  const url = buildConsentUrl();
  if (new URL(req.url).searchParams.get('json') === '1') {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url);
});
