// app/api/admin/mailing/backfill-active-advertisers/route.ts
//
// POST — one-time admin entry point to populate the 'active-advertiser'
// segment with every currently-active advertiser and their staff.
// Idempotent: re-running skips rows whose email already exists in the
// segment.

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { backfillActiveAdvertisersSegment } from '@/lib/mailing';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const started = Date.now();
    const result = await backfillActiveAdvertisersSegment();
    const durationMs = Date.now() - started;
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/mailing/backfill-active-advertisers]', msg);
    return NextResponse.json({ error: 'backfill failed', detail: msg }, { status: 500 });
  }
});
