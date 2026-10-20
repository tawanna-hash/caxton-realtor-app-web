// app/api/admin/renewals-v2/reminders/route.ts
//
// Renewals (Beta). Admin-triggered reminder sweep and status.
// GET  — whether automatic reminders are enabled.
// POST { dry?: boolean } — run the same sweep as the cron now. dry=true (the
//   default) only reports who would be reminded.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { runReminderSweep } from '@/lib/renewals-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ enabled: process.env.RENEWALS_V2_REMINDERS === 'on' });
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional */ }
  const dry = body.dry !== false;
  try {
    await ensureSchema();
    const out = await runReminderSweep(getSql(), { dry });
    return NextResponse.json({ ok: true, dry, enabled: process.env.RENEWALS_V2_REMINDERS === 'on', ...out });
  } catch (err) {
    return NextResponse.json({ error: 'reminders failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
