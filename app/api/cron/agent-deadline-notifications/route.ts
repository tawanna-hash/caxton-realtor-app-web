import { NextResponse } from 'next/server';
import {
  isAgentDeadlineDeliveryWindow,
  runAgentDeadlineNotifications,
} from '@/lib/server/agent-deadline-notifications';
import { syncAllMailboxes } from '@/lib/server/closing-time-mailbox';
import { runSignReminders } from '@/lib/server/closing-time-esign';
import { runDocChase, runWeeklyUpdates, runClosingCountdown, runPostClose, runAnniversaries } from '@/lib/server/closing-time-automations';
import { runAutoIntros, runDailySummaries, runSignatureReminders } from '@/lib/server/closing-time-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  return false; // x-vercel-cron is spoofable; only the CRON_SECRET bearer is trusted
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
  // Manual test run: only with the cron secret, for one realtor, outside the 8-9 AM window.
  const url = new URL(req.url);
  const testRealtor = url.searchParams.get('testRealtorId');
  const secret = process.env.CRON_SECRET;
  if (testRealtor && secret && (req.headers.get('authorization') ?? '') === `Bearer ${secret}` && /^[0-9a-f-]{36}$/i.test(testRealtor)) {
    return NextResponse.json({ ok: true, test: true, ...(await runAgentDeadlineNotifications(new Date(), { realtorId: testRealtor })) });
  }
  if (isAgentDeadlineDeliveryWindow()) {
    Object.assign(out, await runAgentDeadlineNotifications());
    out.signatureReminders = await runSignatureReminders().catch((e) => ({ sent: 0, escalated: 0, errors: [String(e)] }));
    out.signReminders = await runSignReminders(new URL(req.url).origin).catch((e) => ({ sent: 0, errors: [String(e)] }));
    out.autoIntros = await runAutoIntros().catch((e) => ({ sent: 0, errors: [String(e)] }));
    out.docChase = await runDocChase(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
    out.weeklyUpdates = await runWeeklyUpdates(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
    out.closingCountdown = await runClosingCountdown(date).catch((e) => ({ errors: [String(e)] }));
    out.anniversaries = await runAnniversaries(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
    out.postClose = await runPostClose(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
  }
  // Email replies from people on deals, for agents who turned on reading replies from their own mailbox.
  out.mailboxReplies = await syncAllMailboxes().catch((e) => ({ checked: 0, stored: 0, errors: [String(e)] }));
  // End-of-day summary, 6 PM Central (one retry hour; the ledger prevents duplicates).
  if (hour === 18 || hour === 19) {
    out.summaries = await runDailySummaries(date).catch((e) => ({ sent: 0, errors: [String(e)] }));
  }
  if (Object.keys(out).length === 1) out.skipped = 'outside Central delivery windows';
  return NextResponse.json(out);
}
