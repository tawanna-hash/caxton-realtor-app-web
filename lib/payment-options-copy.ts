import { INVOICE_PAYMENT_METHODS } from '@/lib/payment-processing-fees';

/** One line per way to pay, shown on invoices, statements and their emails. */
export const WAYS_TO_PAY_TITLE = 'Ways to pay';

export function waysToPayLines(): string[] {
  return [
    ...INVOICE_PAYMENT_METHODS.map((o) => `${o.label} (processing fee: ${o.feeLabel})`),
    'ACH debit from a bank account on file (processing fee: 1%, capped at $5.00)',
    'Check payable to Caxton Publications, Inc., PO Box 81366, Austin, TX 78708-1366',
  ];
}

export function waysToPayHtml(): string {
  return `<div style="margin:22px 0 0;padding:14px 16px;background:#f5f5f5;border-radius:6px;font-size:13px;line-height:1.6"><strong>${WAYS_TO_PAY_TITLE}</strong><ul style="margin:6px 0 0;padding-left:18px">${waysToPayLines().map((l) => `<li>${l.replaceAll('&', '&amp;')}</li>`).join('')}</ul></div>`;
}

export function waysToPayText(): string {
  return `${WAYS_TO_PAY_TITLE}:\n${waysToPayLines().map((l) => `- ${l}`).join('\n')}`;
}
