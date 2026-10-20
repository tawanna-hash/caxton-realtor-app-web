// lib/agreements-v2/service-billing.ts
//
// Agreements (Beta): per-service billing options (Anchor's "Billed monthly,
// automatically" row) and agreement-level payment settings. Pure: used by the
// builder timeline, the partner page timeline and the signing draft schedules.

export type ServiceBilling = {
  cadence: 'monthly' | 'one_time';
  /** Invoice at the start of the billing cycle (the billing day) or one cycle later. */
  timing: 'start' | 'end';
  /** Day of the month, 1 to 28. null uses the account default. */
  day: number | null;
  /** next = next scheduled billing day, date = exact first invoice date, manual = nothing is billed until someone starts it. */
  start: 'next' | 'date' | 'manual';
  start_date: string;
  /** Number of monthly invoices when billed monthly. Filled from the service when the agreement is sent. */
  term_months?: number;
};

export const DEFAULT_BILLING: ServiceBilling = { cadence: 'monthly', timing: 'start', day: null, start: 'next', start_date: '' };

export type PaymentSettings = {
  card: boolean;
  check: boolean;
  /** Days from invoice to due date. null uses the account default. */
  due_days: number | null;
  /** Show the billing schedule to the client on the review and payment steps. */
  show_schedule: boolean;
  /** How the partner sees automatic billing: dated invoices, or grouped by billing occurrence. */
  schedule_view: 'timeline' | 'occurrence';
};

