// lib/agreements-v2/builder-doc.ts
//
// Agreements (Beta) single-page builder: the document the page edits, plus the
// pure helpers for prices, dates and the payload sent to the existing quote
// endpoint. No server imports so the page and the tests can both use it.

import { DEFAULT_PAYMENT, type PaymentSettings, type ServiceBilling } from '@/lib/agreements-v2/service-billing';

export type Pub = 'austin' | 'san_antonio' | 'both';

export type ServiceLine = {
  id: string;
  channel: 'print' | 'email' | 'app';
  package_id: string;
  size?: string;
  months?: number;
  sends?: number;
  app_weeks?: number;
  app_markets?: 1 | 2 | 3 | 4;
  publication: Pub;
  /** What the partner pays for this service, in cents. Pre-filled from the catalog, editable. */
  price_cents: number;
  name: string;
  description: string;
  /** How this service is invoiced. Missing means the account default (monthly, automatic). */
  billing?: ServiceBilling;
  /** Which package (option) this service belongs to, 0-based. Missing means the first. */
  option?: number;
  /** Price before a discount. When set, price_cents is the discounted price the client pays. */
  list_cents?: number;
  discount?: { type: 'pct' | 'amount'; value: number };
  /** The client may decline this service when approving. */
  optional?: boolean;
};

export type BuilderDoc = {
  name: string;
  advertiser_id: number | null;
  new_client: { name: string; email: string; contact: string } | null;
  effective: 'acceptance' | 'date';
  effective_date: string;
  intro: string;
  expires: boolean;
  expires_days: number;
  services: ServiceLine[];
  ask_address: boolean;
  note: string;
  refs: Array<{ name: string; value: string; client_facing: boolean }>;
  payment: PaymentSettings;
  /** Package names. More than one means the client picks one package. */
  options: string[];
};

export type Catalog = {
  print: Array<{ id: string; name: string; sizes: Array<{ size: string; price: number }> }>;
  email: Array<{ id: string; name: string; sends: number; price: Record<Pub, number> }>;
  app: Array<{ slug: string; name: string; weekly: Record<1 | 2 | 3 | 4, number> }>;
};

export const EMPTY_DOC: BuilderDoc = {
  name: '',
  advertiser_id: null,
  new_client: null,
  effective: 'acceptance',
  effective_date: '',
  intro: '',
  expires: false,
  expires_days: 30,
  services: [],
  ask_address: false,
  note: '',
  refs: [],
  payment: DEFAULT_PAYMENT,
  options: ['Option 1'],
};

/** Catalog price for a service as configured, in cents. */
export function defaultPriceCents(l: Pick<ServiceLine, 'channel' | 'package_id' | 'size' | 'months' | 'sends' | 'app_weeks' | 'app_markets' | 'publication'>, catalog: Catalog): number {
  if (l.channel === 'print') {
    const pkg = catalog.print.find((p) => p.id === l.package_id);
    const row = pkg?.sizes.find((s) => s.size === (l.size ?? pkg.sizes[0]?.size));
    return Math.round((row?.price ?? 0) * 100 * Math.max(1, l.months ?? 1));
  }
  if (l.channel === 'email') {
    const eb = catalog.email.find((e) => e.id === l.package_id);
    return Math.round((eb?.price[l.publication] ?? 0) * 100 * Math.max(1, l.sends ?? 1));
  }
  const slot = catalog.app.find((s) => s.slug === l.package_id);
  return Math.round((slot?.weekly[l.app_markets ?? 1] ?? 0) * 100 * Math.max(1, l.app_weeks ?? 1));
}

export const optionOf = (s: Pick<ServiceLine, 'option'>, count: number): number => Math.min(Math.max(0, s.option ?? 0), Math.max(0, count - 1));

/** Price after a discount, in cents. Never below zero. */
export function discountedCents(list: number, d: { type: 'pct' | 'amount'; value: number } | undefined): number {
  if (!d || !(d.value > 0)) return Math.max(0, Math.round(list));
  const off = d.type === 'pct' ? Math.round(list * Math.min(100, d.value) / 100) : Math.round(d.value * 100);
  return Math.max(0, Math.round(list) - off);
}

