'use client';

// app/portal/invoices/[id]/InvoicePayClient.tsx
//
// Client-side invoice detail + payment UI. Offers an embedded Stripe
// Checkout form inline, with a "pay on Stripe's page" fallback link.

import { useState, useCallback } from 'react';
import Image from 'next/image';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  INVOICE_PAYMENT_METHODS,
  setFeeConfig,
  type FeeConfig,
  processingFeeCents,
  type InvoicePaymentMethod,
} from '@/lib/payment-processing-fees';

interface LineItem { description: string; qty: number; unit_cents: number }
interface InvoiceData {
  id: string;
  number: string;
  status: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  memo: string | null;
  line_items: LineItem[];
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
}

interface AccountSummary {
  balanceForwardCents: number;
  paymentsCreditsCents: number;
  newChargesCents: number;
  totalAmountDueCents: number;
}

/** Single-line address: "street, suite, city, ST 12345". Fixes run-together
 *  suite text ("Blvd.Suite 200") and a missing state before the zip. */
function formatBillToAddress(raw: string): string {
  let a = raw.replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s+/g, ' ').trim();
  a = a.replace(/([a-z.])(?=(Suite|Ste\.?|Apt\.?|Unit|Bldg\.?|Building|Floor|Fl\.?)\b)/g, '$1, ');
  a = a.replace(/,\s*,/g, ',');
  a = a.replace(/,\s*([A-Za-z .'-]+?)\s+(\d{5}(?:-\d{4})?)$/, (m, city, zip) =>
    /\b[A-Z]{2}$/.test(city.trim()) ? `, ${city.trim().replace(/\s+([A-Z]{2})$/, ', $1')} ${zip}` : `, ${city.trim()}, TX ${zip}`);
  return a;
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

const INVOICE_TERMS = [
  {
    title: 'FREQUENCY DISCOUNT',
    body: 'An advertiser who does not complete a committed consecutive-month insertion schedule will be subject to the one-time insertion rate.',
  },
  {
    title: 'AGENCY',
    body: 'All advertisements are published for the benefit of advertiser and advertising agency, and each of them is jointly and severally liable for all charges.',
  },
  {
    title: 'BILLING',
    body: 'Payment in U.S. dollars, including any applicable tax, due at Publisher’s Postal Box in Austin, Tx, within 20 days of the date of invoice. Any error in billing is binding upon advertiser and/or advertising agency unless Publisher receives written notice of the error within such 3-day period.',
  },
  {
    title: 'PAST DUE',
    body: 'All accounts not paid in full within 20 days of the date of the invoice shall incur a late charge of 1.5% per month from the due date until paid in full.',
  },
  {
    title: 'COLLECTION',
    body: 'In the event advertiser and/or advertising agency defaults in payment of invoices, such invoices are turned over for collection. In this event, the advertiser and/or advertising agency shall be totally liable for all fees and sums charged by the collection agency or attorney. If any suit or other judicial proceeding is instituted or had thereon or if such fees and sums are collected through probate or bankruptcy proceeding, advertiser and/or advertising agency shall be totally liable for all attorneys’ fees and court costs incurred by Publisher in the collection of said invoices.',
  },
];

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(pk: string) {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export default function InvoicePayClient({
  fees,
  invoice,
  accountSummary,
  justPaid,
  justCanceled,
  allowPartial = false,
  remainingCents,
}: {
  fees: FeeConfig;
  invoice: InvoiceData;
  accountSummary: AccountSummary;
  justPaid: boolean;
  justCanceled: boolean;
  allowPartial?: boolean;
  remainingCents?: number;
}) {
  setFeeConfig(fees);
  const [mode, setMode] = useState<'idle' | 'embedded' | 'redirecting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pk, setPk] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('card');

  const alreadyPaid = invoice.status === 'paid' || justPaid;
  const isVoid = invoice.status === 'void';
  const fullDueCents = remainingCents ?? Math.max(0, invoice.total_cents - accountSummary.paymentsCreditsCents);
  const [amountText, setAmountText] = useState('');
  const parsedCents = !allowPartial || amountText.trim() === '' ? fullDueCents : Math.round(Number(amountText.replace(/[$,]/g, '')) * 100);
  const amountValid = Number.isFinite(parsedCents) && parsedCents >= 100 && parsedCents <= fullDueCents;
  const payCents = amountValid ? parsedCents : fullDueCents;
  const partialBody = payCents < fullDueCents ? { amount_cents: payCents } : {};
  const surchargeCents = processingFeeCents(payCents, paymentMethod);
  const chargeTotalCents = payCents + surchargeCents;

  const startEmbedded = useCallback(async () => {
    setError(null);
    try {
      const cfg = await fetch(`/api/portal/invoices/${invoice.id}`).then((r) => r.json());
      if (!cfg.stripe_configured || !cfg.stripe_publishable_key) {
        setError('Online payment is not available right now. Please contact us to arrange payment.');
        return;
      }
      setPk(cfg.stripe_publishable_key);
      setMode('embedded');
    } catch {
      setError('Could not start checkout. Please try again.');
    }
  }, [invoice.id]);

  const startHosted = useCallback(async () => {
    setError(null);
    setMode('redirecting');
    try {
      const res = await fetch(`/api/portal/invoices/${invoice.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_mode: 'hosted', payment_method: paymentMethod, ...partialBody }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout.');
        setMode('idle');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start checkout. Please try again.');
      setMode('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, paymentMethod, payCents, fullDueCents]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch(`/api/portal/invoices/${invoice.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_mode: 'embedded', payment_method: paymentMethod, ...partialBody }),
    });
    const data = await res.json();
    if (!res.ok || !data.client_secret) {
      throw new Error(data.error ?? 'Could not start checkout.');
    }
    return data.client_secret as string;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, paymentMethod, payCents, fullDueCents]);

  return (
    <div className="space-y-6">
      {justCanceled && !alreadyPaid && (
        <div className="rounded-lg border border-[#FAD800]/30 bg-[#FEF8CC] px-4 py-3 text-sm text-[#645600]">
          Payment was canceled. You can try again below.
        </div>
      )}

      {alreadyPaid ? (
        <div className="rounded-lg border border-[#00E200]/30 bg-[#E0FBE0] px-4 py-4 text-center text-[#005A00] print:hidden">
          <div className="text-lg font-semibold">Thank you — this invoice is paid.</div>
          {invoice.paid_at && <div className="mt-1 text-sm">Paid on {fmtDate(invoice.paid_at)}</div>}
        </div>
      ) : isVoid ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-center text-gray-500 print:hidden">
          This invoice has been voided and does not require payment.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:hidden">
          {error && (
            <div className="mb-4 rounded-lg border border-[#FF2A04]/30 bg-[#FFEAE6] px-4 py-3 text-sm text-[#661102]">
              {error}
            </div>
          )}

          {mode === 'embedded' && pk ? (
            <EmbeddedCheckoutProvider stripe={getStripePromise(pk)} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div className="space-y-4">
              {allowPartial && <label className="block text-sm font-semibold text-gray-900">Amount to pay
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-gray-500">$</span>
                  <input
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder={(fullDueCents / 100).toFixed(2)}
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                  />
                  <button type="button" className="text-xs font-medium text-gray-600 underline" onClick={() => setAmountText('')}>Pay balance in full</button>
                </div>
                <span className="mt-1 block text-xs font-normal text-gray-500">Balance due {fmtUsd(fullDueCents)}. You can pay any amount from $1.00 up to the balance.</span>
                {!amountValid && amountText.trim() !== '' && <span className="mt-1 block text-xs font-normal text-[#661102]">Enter an amount between $1.00 and {fmtUsd(fullDueCents)}.</span>}
              </label>}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-900">Payment method</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {INVOICE_PAYMENT_METHODS.map((option) => {
                    const selected = paymentMethod === option.value;
                    const fee = processingFeeCents(payCents, option.value);
                    return (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-lg border p-3 transition ${
                          selected
                            ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                            : 'border-gray-200 bg-white hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="invoice-payment-method"
                          value={option.value}
                          checked={selected}
                          onChange={() => setPaymentMethod(option.value)}
                          className="sr-only"
                        />
                        <span className="block text-sm font-medium text-gray-900">{option.shortLabel}</span>
                        <span className="mt-1 block text-xs text-gray-500">{option.feeLabel}</span>
                        <span className="mt-2 block text-xs font-medium text-gray-700">
                          Fee {fmtUsd(fee)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <p className="text-sm text-gray-600">
                A {INVOICE_PAYMENT_METHODS.find((option) => option.value === paymentMethod)?.label.toLowerCase()} processing fee of{' '}
                {fmtUsd(surchargeCents)} is added before payment. Your total charge will be{' '}
                <strong>{fmtUsd(chargeTotalCents)}</strong>.
              </p>
              <button
                type="button"
                onClick={startEmbedded}
                disabled={mode === 'redirecting' || !amountValid && amountText.trim() !== ''}
                className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Pay {fmtUsd(chargeTotalCents)} now
              </button>
              <button
                type="button"
                onClick={startHosted}
                disabled={mode === 'redirecting'}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {mode === 'redirecting' ? 'Redirecting…' : "Pay on Stripe's secure page instead"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="mx-auto bg-white px-6 py-8 text-[11px] leading-[1.35] text-neutral-800 shadow-sm ring-1 ring-gray-200 print:w-full print:px-0 print:py-0 print:shadow-none print:ring-0 sm:px-8">
        <header className="grid grid-cols-[1fr_auto] gap-8 border-b border-neutral-300 pb-4">
          <div className="flex items-start gap-4">
            <Image
              src="/brand/caxton-logo.jpg"
              alt="Caxton Publications Inc."
              width={160}
              height={180}
              className="h-auto w-28 object-contain"
              priority
            />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-normal tracking-wide text-neutral-900">INVOICE</h1>
            <div className="mt-1 font-semibold">Caxton Publications, Inc.</div>
            <div>PO Box 81366</div>
            <div>Austin, Texas 78708</div>
            <div>United States</div>
            <div className="mt-2">www.myrealtyline.com</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 py-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Bill to</div>
            <div className="font-semibold">{invoice.bill_to_name ?? 'Customer'}</div>
            {invoice.bill_to_address && <div className="mt-1">{formatBillToAddress(invoice.bill_to_address)}</div>}
            {invoice.bill_to_email && <div>{invoice.bill_to_email}</div>}
          </div>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 text-right">
            <dt className="font-semibold">Invoice Number:</dt><dd>{invoice.number}</dd>
            <dt className="font-semibold">Invoice Date:</dt><dd>{fmtDate(invoice.issued_at)}</dd>
            <dt className="font-semibold">Payment Due:</dt><dd>{fmtDate(invoice.due_date)}</dd>
            <dt className="mt-2 bg-neutral-100 px-2 py-2 font-semibold">Amount Due (USD):</dt>
            <dd className="mt-2 bg-neutral-100 px-2 py-2 font-semibold">{alreadyPaid ? '$0.00' : fmtUsd(invoice.total_cents)}</dd>
          </dl>
        </section>

        <section className="mb-5">
          <div className="border-b border-neutral-300 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Account summary</div>
          <div className="grid grid-cols-[90px_1fr_auto] gap-x-3 border-b border-neutral-200 py-2">
            <div>{fmtDate(invoice.issued_at)}</div>
            <div>Balance Forward</div>
            <div className="text-right">{fmtUsd(accountSummary.balanceForwardCents)}</div>
            <div />
            <div>Payments and credits</div>
            <div className="text-right">{accountSummary.paymentsCreditsCents > 0 ? `-${fmtUsd(accountSummary.paymentsCreditsCents)}` : fmtUsd(0)}</div>
            <div />
            <div>New charges</div>
            <div className="text-right">{fmtUsd(accountSummary.newChargesCents)}</div>
            <div />
            <div className="font-semibold">Total Amount Due</div>
            <div className="text-right font-semibold">{fmtUsd(accountSummary.totalAmountDueCents)}</div>
          </div>
        </section>

        <section>
          <div className="grid grid-cols-[1fr_70px_85px_90px] bg-neutral-900 px-3 py-2 font-semibold text-white">
            <div>Services</div><div className="text-center">Quantity</div><div className="text-right">Rate</div><div className="text-right">Amount</div>
          </div>
          {invoice.line_items?.length ? invoice.line_items.map((li, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_85px_90px] border-b border-neutral-200 px-3 py-3">
              <div>{li.description}</div>
              <div className="text-center">{li.qty}</div>
              <div className="text-right">{fmtUsd(li.unit_cents)}</div>
              <div className="text-right">{fmtUsd(li.unit_cents * li.qty)}</div>
            </div>
          )) : (
            <div className="border-b border-neutral-200 px-3 py-4 text-center italic text-neutral-500">No itemized services.</div>
          )}
        </section>

        <section className="ml-auto mt-3 w-64">
          <div className="flex justify-between border-b border-neutral-200 py-1"><span>Total:</span><span>{fmtUsd(invoice.amount_cents)}</span></div>
          {invoice.tax_cents > 0 && <div className="flex justify-between border-b border-neutral-200 py-1"><span>Tax:</span><span>{fmtUsd(invoice.tax_cents)}</span></div>}
          <div className="flex justify-between py-2 font-semibold"><span>Amount Due (USD):</span><span>{alreadyPaid ? '$0.00' : fmtUsd(invoice.total_cents)}</span></div>
        </section>

        {invoice.memo && <section className="mt-3 border-t border-neutral-200 pt-3"><div className="font-semibold">Notes</div><div className="mt-1 whitespace-pre-line">{invoice.memo}</div></section>}

        <section className="mt-4 border-t border-neutral-300 pt-4">
          <h2 className="mb-3 font-semibold">Notes / Terms</h2>
          <div className="space-y-3 text-[9px] leading-[1.45]">
            <p>CAXTON PUBLICATIONS INC<br />RealtyLine Austin, Newsline San Antonio and Realty News Now App are dba&apos;s under Caxton Publications, Inc. The Services line item specifies the dab name to indicate where your ad is being placed and billed. Please note that placement in one company does not automatically include placement in the other. Each insertion is billed separately accordingly.</p>
            {INVOICE_TERMS.map((term) => (
              <div key={term.title}>
                <div className="font-semibold">{term.title}</div>
                <p>{term.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-center text-[9px] text-neutral-500">We appreciate your business.</footer>
      </article>
    </div>
  );
}
