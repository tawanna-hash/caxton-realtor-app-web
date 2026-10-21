// lib/agreements-v2/service-billing.ts
//
// Agreements (Beta): per-service billing options (Anchor's "Billed monthly,
// automatically" row) and agreement-level payment settings. Pure: used by the
// builder timeline, the partner page timeline and the signing draft schedules.

export type ServiceBilling = {
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time' | 'stages';
  /** Invoice at the start of the billing cycle (the billing day) or one cycle later. */
  timing: 'start' | 'end';
  /** Day of the month, 1 to 28. null uses the account default. */
  day: number | null;
  /** next = next scheduled billing day, date = exact first invoice date, manual = nothing is billed until someone starts it. */
  start: 'next' | 'date' | 'manual';
  start_date: string;
  /** Number of monthly invoices when billed monthly. Filled from the service when the agreement is sent. */
  term_months?: number;
  /** One time or first stage: invoice when the agreement is accepted. */
  on_acceptance?: boolean;
  /** Weekly billing: 1 = Monday ... 7 = Sunday. */
  weekday?: number;
  /** Hourly services: rate per hour and the hours pre-approved for each billing period. Billed manually from logged hours. */
  hourly?: { rate_cents: number; cap_hours: number };
  /** Billed in stages: share of the price and what starts each invoice. */
  stages?: Array<{ pct: number; trigger: 'acceptance' | 'manual' }>;
};

export const DEFAULT_BILLING: ServiceBilling = { cadence: 'monthly', timing: 'start', day: null, start: 'next', start_date: '' };

/** Largest annual price increase an agreement can carry. */
export const MAX_ANNUAL_INCREASE_PCT = 2;

export type PaymentSettings = {
  /** Percent added to each service's monthly amount every contract year after the first (0 to 2). */
  annual_increase_pct: number;
  card: boolean;
  check: boolean;
  /** Bank (ACH) debit at signing. The partner pays the ACH fee. */
  bank_now: boolean;
  /** Invoiced, with a bank (ACH) pay link on each invoice. */
  bank_invoice: boolean;
  /** Days from invoice to due date. null uses the account default. */
  due_days: number | null;
  /** Show the billing schedule to the client on the review and payment steps. */
  show_schedule: boolean;
  /** How the partner sees automatic billing: dated invoices, or grouped by billing occurrence. */
  schedule_view: 'timeline' | 'occurrence';
};

export const DEFAULT_PAYMENT: PaymentSettings = { annual_increase_pct: 0, card: true, check: true, bank_now: true, bank_invoice: true, due_days: null, show_schedule: true, schedule_view: 'timeline' };

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
    cadence: x.cadence === 'one_time' || x.cadence === 'weekly' || x.cadence === 'quarterly' || x.cadence === 'yearly' || x.cadence === 'stages' ? x.cadence : 'monthly',
    timing: x.timing === 'end' ? 'end' : 'start',
    day,
    start: x.start === 'date' || x.start === 'manual' ? x.start : 'next',
    start_date: typeof x.start_date === 'string' && ISO.test(x.start_date) ? x.start_date : '',
    ...(typeof x.term_months === 'number' && x.term_months >= 1 ? { term_months: Math.min(60, Math.round(x.term_months)) } : {}),
    ...(x.on_acceptance ? { on_acceptance: true } : {}),
    ...(typeof x.weekday === 'number' && x.weekday >= 1 && x.weekday <= 7 ? { weekday: Math.round(x.weekday) } : {}),
    ...(x.hourly && x.hourly.rate_cents > 0 ? { hourly: { rate_cents: Math.round(x.hourly.rate_cents), cap_hours: Math.max(0, Number(x.hourly.cap_hours) || 0) } } : {}),
    ...(x.cadence === 'stages' ? { stages: (Array.isArray(x.stages) && x.stages.length ? x.stages : [{ pct: 50, trigger: 'acceptance' as const }, { pct: 50, trigger: 'manual' as const }]).map((g) => ({ pct: Math.max(0, Number(g.pct) || 0), trigger: g.trigger === 'acceptance' ? 'acceptance' as const : 'manual' as const })) } : {}),
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
  /** Amount of each invoice when it changes over the term (annual increase). Same length as dates. */
  amounts?: number[];
};

