// app/api/cron/renewals-v2-reminders/route.ts
//
// Renewals (Beta). Reminds partners who were sent a one-tap renewal link but
// have not signed, 7, 3 and 1 days before their agreement expires.
//
// DORMANT BY DEFAULT: nothing is sent unless RENEWALS_V2_REMINDERS=on.
// ?dry=1 reports what would be sent without sending.
// Auth: `Authorization: Bearer $CRON_SECRET`.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { runReminderSweep } from '@/lib/renewals-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const enabled = process.env.RENEWALS_V2_REMINDERS === 'on';
  if (!enabled && !dry) return NextResponse.json({ ok: true, enabled: false, sent: 0 });

  try {
    await ensureSchema();
    const out = await runReminderSweep(getSql(), { dry });
    return NextResponse.json({ ok: true, enabled, dry, ...out });
  } catch (err) {
    return NextResponse.json({ error: 'reminders failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: Request) { return GET(req); }
