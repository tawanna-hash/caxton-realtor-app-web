import { NextResponse } from 'next/server';
import {
  isAgentDeadlineDeliveryWindow,
  runAgentDeadlineNotifications,
} from '@/lib/server/agent-deadline-notifications';
import { runAutoIntros, runDailySummaries, runSignatureReminders } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

function chicagoNow(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, hour: Number(v('hour')) };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { date, hour } = chicagoNow();
  const out: Record<string, unknown> = { ok: true };
  if (isAgentDeadlineDeliveryWindow()) {
    Object.assign(out, await runAgentDeadlineNotifications());
    out.signatureReminders = await runSignatureReminders().catch((e) => ({ sent: 0, escalated: 0, errors: [String(e)] }));
    out.autoIntros = await runAutoIntros().catch((e) => ({ sent: 0, errors: [String(e)] }));
  }
  // End-of-day summary, 6 PM Central (one retry hour; the ledger prevents duplicates).
  if (hour === 18 || hour === 19) {
    out.summaries = await runDailySummaries(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
  }
  if (Object.keys(out).length === 1) out.skipped = 'outside Central delivery windows';
  return NextResponse.json(out);
}
