// lib/agreements-v2/board.ts
//
// Agreements (Beta), Phase 3 status board: one pipeline across new-partner and
// renewal agreements. Read-only.

import type { getSql } from '@/lib/db';
import type { Agreement, AgreementAuditEntry } from '@/lib/agreements';

type Sql = ReturnType<typeof getSql>;

export type BoardStage = 'draft' | 'sent' | 'opened' | 'signed';
export type ScheduleState = 'none' | 'draft' | 'active' | 'ended';

export type BoardItem = {
  id: string;
  kind: 'new' | 'renewal';
  company_name: string | null;
  email: string | null;
  stage: BoardStage;
  rate_cents: number | null;
  total_cents: number | null;
  last_activity_at: string | null;
  signed_at: string | null;
  /** Id used for resend: the prior agreement for renewals, the agreement itself otherwise. */
  resend_id: string;
  schedule_state: ScheduleState | null;
  schedule_id: string | null;
  timeline: { count: number; amount_cents: number; start: string | null } | null;
};

type Row = Agreement & {
  sched_id: string | null;
  sched_status: string | null;
  sched_amount: number | null;
  sched_max: number | null;
  sched_start: string | Date | null;
};

const has = (log: AgreementAuditEntry[] | null | undefined, ...names: string[]) =>
  (Array.isArray(log) ? log : []).filter((e) => names.includes(e.event));

export async function listBoard(sql: Sql): Promise<BoardItem[]> {
  const rows = await sql`
    SELECT ag.*, s.id AS sched_id, s.status AS sched_status, s.amount_cents AS sched_amount,
           s.max_occurrences AS sched_max, s.start_date AS sched_start
      FROM agreements ag
      LEFT JOIN LATERAL (
        SELECT id, status, amount_cents, max_occurrences, start_date
          FROM recurring_invoice_schedules WHERE agreement_id = ag.id ORDER BY created_at DESC LIMIT 1
      ) s ON true
     WHERE COALESCE(ag.is_uploaded, false) = false
       AND (
         (ag.signed_at IS NULL AND ag.status IN ('draft', 'proposal_sent', 'proposal_approved', 'sent')
            AND (COALESCE(ag.is_renewal, false) = false OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(ag.audit_log, '[]'::jsonb)) e WHERE e->>'event' IN ('renewal_v2_sent','renewal_v2_opened'))))
         OR ag.signed_at >= NOW() - INTERVAL '90 days'
       )
     ORDER BY COALESCE(ag.signed_at, ag.updated_at, ag.created_at) DESC
     LIMIT 300
  ` as unknown as Row[];

  return rows.map((r): BoardItem => {
    const renewal = Boolean(r.is_renewal);
    const sentEv = has(r.audit_log, 'newpartner_v2_sent', 'renewal_v2_sent');
    const openedEv = has(r.audit_log, 'newpartner_v2_opened', 'renewal_v2_opened');
    let stage: BoardStage = 'draft';
    if (r.signed_at) stage = 'signed';
    else if (openedEv.length) stage = 'opened';
    else if (sentEv.length || r.status !== 'draft') stage = 'sent';
    const last = [...sentEv, ...openedEv].map((e) => e.timestamp).sort().pop() ?? null;
    let schedule_state: ScheduleState | null = null;
    if (stage === 'signed') {
      schedule_state = !r.sched_id ? 'none' : r.sched_status === 'paused' ? 'draft' : r.sched_status === 'ended' ? 'ended' : 'active';
    }
    const rate = r.ad_rate_cents;
    return {
      id: r.id,
      kind: renewal ? 'renewal' : 'new',
      company_name: r.company_name,
      email: r.advertiser_email || r.billing_email,
      stage,
      rate_cents: rate,
      total_cents: r.amount_cents ?? null,
      last_activity_at: last,
      signed_at: r.signed_at ? new Date(r.signed_at).toISOString() : null,
      resend_id: renewal && r.renewed_from_id ? r.renewed_from_id : r.id,
      schedule_state,
      schedule_id: r.sched_id,
      timeline: r.sched_id && r.sched_amount != null && r.sched_max != null
        ? { count: r.sched_max, amount_cents: r.sched_amount, start: r.sched_start ? (r.sched_start instanceof Date ? r.sched_start.toISOString() : String(r.sched_start)).slice(0, 10) : null }
        : null,
    };
  });
}
