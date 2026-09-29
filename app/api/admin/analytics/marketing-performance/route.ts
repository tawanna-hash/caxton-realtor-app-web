// app/api/admin/analytics/marketing-performance/route.ts
//
// GET — monthly × channel rollup for /admin/marketing-performance.
// Sources and attribution rules are documented in
// lib/server/marketing-performance.ts.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { buildMarketingPerformance } from '@/lib/server/marketing-performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  const data = await buildMarketingPerformance();
  return NextResponse.json({ ok: true, data });
});
