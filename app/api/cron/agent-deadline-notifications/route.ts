import { NextResponse } from 'next/server';
import {
  isAgentDeadlineDeliveryWindow,
  runAgentDeadlineNotifications,
} from '@/lib/server/agent-deadline-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isAgentDeadlineDeliveryWindow()) {
    return NextResponse.json({ ok: true, skipped: 'outside Central delivery window' });
  }
  return NextResponse.json({ ok: true, ...(await runAgentDeadlineNotifications()) });
}
