'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PACKAGES, EBLASTS, eblastPriceForPub } from '@/lib/media-kit';
import type { AdInquiryRow } from '@/lib/server/ad-inquiries-store';

// Stable id for an e-Blast package — same convention as the public form.
function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

interface CreatedAgreement {
  id: string;
  status: string;
  amount_cents: number | null;
  stripe_payment_link_url: string | null;
  created_at: string;
}

interface CreatedInvoice {
  id: string;
  number: string | null;
  amount_cents: number | null;
}

interface Props {
  inquiry: AdInquiryRow;
  onBooked: (next: AdInquiryRow) => void;
}

type PaymentMode = 'link' | 'invoice' | 'check' | 'card';

const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  link: 'Stripe payment link',
  invoice: 'Mark invoiced (manual)',
  check: 'Mark paid by check',
  card: 'Paid in person (card)',
};

// Default 30-day window starting today.
function defaultStart(): string {
  return new Date().toISOString().slice(0, 10);
}
function defaultEnd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 29);
  return d.toISOString().slice(0, 10);
}

export default function BookingBuilder({ inquiry, onBooked }: Props) {
  const [packageId, setPackageId] = useState<string>(inquiry.package_id ?? '');
  const [size, setSize] = useState<string>('');
  const [months, setMonths] = useState<number>(1);
  const [sends, setSends] = useState<number>(1);
  // Publication scope for e-Blast pricing. 'austin' | 'san_antonio' | 'both'.
  const [publication, setPublication] = useState<'austin' | 'san_antonio' | 'both'>('austin');
  const [startDate, setStartDate] = useState<string>(defaultStart());
  const [endDate, setEndDate] = useState<string>(defaultEnd());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('link');
  const [stripeLink, setStripeLink] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    agreement: CreatedAgreement;
    invoice: CreatedInvoice | null;
  } | null>(null);

  const isPrint = inquiry.channel === 'print';
  const isEmail = inquiry.channel === 'email';

  const selectedPrintPackage = useMemo(
    () => (isPrint ? PACKAGES.find((p) => p.id === packageId) ?? null : null),
    [isPrint, packageId],
  );
  const selectedEmailPackage = useMemo(
    () => (isEmail ? EBLASTS.find((e) => eblastId(e.name) === packageId) ?? null : null),
    [isEmail, packageId],
  );

  const previewCents = useMemo(() => {
    if (isPrint && selectedPrintPackage) {
      const sizeRow =
        selectedPrintPackage.sizes.find((s) => s.size === size) ??
        selectedPrintPackage.sizes[0];
      if (!sizeRow) return 0;
      return sizeRow.price * 100 * Math.max(months, 1);
    }
    if (isEmail && selectedEmailPackage) {
      const mkPub = publication === 'austin' ? 'realtyline' as const : publication === 'san_antonio' ? 'newsline' as const : 'both' as const;
      return Math.round(eblastPriceForPub(selectedEmailPackage, mkPub) * 100) * Math.max(sends, 1);
    }
    return 0;
  }, [isPrint, isEmail, selectedPrintPackage, selectedEmailPackage, size, months, sends, publication]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!packageId) {
      setError('Pick a package first.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }
    if (paymentMode === 'link' && !stripeLink.trim()) {
      setError('Paste a Stripe payment link URL or switch payment mode.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        channel: inquiry.channel,
        package_id: packageId,
        start_date: startDate,
        end_date: endDate,
        payment_mode: paymentMode,
      };
      if (isPrint) {
        payload.size = size || selectedPrintPackage?.sizes[0]?.size;
        payload.months = months;
      }
      if (isEmail) {
        payload.sends = sends;
        payload.publication = publication;
      }
      if (paymentMode === 'link' && stripeLink.trim()) {
        payload.stripe_payment_link_url = stripeLink.trim();
      }
      if (memo.trim()) payload.memo = memo.trim();

      const res = await fetch(`/api/admin/ads/inquiries/${inquiry.id}/book`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Booking failed (${res.status})`);
      }
      const json = (await res.json()) as {
        agreement: CreatedAgreement;
        invoice: CreatedInvoice | null;
        inquiry: AdInquiryRow;
      };
      setCreated({ agreement: json.agreement, invoice: json.invoice });
      onBooked(json.inquiry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success card ──────────────────────────────────────────────────────
  if (created) {
    return (
      <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-sm font-semibold text-emerald-900">
          Booked. Agreement created
          {created.invoice?.number ? ` — invoice ${created.invoice.number}` : ''}.
        </div>
        <div className="mt-1 text-xs text-emerald-900">
          Status: <strong>{created.agreement.status}</strong>
          {created.agreement.amount_cents != null && (
            <>
              {' · '}Amount:{' '}
              <strong>
                ${(created.agreement.amount_cents / 100).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/agreements?agreement=${encodeURIComponent(created.agreement.id)}`}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-700 text-white hover:bg-emerald-800"
          >
            Open in Agreements →
          </Link>
          <Link
            href="/admin/ads/orders"
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
          >
            View in Ad Orders →
          </Link>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-md border border-blue-200 bg-blue-50/40 p-4 space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Book directly (skip quote)
        </h3>
        <span className="text-xs text-gray-600">Creates agreement + invoice</span>
      </div>

      {/* Package picker */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Package
        </label>
        <select
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
            setSize('');
          }}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          <option value="">— pick —</option>
          {isPrint &&
            PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          {isEmail &&
            EBLASTS.map((e) => (
              <option key={e.name} value={eblastId(e.name)}>
                {e.name} — ${eblastPriceForPub(e, publication === 'austin' ? 'realtyline' : publication === 'san_antonio' ? 'newsline' : 'both').toLocaleString()}/send
              </option>
            ))}
        </select>
      </div>

      {/* Print: size + months */}
      {isPrint && selectedPrintPackage && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Size
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
            >
              {selectedPrintPackage.sizes.map((s) => (
                <option key={s.size} value={s.size}>
                  {s.size} — ${s.price.toLocaleString()}/mo
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Months
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
            />
          </div>
        </div>
      )}

      {/* Email: publication scope */}
      {isEmail && selectedEmailPackage && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Publication
          </label>
          <select
            value={publication}
            onChange={(e) => setPublication(e.target.value as 'austin' | 'san_antonio' | 'both')}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="austin">RealtyLine Austin</option>
            <option value="san_antonio">Newsline San Antonio</option>
            <option value="both">Both markets bundle — 10% off</option>
          </select>
        </div>
      )}

      {/* Email: sends */}
      {isEmail && selectedEmailPackage && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Sends
          </label>
          <input
            type="number"
            min={1}
            max={24}
            value={sends}
            onChange={(e) => setSends(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          />
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            End date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          />
        </div>
      </div>

      {/* Payment mode */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Payment
        </label>
        <select
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
        >
          {(['link', 'invoice', 'check', 'card'] as PaymentMode[]).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      {paymentMode === 'link' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Stripe payment link URL
          </label>
          <input
            type="url"
            placeholder="https://buy.stripe.com/..."
            value={stripeLink}
            onChange={(e) => setStripeLink(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          />
          <p className="mt-1 text-[11px] text-gray-600">
            Create the link in Stripe Dashboard, then paste it here. The
            advertiser will see it on the invoice.
          </p>
        </div>
      )}

      {/* Memo */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Internal memo (optional)
        </label>
        <textarea
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white"
          placeholder="e.g. agreed terms on phone with Jane, will send creative tomorrow"
        />
      </div>

      {/* Preview total */}
      <div className="flex items-baseline justify-between border-t border-blue-200 pt-2">
        <span className="text-xs text-gray-700">Total</span>
        <span className="text-base font-semibold text-gray-900">
          ${(previewCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !packageId || previewCents <= 0}
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {submitting ? 'Booking…' : 'Book it'}
        </button>
        <span className="text-[11px] text-gray-600">
          Creates an agreement + invoice and marks the inquiry won.
        </span>
      </div>
    </form>
  );
}
