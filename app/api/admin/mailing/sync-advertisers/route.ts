// app/api/admin/mailing/sync-advertisers/route.ts
//
// POST — admin-session entry point for the active-advertisers → mailing
// sync. The same job runs unattended via /api/cron/sync-advertisers
// (which requires the CRON_SECRET bearer token).

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { syncAdvertisersFromAdvertisers } from '@/lib/mailing';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await ensureSchema();
    const started = Date.now();
    const result = await syncAdvertisersFromAdvertisers();
    const durationMs = Date.now() - started;
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/mailing/sync-advertisers]', msg);
    return NextResponse.json({ error: 'sync failed', detail: msg }, { status: 500 });
  }
});
