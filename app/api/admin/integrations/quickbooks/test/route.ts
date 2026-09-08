import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { testQuickBooksConnection } from '@/lib/server/quickbooks';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  const company = await testQuickBooksConnection();
  return NextResponse.json({ ok: true, company });
});

