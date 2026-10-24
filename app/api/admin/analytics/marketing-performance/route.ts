// app/api/admin/analytics/marketing-performance/route.ts
//
// GET — monthly × channel rollup for /admin/marketing-performance.
// Sources and attribution rules are documented in
// lib/server/marketing-performance.ts.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { buildMarketingPerformance, isPubFilter } from '@/lib/server/marketing-performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  const pub = new URL(req.url).searchParams.get('pub');
  const data = await buildMarketingPerformance(isPubFilter(pub) ? pub : 'all');
  return NextResponse.json({ ok: true, data });
});
