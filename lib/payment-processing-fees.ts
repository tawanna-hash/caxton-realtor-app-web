export type InvoicePaymentMethod = 'card' | 'ach' | 'bnpl';

export const INVOICE_PAYMENT_METHODS: Array<{
  value: InvoicePaymentMethod;
  label: string;
  shortLabel: string;
  feeLabel: string;
}> = [
  {
    value: 'card',
    label: 'Credit or debit card',
    shortLabel: 'Card',
    feeLabel: '2.9% + $0.30',
  },
  {
    value: 'ach',
    label: 'ACH bank payment',
    shortLabel: 'ACH',
    feeLabel: '0.8%, capped at $5.00',
  },
  {
    value: 'bnpl',
    label: 'Buy now, pay later',
    shortLabel: 'Buy now, pay later',
    feeLabel: '5.99% + $0.30',
  },
];

export function isInvoicePaymentMethod(value: unknown): value is InvoicePaymentMethod {
  return value === 'card' || value === 'ach' || value === 'bnpl';
}

export function processingFeeCents(
  amountCents: number,
  method: InvoicePaymentMethod,
): number {
  const amount = Math.max(0, Math.round(amountCents));
  if (method === 'ach') return Math.min(Math.round(amount * 0.008), 500);
  if (method === 'bnpl') return Math.round(amount * 0.0599) + 30;
  return Math.round(amount * 0.029) + 30;
}

export function paymentMethodLabel(method: InvoicePaymentMethod): string {
  return INVOICE_PAYMENT_METHODS.find((option) => option.value === method)?.label
    ?? 'Electronic payment';
}
