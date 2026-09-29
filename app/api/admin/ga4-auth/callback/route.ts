/**
 * /api/admin/ga4-auth/callback
 *
 * GET — Google redirects here after the admin grants analytics.readonly.
 * Verifies state, stores the refresh token, and returns to the dashboard's
 * Connections section.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { exchangeGa4Code } from '@/lib/server/ga4-client';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE = '/admin/marketing-performance';

export const GET = withAdminTracking(async (req: Request) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const target = new URL(PAGE, req.url);
  target.hash = 'connections';

  const fail = (reason: string) => {
    target.searchParams.set('ga4', 'error');
    target.searchParams.set('reason', reason);
    const res = NextResponse.redirect(target);
    res.cookies.delete({ name: 'ga4_oauth_state', path: '/api/admin/ga4-auth' });
    return res;
  };

  const denied = url.searchParams.get('error');
  if (denied) return fail(denied);
  const code = url.searchParams.get('code');
  if (!code) return fail('missing_code');
  const expected = (await cookies()).get('ga4_oauth_state')?.value;
  if (!expected || expected !== url.searchParams.get('state')) return fail('state_mismatch');

  try {
    await exchangeGa4Code(url.origin, code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, '[ga4-auth] token exchange failed');
    return fail(/redirect/i.test(message) ? 'redirect_uri_mismatch' : /refresh token/i.test(message) ? 'no_refresh_token' : 'exchange_failed');
  }

  await logAudit({
    adminId: admin.adminId,
    action: 'ga4.connect',
    entityType: 'ga4_oauth_token',
    entityId: null,
    afterState: {},
    ipAddress: await getRequestIp(),
  }).catch(() => undefined);

  target.searchParams.set('ga4', 'connected');
  const res = NextResponse.redirect(target);
  res.cookies.delete({ name: 'ga4_oauth_state', path: '/api/admin/ga4-auth' });
  return res;
});
