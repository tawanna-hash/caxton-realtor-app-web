import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { disconnectQuickBooks } from '@/lib/server/quickbooks';
import { logAudit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async (_req: NextRequest) => {
  const admin = await requireAdmin();
  await ensureSchema();
  await disconnectQuickBooks();
  await logAudit({
    adminId: admin.adminId,
    action: 'quickbooks.disconnect',
    entityType: 'quickbooks_connection',
    entityId: null,
    afterState: {
      environment: process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    },
    ipAddress: await getRequestIp(),
  });
  return NextResponse.json({ ok: true });
});

