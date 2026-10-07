import { NextResponse } from 'next/server';
import { runMonthlyBackups } from '@/lib/server/closing-time-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return false; // x-vercel-cron is spoofable; only the CRON_SECRET bearer is trusted
}

// Monthly snapshot of every Closing Time workspace that has deals. Keeps the last 12 per agent.
export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await runMonthlyBackups());
}
