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
import { sendRenewalEmail, REMINDER_STAGES } from '@/lib/renewals-v2/service';
import type { AgreementAuditEntry } from '@/lib/agreements';

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
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.audit_log, p.company_name,
             (COALESCE(p.exp_date, p.end_date) - CURRENT_DATE)::int AS days_left
        FROM agreements r
        JOIN agreements p ON p.id = r.renewed_from_id
       WHERE r.is_renewal = true
         AND r.status = 'sent'
         AND r.signed_at IS NULL
         AND COALESCE(p.exp_date, p.end_date) IS NOT NULL
         AND (COALESCE(p.exp_date, p.end_date) - CURRENT_DATE) BETWEEN 0 AND ${REMINDER_STAGES[0]}
    ` as unknown as Array<{ id: string; audit_log: AgreementAuditEntry[] | null; company_name: string | null; days_left: number }>;

    const results: Array<{ id: string; company: string | null; stage?: number; status: string; error?: string }> = [];
    for (const r of rows) {
      const log = Array.isArray(r.audit_log) ? r.audit_log : [];
      if (!log.some((e) => e.event === 'renewal_v2_sent')) continue;
      // Pick the smallest stage that has been reached and not yet reminded.
      const done = new Set(
        log.filter((e) => e.event === 'renewal_v2_reminder')
          .map((e) => Number(/T-(\d+)/.exec(e.details ?? '')?.[1])),
      );
      const reached = REMINDER_STAGES.filter((s) => r.days_left <= s);
      const stage = reached.length ? Math.min(...reached) : undefined;
      if (stage == null || done.has(stage)) continue;
      if (dry) { results.push({ id: r.id, company: r.company_name, stage, status: 'would_send' }); continue; }
      const out = await sendRenewalEmail(sql, r.id, { reminderStage: stage });
      results.push({ id: r.id, company: r.company_name, stage, status: out.ok ? 'sent' : 'failed', error: out.error });
    }
    return NextResponse.json({ ok: true, enabled, dry, results, sent: results.filter((x) => x.status === 'sent').length });
  } catch (err) {
    return NextResponse.json({ error: 'reminders failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: Request) { return GET(req); }
