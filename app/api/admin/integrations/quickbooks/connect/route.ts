import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  buildQuickBooksAuthorizeUrl,
  isQuickBooksConfigured,
} from '@/lib/server/quickbooks';
import { ApiError } from '@/lib/server/error';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rnn_quickbooks_oauth_state';

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  if (!isQuickBooksConfigured()) {
    throw new ApiError(
      503,
      'QuickBooks is not configured. Add the OAuth credentials and token encryption key first.',
    );
  }
  const state = randomBytes(32).toString('base64url');
  const url = buildQuickBooksAuthorizeUrl(state);
  if (new URL(req.url).searchParams.get('json') === '1') {
    const response = NextResponse.json({ url });
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/admin/integrations/quickbooks',
      maxAge: 10 * 60,
    });
    return response;
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/integrations/quickbooks',
    maxAge: 10 * 60,
  });
  return response;
});

