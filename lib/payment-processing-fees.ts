export type InvoicePaymentMethod = 'card' | 'ach' | 'bnpl';

/** Editable in Get Paid > Payment settings. Percentages are plain numbers (3 = 3%). */
export type FeeConfig = {
  card: { percent: number };
  ach: { percent: number; cap_cents: number };
  bnpl: { percent: number; fixed_cents: number };
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  card: { percent: 3 },
  ach: { percent: 1, cap_cents: 500 },
  bnpl: { percent: 5.99, fixed_cents: 30 },
};

// Server entry points load the saved config before computing fees; the portal
// page passes it to the client component. Until then the defaults apply.
let current: FeeConfig = DEFAULT_FEE_CONFIG;

export function setFeeConfig(cfg: FeeConfig): void {
  current = cfg;
}

export function getFeeConfig(): FeeConfig {
  return current;
}

function pct(n: number): string {
  return `${Number(n.toFixed(4))}%`;
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function feeLabelFor(method: InvoicePaymentMethod, cfg: FeeConfig = current): string {
  if (method === 'ach') return `${pct(cfg.ach.percent)}, capped at ${usd(cfg.ach.cap_cents)}`;
  if (method === 'bnpl') return cfg.bnpl.fixed_cents > 0 ? `${pct(cfg.bnpl.percent)} + ${usd(cfg.bnpl.fixed_cents)}` : pct(cfg.bnpl.percent);
  return pct(cfg.card.percent);
}

export const INVOICE_PAYMENT_METHODS: Array<{
  value: InvoicePaymentMethod;
  label: string;
  shortLabel: string;
  readonly feeLabel: string;
}> = [
  {
    value: 'card',
    label: 'Credit or debit card',
    shortLabel: 'Card',
    get feeLabel() { return feeLabelFor('card'); },
  },
  {
    value: 'ach',
    label: 'ACH bank payment',
    shortLabel: 'ACH',
    get feeLabel() { return feeLabelFor('ach'); },
  },
  {
    value: 'bnpl',
    label: 'Buy now, pay later',
    shortLabel: 'Buy now, pay later',
    get feeLabel() { return feeLabelFor('bnpl'); },
  },
];

export function isInvoicePaymentMethod(value: unknown): value is InvoicePaymentMethod {
  return value === 'card' || value === 'ach' || value === 'bnpl';
}

export function processingFeeCents(
  amountCents: number,
  method: InvoicePaymentMethod,
  cfg: FeeConfig = current,
): number {
  const amount = Math.max(0, Math.round(amountCents));
  if (method === 'ach') return Math.min(Math.round((amount * cfg.ach.percent) / 100), cfg.ach.cap_cents);
  if (method === 'bnpl') return Math.round((amount * cfg.bnpl.percent) / 100) + cfg.bnpl.fixed_cents;
  return Math.round((amount * cfg.card.percent) / 100);
}

export function paymentMethodLabel(method: InvoicePaymentMethod): string {
  return INVOICE_PAYMENT_METHODS.find((option) => option.value === method)?.label
    ?? 'Electronic payment';
}
