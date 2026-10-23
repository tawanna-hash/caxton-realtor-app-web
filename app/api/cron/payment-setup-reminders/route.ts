// app/api/cron/payment-setup-reminders/route.ts
//
// Daily. Reminds accounts payable who were sent a payment setup link ("set up
// ACH later") but have not saved a payment method: day 3 and day 7, then an
// internal alert to the market's billing inbox on day 10.
// ?dry=1 reports what would be sent. Auth: `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from 'next/server';
import { runPaymentSetupReminderSweep } from '@/lib/server/payment-setup-reminders';

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
  try {
    const out = await runPaymentSetupReminderSweep({ dry: new URL(req.url).searchParams.get('dry') === '1' });
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({ error: 'reminders failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: Request) { return GET(req); }
