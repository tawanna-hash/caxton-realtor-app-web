// app/api/cron/recurring-invoices/route.ts
//
// Daily sweep: finds recurring_invoice_schedules with next_run_at <= NOW()
// and status='active', generates the next invoice from each, and advances
// next_run_at. Designed to run once a day via vercel.json.
//
// Auth: `Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1`.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { runRecurringInvoiceSweep } from '@/lib/server/recurring-invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const summary = await runRecurringInvoiceSweep(sql);
    console.log('[cron/recurring-invoices]', JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron/recurring-invoices] sweep failed', err);
    return NextResponse.json(
      { error: 'sweep failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
