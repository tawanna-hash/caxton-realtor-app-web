// lib/agreements-v2/timeline.ts
//
// Agreements (Beta): the billing timeline shown before an agreement is sent
// and on the partner's Review step (Anchor's "Billing timeline"). Pure: it
// reads the agreement and the saved defaults, never writes anything.

import type { Agreement } from '@/lib/agreements';
import { planDraftSchedule } from '@/lib/agreements-v2/recurring-draft';
import type { AgreementDefaults } from '@/lib/agreements-v2/settings';
import { freqMonths } from '@/lib/renewals-v2/pricing';
import type { getSql } from '@/lib/db';
import { getDefaults } from '@/lib/agreements-v2/settings';
import { allowsCheckPayment } from '@/lib/ad-channels';
import { channelOfRow, chargeBaseCents } from '@/lib/new-partner-v2/service';
import { withSurcharge } from '@/lib/payment-processing-fees';

export type TimelineEntry = {
  /** YYYY-MM-DD, or null for "on signing / today". */
  date: string | null;
  label: string;
  amount_cents: number | null;
  note?: string;
};

export type Timeline = { ok: true; entries: TimelineEntry[]; hidden: number } | { ok: false; reason: string };

type TlAgreement = Parameters<typeof planDraftSchedule>[0];
const MAX_SHOWN = 12;

const addMonths = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};
const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Pay by check: an invoice on the billing day each month, due after the default due days. */
export function checkTimeline(ag: TlAgreement, defaults: Pick<AgreementDefaults, 'billing_day' | 'due_days'>): Timeline {
  const planned = planDraftSchedule(ag, defaults);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  const p = planned.plan;
  const entries: TimelineEntry[] = [{ date: null, label: 'Agreement signed', amount_cents: null }];
  for (let i = 0; i < p.occurrences; i++) {
    const issued = addMonths(p.first_run_date, i);
    entries.push({ date: issued, label: `Invoice ${i + 1} of ${p.occurrences} issued`, amount_cents: p.amount_cents });
    entries.push({ date: addDays(issued, p.due_days), label: `Invoice ${i + 1} due`, amount_cents: p.amount_cents, note: `${p.due_days} days after it is issued` });
  }
  const hidden = Math.max(0, entries.length - 1 - MAX_SHOWN * 2);
  return { ok: true, entries: hidden ? entries.slice(0, 1 + MAX_SHOWN * 2) : entries, hidden: hidden / 2 };
}

/** Pay by card: charge now, then the saved card is used for each following issue. */
export function cardTimeline(
  ag: Pick<Agreement, 'ad_rate_cents' | 'frequency' | 'start_date'> & { type?: string | null },
  chargeNowCents: number | null,
  surchargedCents: number | null,
): Timeline {
  if (chargeNowCents == null || surchargedCents == null) return { ok: false, reason: 'no amount to charge' };
  const entries: TimelineEntry[] = [
    { date: null, label: 'Charged today', amount_cents: surchargedCents, note: 'includes the 3% card surcharge' },
  ];
  const start = ag.start_date ? new Date(ag.start_date as unknown as string).toISOString().slice(0, 10) : null;
  const months = ag.ad_rate_cents ? freqMonths(ag.frequency) : 1;
  if (start && months > 1) {
    for (let i = 1; i < Math.min(months, MAX_SHOWN + 1); i++) {
      entries.push({ date: addMonths(start, i), label: `Issue ${i + 1} of ${months}`, amount_cents: null, note: 'saved card is charged' });
    }
  }
  return { ok: true, entries, hidden: Math.max(0, months - 1 - MAX_SHOWN) };
}

/** Load an agreement and build both timelines (admin preview before sending). */
export async function timelinesForAgreement(sql: ReturnType<typeof getSql>, id: string) {
  const rows = await sql`
    SELECT ag.*,
      (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS lines_total,
      (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id AND li.pay_now = true) AS pay_now_total
      FROM agreements ag WHERE ag.id = ${id}
  ` as unknown as Array<Agreement & { lines_total?: number; pay_now_total?: number }>;
  const ag = rows[0];
  if (!ag) return null;
  const base = chargeBaseCents(ag);
  const surcharged = base ? withSurcharge(base) : null;
  const tlAgreement = { ...ag, amount_cents: (ag.lines_total ?? 0) > 0 ? ag.lines_total : ag.amount_cents } as Agreement;
  const defaults = await getDefaults(sql);
  return {
    company: ag.company_name,
    check: allowsCheckPayment(channelOfRow(ag)) ? checkTimeline(tlAgreement, defaults) : null,
    card: cardTimeline(ag, base, surcharged),
  };
}
