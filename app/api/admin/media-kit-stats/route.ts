// app/api/admin/media-kit-stats/route.ts
//
// GET — live media-kit subscriber counts for the marketing composer's token
// preview ({{print_subscribers}} / {{email_subscribers}}). Same numbers the
// dispatcher renders at send time, so the marketer sees accurate values before
// scheduling.
//
// Auth: admin only.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { getSql, ensureSchema } from '@/lib/db';
import { getMediaKitStats } from '@/lib/media-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const stats = await getMediaKitStats(sql as never);
  return NextResponse.json(stats);
});
