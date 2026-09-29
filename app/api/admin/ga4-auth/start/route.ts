/**
 * /api/admin/ga4-auth/start
 *
 * GET — send the admin to Google's consent screen (analytics.readonly) so
 * /admin/marketing-performance can read GA4. A random state value is stored
 * in a short-lived httpOnly cookie and checked by the callback.
 */

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ApiError } from '@/lib/server/error';
import { buildGa4ConsentUrl, isGa4OAuthConfigured } from '@/lib/server/ga4-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  if (!isGa4OAuthConfigured()) {
    throw new ApiError(503, 'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then redeploy.');
  }
  const origin = new URL(req.url).origin;
  const state = randomBytes(18).toString('base64url');
  const url = buildGa4ConsentUrl(origin, state);
  if (new URL(req.url).searchParams.get('json') === '1') return NextResponse.json({ url });
  const res = NextResponse.redirect(url);
  res.cookies.set('ga4_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/admin/ga4-auth', maxAge: 600 });
  return res;
});
