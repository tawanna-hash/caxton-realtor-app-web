import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { syncInvoiceToQuickBooks } from '@/lib/server/quickbooks';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async (
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID.' }, { status: 400 });
  }
  await ensureSchema();
  const result = await syncInvoiceToQuickBooks(id, admin.email || admin.adminId);
  return NextResponse.json({ ok: true, result });
});

