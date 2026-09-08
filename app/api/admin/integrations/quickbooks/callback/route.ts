import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { connectQuickBooksCompany } from '@/lib/server/quickbooks';
import { logAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rnn_quickbooks_oauth_state';
const SETTINGS_PAGE = '/admin/integrations/quickbooks';

function statesMatch(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectWith(req: Request, params: Record<string, string>): NextResponse {
  const target = new URL(SETTINGS_PAGE, req.url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const response = NextResponse.redirect(target);
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/integrations/quickbooks',
    maxAge: 0,
  });
  return response;
}

export const GET = withAdminTracking(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const params = req.nextUrl.searchParams;
  if (params.get('error')) {
    return redirectWith(req, {
      error: 'authorization_denied',
      reason: params.get('error') || 'unknown',
    });
  }
  if (!statesMatch(params.get('state'), req.cookies.get(STATE_COOKIE)?.value ?? null)) {
    return redirectWith(req, { error: 'invalid_state' });
  }
  const code = params.get('code');
  const realmId = params.get('realmId');
  if (!code || !realmId) return redirectWith(req, { error: 'missing_callback_data' });

  try {
    await ensureSchema();
    const connected = await connectQuickBooksCompany({
      code,
      realmId,
      connectedBy: admin.email || admin.adminId,
    });
    await logAudit({
      adminId: admin.adminId,
      action: 'quickbooks.connect',
      entityType: 'quickbooks_connection',
      entityId: null,
      afterState: {
        environment: process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
        realm_id: realmId,
        company_name: connected.companyName,
      },
      ipAddress: await getRequestIp(),
    });
    return redirectWith(req, { connected: '1' });
  } catch (error) {
    console.error(
      '[quickbooks-callback] connection failed:',
      error instanceof Error ? error.message : error,
    );
    return redirectWith(req, { error: 'connection_failed' });
  }
});

