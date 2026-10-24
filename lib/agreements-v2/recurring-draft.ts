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
import { getDefaults, type AgreementDefaults } from '@/lib/agreements-v2/settings';
import { getAgreementMeta } from '@/lib/agreements-v2/builder';
import { cleanPayment, plansForLines } from '@/lib/agreements-v2/service-billing';

type Sql = ReturnType<typeof getSql>;

export type DraftSchedulePlan = {
  name: string;
  amount_cents: number;
  occurrences: number;
  start_date: string;
  first_run_date: string;
  end_date: string | null;
  day_of_month: number;
  due_days: number;
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
  ag: Pick<Agreement, 'company_name' | 'ad_rate_cents' | 'amount_cents' | 'frequency' | 'ad_size' | 'start_date' | 'end_date' | 'billing_email' | 'advertiser_email' | 'billing_name' | 'rep_name'> & { lines_total?: number },
  defaults?: Pick<AgreementDefaults, 'billing_day' | 'due_days'>,
): { ok: true; plan: DraftSchedulePlan } | { ok: false; reason: string } {
  const start = iso(ag.start_date);
  if (!start) return { ok: false, reason: 'no start date' };
  const end = iso(ag.end_date);
  let monthly: number | null = null;
  let occurrences: number;
  const bundleTotal = (ag.lines_total ?? 0) > 0 ? ag.lines_total ?? null : null;
  if (bundleTotal && end) {
    // Bundles bill their line-item total spread over the run, never the header's rack rate.
    occurrences = monthsBetween(start, end);
    monthly = Math.round(bundleTotal / occurrences);
  } else if (ag.ad_rate_cents != null && ag.ad_rate_cents > 0) {
    monthly = ag.ad_rate_cents;
    occurrences = freqMonths(ag.frequency);
  } else if (ag.amount_cents != null && ag.amount_cents > 0 && end) {
    occurrences = monthsBetween(start, end);
    monthly = Math.round(ag.amount_cents / occurrences);
  } else {
    return { ok: false, reason: 'no monthly rate or total to bill' };
  }
  const company = ag.company_name ?? 'Partner';
  const startDayForRun = typeof defaults?.billing_day === 'number' ? defaults.billing_day : null;
  let firstRun = start;
  if (startDayForRun) {
    const d = new Date(`${start}T00:00:00Z`);
    const cand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), startDayForRun));
    if (cand < d) cand.setUTCMonth(cand.getUTCMonth() + 1);
    firstRun = cand.toISOString().slice(0, 10);
  }
  const startDay = typeof defaults?.billing_day === 'number' ? defaults.billing_day : Math.min(28, Math.max(1, parseInt(start.slice(8, 10), 10) || 1));
  return {
    ok: true,
    plan: {
      name: `${company} — monthly advertising`,
      amount_cents: monthly,
      occurrences,
      start_date: start,
      first_run_date: firstRun,
      end_date: end,
      day_of_month: startDay,
      due_days: defaults?.due_days ?? 20,
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
    const rows = await sql`SELECT ag.*, (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS lines_total FROM agreements ag WHERE ag.id = ${agreementId}` as unknown as Array<Agreement & { lines_total?: number }>;
    const ag = rows[0];
    if (!ag) return { ok: false, reason: 'agreement not found' };
    if (!ag.signed_at) return { ok: false, reason: 'agreement is not signed yet' };
    const advertiserId = typeof ag.advertiser_id === 'number' && ag.advertiser_id > 0 ? ag.advertiser_id : null;
    if (!advertiserId) return { ok: false, reason: 'agreement is not linked to a partner yet' };

    if (ag.payment_mode === 'card') return { ok: false, reason: 'card on file is charged per issue, no invoice schedule needed' };

    const existing = await sql`SELECT id FROM recurring_invoice_schedules WHERE agreement_id = ${agreementId} LIMIT 1` as unknown as Array<{ id: string }>;
    if (existing[0]) return { ok: true, created: false, schedule_id: existing[0].id };

    const baseDefaults = await getDefaults(sql);
    const meta = await getAgreementMeta(agreementId, sql);
    const defaults = { ...baseDefaults, due_days: meta?.payment?.due_days ?? baseDefaults.due_days };

    // Per-service billing options saved with the agreement: one draft schedule per automatically billed service.
    const startIso = iso(ag.start_date);
    if (meta && startIso) {
      const lines = await sql`SELECT line_no, package_label, amount_cents FROM agreement_line_items WHERE agreement_id = ${agreementId} ORDER BY line_no` as unknown as Array<{ line_no: number; package_label: string; amount_cents: number }>;
      const plans = plansForLines(lines, meta.services, { start: startIso, billing_day: typeof defaults.billing_day === 'number' ? defaults.billing_day : Math.min(28, Math.max(1, parseInt(startIso.slice(8, 10), 10) || 1)), increase_pct: cleanPayment(meta.payment).annual_increase_pct });
      if (plans) {
        // A service with an annual increase becomes one schedule per contract year, since a schedule bills a fixed amount.
        const auto = plans.filter((p) => !p.manual).flatMap((p) => {
          if (!p.amounts) return [p];
          const years = Math.ceil(p.dates.length / 12);
          return Array.from({ length: years }, (_, k) => {
            const dates = p.dates.slice(k * 12, k * 12 + 12);
            return { ...p, label: `${p.label} (year ${k + 1})`, amount_cents: p.amounts![k * 12], occurrences: dates.length, first_run_date: dates[0], dates, amounts: undefined };
          });
        });
        let firstId: string | null = null;
        const company = ag.company_name ?? 'Partner';
        for (const p of auto) {
          const lineItems = [{ description: p.label, qty: 1, unit_cents: p.amount_cents }];
          const last = p.dates[p.dates.length - 1] ?? null;
          const ins = await sql`
            INSERT INTO recurring_invoice_schedules (
              advertiser_id, agreement_id, name, status, frequency, interval_count, day_of_month,
              amount_cents, tax_cents, line_items, memo, bill_to_name, bill_to_email,
              auto_send, due_days, create_days_in_advance, template_mode,
              start_date, end_date, max_occurrences, next_run_at, source, created_by
            ) VALUES (
              ${advertiserId}, ${agreementId}, ${`${company} — ${p.label}`}, 'paused', 'monthly', 1, ${p.day_of_month},
              ${p.amount_cents}, 0, ${JSON.stringify(lineItems)}::jsonb,
              ${'Draft created automatically when the agreement was signed. Review, then activate.'},
              ${ag.billing_name ?? company}, ${ag.billing_email || ag.advertiser_email || null},
              false, ${defaults.due_days ?? 15}, 0, 'scheduled',
              ${p.first_run_date}, ${last}, ${p.occurrences}, ${`${p.first_run_date}T08:00:00.000Z`}, 'agreement', ${createdBy ?? 'agreements-beta'}
            ) RETURNING id
          ` as unknown as Array<{ id: string }>;
          firstId = firstId ?? ins[0].id;
        }
        const manual = plans.filter((p) => p.manual).map((p) => p.label);
        await recordNewPartnerEvent(
          sql, agreementId, 'recurring_draft_created',
          `Draft billing created per service: ${auto.length} schedule${auto.length === 1 ? '' : 's'}${auto.length ? ` (${auto.map((p) => `${p.label}: ${p.occurrences} x $${(p.amount_cents / 100).toFixed(2)} from ${p.first_run_date}`).join('; ')})` : ''}.${manual.length ? ` Billed manually, nothing scheduled: ${manual.join(', ')}.` : ''} Status: paused until reviewed.`,
          createdBy,
        );
        if (!firstId) return { ok: false, reason: 'every service is billed manually, nothing was scheduled' };
        return { ok: true, created: true, schedule_id: firstId };
      }
    }

    const planned = planDraftSchedule(ag, defaults);
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
        false, ${p.due_days}, 0, 'scheduled',
        ${p.start_date}, ${p.end_date}, ${p.occurrences}, ${`${p.first_run_date}T08:00:00.000Z`}, 'agreement', ${createdBy ?? 'agreements-beta'}
      )
      RETURNING id
    ` as unknown as Array<{ id: string }>;
    await recordNewPartnerEvent(
      sql, agreementId, 'recurring_draft_created',
      `Draft recurring schedule created: ${p.occurrences} monthly invoices of $${(p.amount_cents / 100).toFixed(2)} starting ${p.first_run_date}. Status: paused until reviewed.`,
      createdBy,
    );
    return { ok: true, created: true, schedule_id: ins[0].id };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'failed' };
  }
}
