// lib/agreements-v2/recurring-draft.ts
//
// Agreements (Beta), Phase 3. When an agreement is signed, create a DRAFT
// recurring-invoice schedule for it so billing can be reviewed before anything
// is sent. "Draft" is stored as status 'paused' (the daily recurring cron only
// runs 'active' schedules), auto_send false, source 'agreement'. Nothing is
// generated or emailed until someone activates the schedule in Get Paid.
//
// Additive: this only inserts into recurring_invoice_schedules. It does not
// modify the Get Paid recurring engine or its routes.

import type { getSql } from '@/lib/db';
import type { Agreement } from '@/lib/agreements';
import { freqMonths } from '@/lib/renewals-v2/pricing';
import { recordNewPartnerEvent } from '@/lib/new-partner-v2/service';

type Sql = ReturnType<typeof getSql>;

export type DraftSchedulePlan = {
  name: string;
  amount_cents: number;
  occurrences: number;
  start_date: string;
  end_date: string | null;
  day_of_month: number;
  bill_to_name: string | null;
  bill_to_email: string | null;
  description: string;
};

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

function monthsBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() >= a.getUTCDate() - 1 ? 1 : 0);
  return Math.max(1, m);
}

/** Pure: what monthly schedule a signed agreement implies, or why not. */
export function planDraftSchedule(
  ag: Pick<Agreement, 'company_name' | 'ad_rate_cents' | 'amount_cents' | 'frequency' | 'ad_size' | 'start_date' | 'end_date' | 'billing_email' | 'advertiser_email' | 'billing_name' | 'rep_name'>,
): { ok: true; plan: DraftSchedulePlan } | { ok: false; reason: string } {
  const start = iso(ag.start_date);
  if (!start) return { ok: false, reason: 'no start date' };
  const end = iso(ag.end_date);
  let monthly: number | null = null;
  let occurrences: number;
  if (ag.ad_rate_cents != null && ag.ad_rate_cents > 0) {
    monthly = ag.ad_rate_cents;
    occurrences = freqMonths(ag.frequency);
  } else if (ag.amount_cents != null && ag.amount_cents > 0 && end) {
    occurrences = monthsBetween(start, end);
    monthly = Math.round(ag.amount_cents / occurrences);
  } else {
    return { ok: false, reason: 'no monthly rate or total to bill' };
  }
  const company = ag.company_name ?? 'Partner';
  const startDay = Math.min(28, Math.max(1, parseInt(start.slice(8, 10), 10) || 1));
  return {
    ok: true,
    plan: {
      name: `${company} — monthly advertising`,
      amount_cents: monthly,
      occurrences,
      start_date: start,
      end_date: end,
      day_of_month: startDay,
      bill_to_name: ag.billing_name ?? company,
      bill_to_email: ag.billing_email || ag.advertiser_email || null,
      description: ag.ad_size ? `Advertising: ${ag.ad_size}` : 'Advertising',
    },
  };
}

export type DraftScheduleResult =
  | { ok: true; created: boolean; schedule_id: string }
  | { ok: false; reason: string };

/** Idempotent: one schedule per agreement. Never throws. */
export async function createDraftScheduleForAgreement(
  sql: Sql,
  agreementId: string,
  createdBy: string | null,
): Promise<DraftScheduleResult> {
  try {
    const rows = await sql`SELECT * FROM agreements WHERE id = ${agreementId}` as unknown as Agreement[];
    const ag = rows[0];
    if (!ag) return { ok: false, reason: 'agreement not found' };
    if (!ag.signed_at) return { ok: false, reason: 'agreement is not signed yet' };
    const advertiserId = typeof ag.advertiser_id === 'number' && ag.advertiser_id > 0 ? ag.advertiser_id : null;
    if (!advertiserId) return { ok: false, reason: 'agreement is not linked to a partner yet' };

    const existing = await sql`SELECT id FROM recurring_invoice_schedules WHERE agreement_id = ${agreementId} LIMIT 1` as unknown as Array<{ id: string }>;
    if (existing[0]) return { ok: true, created: false, schedule_id: existing[0].id };

    const planned = planDraftSchedule(ag);
    if (!planned.ok) return { ok: false, reason: planned.reason };
    const p = planned.plan;
    const lineItems = [{ description: p.description, qty: 1, unit_cents: p.amount_cents }];

    const ins = await sql`
      INSERT INTO recurring_invoice_schedules (
        advertiser_id, agreement_id, name, status, frequency, interval_count, day_of_month,
        amount_cents, tax_cents, line_items, memo,
        bill_to_name, bill_to_email,
        auto_send, due_days, create_days_in_advance, template_mode,
        start_date, end_date, max_occurrences, next_run_at, source, created_by
      ) VALUES (
        ${advertiserId}, ${agreementId}, ${p.name}, 'paused', 'monthly', 1, ${p.day_of_month},
        ${p.amount_cents}, 0, ${JSON.stringify(lineItems)}::jsonb,
        ${'Draft created automatically when the agreement was signed. Review, then activate.'},
        ${p.bill_to_name}, ${p.bill_to_email},
        false, 15, 0, 'scheduled',
        ${p.start_date}, ${p.end_date}, ${p.occurrences}, ${`${p.start_date}T08:00:00.000Z`}, 'agreement', ${createdBy ?? 'agreements-beta'}
      )
      RETURNING id
    ` as unknown as Array<{ id: string }>;
    await recordNewPartnerEvent(
      sql, agreementId, 'recurring_draft_created',
      `Draft recurring schedule created: ${p.occurrences} monthly invoices of $${(p.amount_cents / 100).toFixed(2)} starting ${p.start_date}. Status: paused until reviewed.`,
      createdBy,
    );
    return { ok: true, created: true, schedule_id: ins[0].id };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'failed' };
  }
}