/** One service's billing plan. `start` is the agreement's effective date (YYYY-MM-DD). */
export function planServiceBilling(
  svc: { label: string; total_cents: number; billing: ServiceBilling },
  ctx: { start: string; billing_day: number; increase_pct?: number },
): ServicePlan {
  const b = cleanBilling(svc.billing);
  const total = Math.max(0, Math.round(svc.total_cents));
  if (b.start === 'manual') {
    return { label: svc.label, total_cents: total, amount_cents: total, occurrences: 0, manual: true, one_time: b.cadence === 'one_time', first_run_date: null, day_of_month: b.day ?? ctx.billing_day, dates: [] };
  }
  if (b.cadence === 'stages' && b.stages?.length) {
    const auto = b.stages.map((g) => ({ g, cents: Math.round(total * g.pct / 100) })).filter((x) => x.g.trigger === 'acceptance');
    const first0 = ctx.start;
    return { label: svc.label, total_cents: total, amount_cents: auto[0]?.cents ?? 0, occurrences: auto.length, manual: auto.length === 0, one_time: true, first_run_date: auto.length ? first0 : null, day_of_month: b.day ?? ctx.billing_day, dates: auto.map(() => first0), amounts: auto.map((x) => x.cents) };
  }
  const oneTime = b.cadence === 'one_time';
  if (!oneTime && (b.cadence === 'weekly' || b.cadence === 'quarterly' || b.cadence === 'yearly')) {
    const term = Math.max(1, b.term_months ?? 1);
    const step = b.cadence === 'weekly' ? 0 : b.cadence === 'quarterly' ? 3 : 12;
    const n = b.cadence === 'weekly' ? Math.max(1, Math.round(term * 52 / 12)) : Math.max(1, Math.ceil(term / step));
    let first0 = b.start === 'date' && b.start_date ? b.start_date : ctx.start;
    if (b.cadence === 'weekly' && b.weekday && !(b.start === 'date' && b.start_date)) {
      const d = new Date(`${first0}T00:00:00Z`);
      const want = b.weekday % 7;
      d.setUTCDate(d.getUTCDate() + ((want - d.getUTCDay() + 7) % 7));
      first0 = d.toISOString().slice(0, 10);
    }
    const dts = Array.from({ length: n }, (_, i) => (b.cadence === 'weekly' ? addDaysIso(first0, 7 * i) : addMonthsIso(first0, step * i)));
    return { label: svc.label, total_cents: total, amount_cents: total, occurrences: n, manual: false, one_time: false, first_run_date: first0, day_of_month: Math.min(28, Number(first0.slice(8, 10)) || day0(b, ctx)), dates: dts };
  }
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
  if (b.on_acceptance && b.start !== 'date') { first = ctx.start; dom = Math.min(28, Number(first.slice(8, 10)) || day); }
  const dates = Array.from({ length: occurrences }, (_, i) => addMonthsIso(first, i));
  const base = Math.round(total / occurrences);
  const pct = Math.min(MAX_ANNUAL_INCREASE_PCT, Math.max(0, Number(ctx.increase_pct) || 0));
  const amounts = !oneTime && pct > 0 && occurrences > 12 ? dates.map((_, i) => Math.round(base * Math.pow(1 + pct / 100, Math.floor(i / 12)))) : undefined;
  return { label: svc.label, total_cents: total, amount_cents: base, occurrences, manual: false, one_time: oneTime, first_run_date: first, day_of_month: dom, dates, ...(amounts ? { amounts } : {}) };
}

function day0(b: ServiceBilling, ctx: { billing_day: number }): number { return b.day ?? ctx.billing_day; }

export type InvoiceRow = { date: string; due: string; total: number; items: Array<{ label: string; cents: number }> };

/** Invoices across every service, grouped by issue date. */
export function invoiceRows(plans: ServicePlan[], dueDays: number): InvoiceRow[] {
  const by = new Map<string, InvoiceRow>();
  for (const p of plans) {
    if (p.manual) continue;
    for (const [i, date] of p.dates.entries()) {
      const cents = p.amounts?.[i] ?? p.amount_cents;
      const row = by.get(date) ?? { date, due: addDaysIso(date, dueDays), total: 0, items: [] };
      row.items.push({ label: p.label, cents });
      row.total += cents;
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
    total_cents: plans.filter((p) => !p.manual).reduce((n, p) => n + (p.amounts ? p.amounts.reduce((a, b) => a + b, 0) : p.amount_cents * p.occurrences), 0),
    manual_labels: plans.filter((p) => p.manual).map((p) => p.label),
  };
}

export function cleanPayment(p: Partial<PaymentSettings> | null | undefined): PaymentSettings {
  const x = p ?? {};
  const due = typeof x.due_days === 'number' && x.due_days >= 0 && x.due_days <= 120 ? Math.round(x.due_days) : null;
  const inc = Math.round(Math.min(MAX_ANNUAL_INCREASE_PCT, Math.max(0, Number(x.annual_increase_pct) || 0)) * 100) / 100;
  return { annual_increase_pct: inc, card: x.card !== false, check: x.check !== false, bank_now: x.bank_now === true, bank_invoice: x.bank_invoice === true, due_days: due, show_schedule: x.show_schedule !== false, schedule_view: x.schedule_view === 'occurrence' ? 'occurrence' : 'timeline' };
}

export function billingBadge(b: ServiceBilling): string {
  const word = b.cadence === 'one_time' ? 'one time' : b.cadence === 'stages' ? `in ${b.stages?.length ?? 2} stages` : b.cadence;
  if (b.hourly) return `${word === 'one time' ? 'Hourly' : `Billed ${word}`}${b.start === 'manual' ? ', manually' : ''}`;
  if (b.start === 'manual') return b.cadence === 'monthly' ? 'Billed manually' : `Billed ${word}, manually`;
  return `Billed ${word}, automatically`;
}

/** Plans for a saved agreement: its line items matched to the per-service billing saved with it. Null when no service has billing options. */
export function plansForLines(
  lines: Array<{ line_no: number; package_label: string; amount_cents: number }>,
  metaServices: Array<{ line_no: number; name?: string; billing?: ServiceBilling }>,
  ctx: { start: string; billing_day: number; increase_pct?: number },
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
