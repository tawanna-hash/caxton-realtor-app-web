import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  getQuickBooksStatus,
  listQuickBooksSyncOverview,
} from '@/lib/server/quickbooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  const [status, overview] = await Promise.all([
    getQuickBooksStatus(),
    listQuickBooksSyncOverview(),
  ]);
  return NextResponse.json({ status, ...overview });
});
