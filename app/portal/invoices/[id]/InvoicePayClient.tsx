'use client';

// app/portal/invoices/[id]/InvoicePayClient.tsx
//
// Client-side invoice detail + payment UI. Offers an embedded Stripe
// Checkout form inline, with a "pay on Stripe's page" fallback link.

import { useState, useCallback } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

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

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  void: 'bg-gray-50 text-gray-400 border-gray-200',
};

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(pk: string) {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export default function InvoicePayClient({
  invoice,
  justPaid,
  justCanceled,
}: {
  invoice: InvoiceData;
  justPaid: boolean;
  justCanceled: boolean;
}) {
  const [mode, setMode] = useState<'idle' | 'embedded' | 'redirecting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pk, setPk] = useState<string | null>(null);

  const alreadyPaid = invoice.status === 'paid' || justPaid;
  const isVoid = invoice.status === 'void';
  const surchargeCents = Math.round(invoice.total_cents * 0.03);
  const chargeTotalCents = invoice.total_cents + surchargeCents;

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
        body: JSON.stringify({ ui_mode: 'hosted' }),
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
  }, [invoice.id]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch(`/api/portal/invoices/${invoice.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_mode: 'embedded' }),
    });
    const data = await res.json();
    if (!res.ok || !data.client_secret) {
      throw new Error(data.error ?? 'Could not start checkout.');
    }
    return data.client_secret as string;
  }, [invoice.id]);

  return (
    <div className="space-y-6">
      {justCanceled && !alreadyPaid && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Payment was canceled. You can try again below.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">Bill to</div>
            <div className="font-medium text-gray-900">{invoice.bill_to_name ?? '—'}</div>
            {invoice.bill_to_email && <div className="text-sm text-gray-500">{invoice.bill_to_email}</div>}
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              STATUS_TONE[alreadyPaid ? 'paid' : invoice.status] ?? STATUS_TONE.draft
            }`}
          >
            {alreadyPaid ? 'Paid' : invoice.status}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Issued</div>
            <div className="text-gray-900">{fmtDate(invoice.issued_at)}</div>
          </div>
          <div>
            <div className="text-gray-500">Due</div>
            <div className="text-gray-900">{fmtDate(invoice.due_date)}</div>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          {invoice.line_items?.map((li, i) => (
            <div key={i} className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-700">
                {li.description} {li.qty > 1 ? `× ${li.qty}` : ''}
              </span>
              <span className="text-gray-900">{fmtUsd(li.unit_cents * li.qty)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3 text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{fmtUsd(invoice.amount_cents)}</span>
          </div>
          {invoice.tax_cents > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax</span>
              <span>{fmtUsd(invoice.tax_cents)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-semibold text-gray-900">
            <span>Total due</span>
            <span>{fmtUsd(invoice.total_cents)}</span>
          </div>
        </div>

        {invoice.memo && (
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{invoice.memo}</div>
        )}
      </div>

      {alreadyPaid ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-emerald-800">
          <div className="text-lg font-semibold">Thank you — this invoice is paid.</div>
          {invoice.paid_at && <div className="mt-1 text-sm">Paid on {fmtDate(invoice.paid_at)}</div>}
        </div>
      ) : isVoid ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-center text-gray-500">
          This invoice has been voided and does not require payment.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {mode === 'embedded' && pk ? (
            <EmbeddedCheckoutProvider stripe={getStripePromise(pk)} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Card payments include a 3% processing fee ({fmtUsd(surchargeCents)}), for a total charge of{' '}
                <strong>{fmtUsd(chargeTotalCents)}</strong>.
              </p>
              <button
                type="button"
                onClick={startEmbedded}
                disabled={mode === 'redirecting'}
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
    </div>
  );
}
