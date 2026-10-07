import { NextResponse } from 'next/server';
import { runSchedulerWorkflows } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.get('authorization') ?? '') === `Bearer ${secret}`) return true;
  return false; // x-vercel-cron is spoofable; only the CRON_SECRET bearer is trusted
}

/** Closing Time Scheduler workflow: reminder emails before bookings and follow-ups after. Runs every 10 minutes. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runSchedulerWorkflows()) });
}