export const DEFAULT_PAYMENT: PaymentSettings = { card: true, check: true, due_days: null, show_schedule: true, schedule_view: 'timeline' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function termMonths(s: { channel: 'print' | 'email' | 'app'; months?: number; app_weeks?: number }): number {
  if (s.channel === 'print') return Math.max(1, s.months ?? 1);
  if (s.channel === 'app') return Math.max(1, Math.ceil(Math.max(1, s.app_weeks ?? 1) / 4));
  return 1;
}

export function cleanBilling(b: Partial<ServiceBilling> | null | undefined): ServiceBilling {
  const x = b ?? {};
  const day = typeof x.day === 'number' && x.day >= 1 && x.day <= 28 ? Math.round(x.day) : null;
  return {
    cadence: x.cadence === 'one_time' ? 'one_time' : 'monthly',
    timing: x.timing === 'end' ? 'end' : 'start',
    day,
    start: x.start === 'date' || x.start === 'manual' ? x.start : 'next',
    start_date: typeof x.start_date === 'string' && ISO.test(x.start_date) ? x.start_date : '',
    ...(typeof x.term_months === 'number' && x.term_months >= 1 ? { term_months: Math.min(60, Math.round(x.term_months)) } : {}),
  };
}

export function addMonthsIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type ServicePlan = {
  label: string;
  total_cents: number;
  /** Amount of each invoice. */
  amount_cents: number;
  occurrences: number;
  manual: boolean;
  one_time: boolean;
  first_run_date: string | null;
  day_of_month: number;
  dates: string[];
};

/** One service's billing plan. `start` is the agreement's effective date (YYYY-MM-DD). */
export function planServiceBilling(
  svc: { label: string; total_cents: number; billing: ServiceBilling },
  ctx: { start: string; billing_day: number },
): ServicePlan {
  const b = cleanBilling(svc.billing);
  const total = Math.max(0, Math.round(svc.total_cents));
  if (b.start === 'manual') {
    return { label: svc.label, total_cents: total, amount_cents: total, occurrences: 0, manual: true, one_time: b.cadence === 'one_time', first_run_date: null, day_of_month: b.day ?? ctx.billing_day, dates: [] };
  }
  const oneTime = b.cadence === 'one_time';
  const occurrences = oneTime ? 1 : Math.max(1, b.term_months ?? 1);
  const day = b.day ?? ctx.billing_day;
  let first: string;
  let dom = day;
  if (b.start === 'date' && b.start_date) {
    first = b.start_date;
    dom = Math.min(28, Number(b.start_date.slice(8, 10)) || day);
  } else {
    const d = new Date(`${ctx.start}T00:00:00Z`);
    const cand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
    if (cand < d) cand.setUTCMonth(cand.getUTCMonth() + 1);
    first = cand.toISOString().slice(0, 10);
    if (b.timing === 'end') first = addMonthsIso(first, 1);
  }
  const dates = Array.from({ length: occurrences }, (_, i) => addMonthsIso(first, i));
  return { label: svc.label, total_cents: total, amount_cents: Math.round(total / occurrences), occurrences, manual: false, one_time: oneTime, first_run_date: first, day_of_month: dom, dates };
}

export type InvoiceRow = { date: string; due: string; total: number; items: Array<{ label: string; cents: number }> };

/** Invoices across every service, grouped by issue date. */
export function invoiceRows(plans: ServicePlan[], dueDays: number): InvoiceRow[] {
  const by = new Map<string, InvoiceRow>();
  for (const p of plans) {
    if (p.manual) continue;
    for (const date of p.dates) {
      const row = by.get(date) ?? { date, due: addDaysIso(date, dueDays), total: 0, items: [] };
      row.items.push({ label: p.label, cents: p.amount_cents });
      row.total += p.amount_cents;
      by.set(date, row);
    }
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type Summary = { first_invoice: { date: string; cents: number } | null; recurring_annual_cents: number; total_cents: number; manual_labels: string[] };

export function summarize(plans: ServicePlan[], rows: InvoiceRow[]): Summary {
  return {
    first_invoice: rows[0] ? { date: rows[0].date, cents: rows[0].total } : null,
    recurring_annual_cents: plans.filter((p) => !p.manual && !p.one_time && p.occurrences > 1).reduce((n, p) => n + p.amount_cents * 12, 0),
    total_cents: plans.filter((p) => !p.manual).reduce((n, p) => n + p.amount_cents * p.occurrences, 0),
    manual_labels: plans.filter((p) => p.manual).map((p) => p.label),
  };
}

export function cleanPayment(p: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const x = p ?? {};
  const due = typeof x.due_days === 'number' && x.due_days >= 0 && x.due_days <= 120 ? Math.round(x.due_days) : null;
  return { card: x.card !== false, check: x.check !== false, due_days: due, show_schedule: x.show_schedule !== false, schedule_view: x.schedule_view === 'occurrence' ? 'occurrence' : 'timeline' };
}

export function billingBadge(b: ServiceBilling): string {
  if (b.start === 'manual') return 'Billed manually';
  return b.cadence === 'one_time' ? 'Billed one time, automatically' : 'Billed monthly, automatically';
}

/** Plans for a saved agreement: its line items matched to the per-service billing saved with it. Null when no service has billing options. */
export function plansForLines(
  lines: Array<{ line_no: number; package_label: string; amount_cents: number }>,
  metaServices: Array<{ line_no: number; name?: string; billing?: ServiceBilling }>,
  ctx: { start: string; billing_day: number },
): ServicePlan[] | null {
  if (!metaServices.some((m) => m.billing)) return null;
  return lines.map((l) => {
    const m = metaServices.find((x) => x.line_no === l.line_no);
    return planServiceBilling({ label: m?.name || l.package_label, total_cents: l.amount_cents, billing: cleanBilling(m?.billing) }, ctx);
  });
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export type OccurrenceGroup = { title: string; total_cents: number; items: Array<{ label: string; cents: number }> };

/** Services grouped the way Anchor shows "By billing occurrence": same cadence and day billed together. */
export function occurrenceGroups(plans: ServicePlan[]): OccurrenceGroup[] {
  const by = new Map<string, OccurrenceGroup>();
  for (const p of plans) {
    const key = p.manual ? 'manual' : p.one_time || p.occurrences === 1 ? `once:${p.first_run_date}` : `monthly:${p.day_of_month}`;
    const title = p.manual ? 'Billed manually, when billing is started' : p.one_time || p.occurrences === 1 ? `Billed once on ${longDate(p.first_run_date as string)}` : `Billed monthly on the ${ordinal(p.day_of_month)}`;
    const g = by.get(key) ?? { title, total_cents: 0, items: [] };
    g.total_cents += p.manual ? 0 : p.amount_cents;
    g.items.push({ label: p.label, cents: p.manual ? p.total_cents : p.amount_cents });
    by.set(key, g);
  }
  return [...by.values()];
}