export function docTotalCents(doc: Pick<BuilderDoc, 'services'> & { options?: string[] }, option?: number): number {
  const count = doc.options?.length ?? 1;
  return doc.services.filter((s) => option === undefined || optionOf(s, count) === option).reduce((n, s) => n + Math.max(0, Math.round(s.price_cents || 0)), 0);
}

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Start and end of the whole agreement: print runs whole months, app runs whole weeks, e-Blasts are one day. */
export function docDates(doc: Pick<BuilderDoc, 'effective' | 'effective_date' | 'services'>, todayIso: string): { start: string; end: string } {
  const start = doc.effective === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(doc.effective_date) ? doc.effective_date : todayIso;
  let end = start;
  const y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  for (const s of doc.services) {
    let e = start;
    if (s.channel === 'print') e = new Date(Date.UTC(y, m - 1 + Math.max(1, s.months ?? 1), 0)).toISOString().slice(0, 10);
    else if (s.channel === 'app') e = addDaysIso(start, Math.max(1, s.app_weeks ?? 1) * 7 - 1);
    if (e > end) end = e;
  }
  return { start, end };
}

/** Problems that stop the agreement from being sent. Empty means ready. */
export function docProblems(doc: BuilderDoc): string[] {
  const out: string[] = [];
  if (!doc.advertiser_id && !(doc.new_client && doc.new_client.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.new_client.email))) out.push('Choose a client, or add a new one with a name and email.');
  if (doc.services.length === 0) out.push('Add at least one service.');
  if (doc.services.some((s) => !(s.price_cents > 0))) out.push('Every service needs a price above $0.');
  if (doc.effective === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(doc.effective_date)) out.push('Choose the effective date.');
  const optCount = doc.options?.length ?? 1;
  for (let o = 0; o < optCount; o++) {
    if (optCount > 1 && !doc.services.some((s) => optionOf(s, optCount) === o)) out.push(`${doc.options[o] || `Option ${o + 1}`} has no services. Add one or remove the package.`);
    if (optCount > 1 && doc.services.filter((s) => optionOf(s, optCount) === o).every((s) => s.optional)) out.push(`${doc.options[o] || `Option ${o + 1}`} needs at least one required service.`);
  }
  if (optCount === 1 && doc.services.length > 0 && doc.services.every((s) => s.optional)) out.push('At least one service must be required.');
  const pay = doc.payment ?? DEFAULT_PAYMENT;
  if (!pay.card && !pay.check && !pay.bank_now && !pay.bank_invoice) out.push('Allow at least one payment method.');
  if (!pay.card && !pay.bank_now && !pay.bank_invoice && doc.services.some((s) => s.channel !== 'print')) out.push('Check payments are only available for print agreements. Allow credit card or bank payment.');
  if (doc.services.some((s) => s.billing?.start === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s.billing.start_date))) out.push('Choose the billing start date for each service that bills on a specific date.');
  return out;
}

/** Services in line order: package by package. Line numbers on the saved agreement follow this order. */
export function orderedServices(doc: Pick<BuilderDoc, 'services'> & { options?: string[] }): ServiceLine[] {
  const count = doc.options?.length ?? 1;
  return doc.services.map((s, i) => ({ s, i })).sort((a, b) => optionOf(a.s, count) - optionOf(b.s, count) || a.i - b.i).map((x) => x.s);
}

/** Package definitions for the saved agreement: which line numbers belong to each. */
export function optionDefs(doc: Pick<BuilderDoc, 'services'> & { options?: string[] }): Array<{ name: string; line_nos: number[] }> {
  const names = doc.options?.length ? doc.options : ['Option 1'];
  const ordered = orderedServices(doc);
  return names.map((name, o) => ({ name: name.trim() || `Option ${o + 1}`, line_nos: ordered.map((s, i) => (optionOf(s, names.length) === o ? i + 1 : 0)).filter(Boolean) }));
}

/** Body for POST /api/admin/quotes (bundled quote with explicit prices). */
export function quotePayload(doc: BuilderDoc, publication: Pub) {
  return {
    advertiser: doc.advertiser_id
      ? { id: doc.advertiser_id }
      : { name: doc.new_client!.name.trim(), contact_email: doc.new_client!.email.trim(), billing_email: doc.new_client!.email.trim(), publication: publication === 'both' ? 'austin' : publication },
    rep_name: doc.new_client?.contact?.trim() || undefined,
    memo: doc.name.trim() || undefined,
    line_items: orderedServices(doc).map((s) => ({
      channel: s.channel,
      package_id: s.package_id,
      ...(s.channel === 'print' ? { size: s.size, months: Math.max(1, s.months ?? 1) } : {}),
      ...(s.channel === 'email' ? { sends: Math.max(1, s.sends ?? 1) } : {}),
      ...(s.channel === 'app' ? { app_cadence: 'weekly' as const, app_weeks: Math.max(1, s.app_weeks ?? 1), app_markets: s.app_markets ?? 1 } : {}),
      publication: s.publication,
      ...(doc.effective === 'date' && doc.effective_date ? { start_date: doc.effective_date } : {}),
      override_total_cents: Math.max(0, Math.round(s.price_cents)),
    })),
  };
}
