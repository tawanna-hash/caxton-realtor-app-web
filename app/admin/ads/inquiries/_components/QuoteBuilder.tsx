'use client';

import { useMemo, useState } from 'react';
import { PACKAGES, EBLASTS, eblastPriceForPub } from '@/lib/media-kit';
import type { AdInquiryRow } from '@/lib/server/ad-inquiries-store';
import {
  PUBLICATION_IDS,
  PUBLICATION_LABELS_WITH_BOTH,
  publicationToPubId,
  type PublicationScope,
} from '@/lib/publications';

// Stable id for an e-Blast package — same convention as the public form.
function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

interface CreatedInvoice {
  id: string;
  number: string | null;
  amount_cents: number;
  status: string;
}

interface CreatedAgreement {
  id: string;
  status: string;
  type: string | null;
  amount_cents: number;
  start_date: string | null;
  end_date: string | null;
}

interface Props {
  inquiry: AdInquiryRow;
  onQuoted: (next: AdInquiryRow) => void;
}

export default function QuoteBuilder({ inquiry, onQuoted }: Props) {
  // Default selection: whichever package the buyer asked about in the
  // public form. Admin can override before drafting.
  const [packageId, setPackageId] = useState<string>(inquiry.package_id ?? '');
  const [size, setSize] = useState<string>('');
  const [months, setMonths] = useState<number>(1);
  const [sends, setSends] = useState<number>(1);
  // Publication scope for e-Blast pricing. 'austin' | 'san_antonio' | 'both'.
  const [publication, setPublication] = useState<PublicationScope>('austin');
  const [dueDate, setDueDate] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<CreatedAgreement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);

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

  // Live preview of the line-item total so admin sees exactly what the
  // invoice will look like before drafting.
  const previewCents = useMemo(() => {
    if (isPrint && selectedPrintPackage) {
      const sizeRow =
        selectedPrintPackage.sizes.find((s) => s.size === size) ??
        selectedPrintPackage.sizes[0];
      if (!sizeRow) return 0;
      return sizeRow.price * 100 * Math.max(months, 1);
    }
    if (isEmail && selectedEmailPackage) {
      const mkPub = publication === 'both' ? 'both' : publicationToPubId(publication);
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
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        channel: inquiry.channel,
        package_id: packageId,
      };
      if (isPrint) {
        payload.size = size || selectedPrintPackage?.sizes[0]?.size;
        payload.months = months;
      }
      if (isEmail) {
        payload.sends = sends;
        payload.publication = publication;
      }
      if (dueDate) payload.due_date = dueDate;
      if (memo.trim()) payload.memo = memo.trim();

      const res = await fetch(`/api/admin/ads/inquiries/${inquiry.id}/quote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Quote failed (${res.status})`);
      }
      const json = (await res.json()) as {
        agreement?: CreatedAgreement;
        invoice: CreatedInvoice;
        inquiry: AdInquiryRow;
      };
      setCreated(json.invoice);
      if (json.agreement) setCreatedAgreement(json.agreement);
      onQuoted(json.inquiry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    if (!createdAgreement) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/agreements/${createdAgreement.id}/send`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Send failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (created) {
    // Payment terms line varies by channel — mirrors the API's due_date logic.
    const paymentTerms =
      inquiry.channel === 'email'
        ? 'Payment due immediately on invoice.'
        : 'Print: invoiced monthly, net-20 (card or check).';

    return (
      <div className="border border-green-200 bg-green-50 rounded-md p-4 mt-4">
        <p className="text-sm font-semibold text-green-900">
          Quote drafted: {created.number ?? created.id}
          {createdAgreement && (
            <span className="ml-2 text-xs font-normal text-green-800">
              · agreement {createdAgreement.id.slice(0, 8)}
            </span>
          )}
        </p>
        <p className="text-xs text-green-900 mt-1">
          ${(created.amount_cents / 100).toFixed(2)} · status {created.status}.
        </p>
        <p className="text-xs text-green-800 mt-1 italic">{paymentTerms}</p>
        {sent && (
          <p className="text-xs text-green-900 mt-2 font-medium">
            ✓ Quote email sent — client will receive a sign link.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {createdAgreement && !sent && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending…' : 'Send Quote to Client'}
            </button>
          )}
          {createdAgreement && (
            <a
              href={`/admin/agreements?id=${encodeURIComponent(createdAgreement.id)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
            >
              Open agreement
            </a>
          )}
          <a
            href={`/admin/invoices?focus=${encodeURIComponent(created.id)}`}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
          >
            Open in Invoices
          </a>
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setCreatedAgreement(null);
              setSent(false);
              setError(null);
            }}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
          >
            Draft another
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-700 mt-2">Error: {error}</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-gray-200 rounded-md p-4 mt-4 bg-gray-50"
    >
      <p className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-3">
        Draft a quote ({isPrint ? 'Print' : 'Email'})
      </p>

      <div className="mb-3">
        <label
          htmlFor="quote-package"
          className="block text-xs text-gray-700 font-medium mb-1"
        >
          Package
        </label>
        <select
          id="quote-package"
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
            setSize('');
          }}
          disabled={submitting}
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Pick a package —</option>
          {isPrint &&
            PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.term}
              </option>
            ))}
          {isEmail &&
            EBLASTS.map((e) => (
              <option key={eblastId(e.name)} value={eblastId(e.name)}>
                {e.name} — ${eblastPriceForPub(e, publication === 'both' ? 'both' : publicationToPubId(publication)).toLocaleString()}/send
              </option>
            ))}
        </select>
      </div>

      {isPrint && selectedPrintPackage && (
        <>
          <div className="mb-3">
            <label
              htmlFor="quote-size"
              className="block text-xs text-gray-700 font-medium mb-1"
            >
              Size
            </label>
            <select
              id="quote-size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={submitting}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedPrintPackage.sizes.map((s) => (
                <option key={s.size} value={s.size}>
                  {s.size} — ${s.price.toLocaleString()}/mo
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label
              htmlFor="quote-months"
              className="block text-xs text-gray-700 font-medium mb-1"
            >
              Months
            </label>
            <input
              id="quote-months"
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) =>
                setMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
              }
              disabled={submitting}
              className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {isEmail && selectedEmailPackage && (
        <div className="mb-3">
          <label
            htmlFor="quote-publication"
            className="block text-xs text-gray-700 font-medium mb-1"
          >
            Publication
          </label>
          <select
            id="quote-publication"
            value={publication}
            onChange={(e) => setPublication(e.target.value as PublicationScope)}
            disabled={submitting}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PUBLICATION_IDS.map((id) => (
              <option key={id} value={id}>{PUBLICATION_LABELS_WITH_BOTH[id]}</option>
            ))}
            <option value="both">Austin + San Antonio bundle — 10% off</option>
          </select>
        </div>
      )}

      {isEmail && selectedEmailPackage && (
        <div className="mb-3">
          <label
            htmlFor="quote-sends"
            className="block text-xs text-gray-700 font-medium mb-1"
          >
            Sends
          </label>
          <input
            id="quote-sends"
            type="number"
            min={1}
            max={24}
            value={sends}
            onChange={(e) =>
              setSends(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
            }
            disabled={submitting}
            className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label
            htmlFor="quote-due"
            className="block text-xs text-gray-700 font-medium mb-1"
          >
            Due date <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="quote-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={submitting}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="self-end">
          <p className="text-xs text-gray-600 mb-0.5">Preview total</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">
            ${(previewCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="mb-3">
        <label
          htmlFor="quote-memo"
          className="block text-xs text-gray-700 font-medium mb-1"
        >
          Memo <span className="text-gray-400">(optional, appears on invoice)</span>
        </label>
        <textarea
          id="quote-memo"
          rows={2}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          disabled={submitting}
          placeholder="Defaults to: Quote drafted from ad inquiry …"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p className="text-xs text-red-700 font-medium mb-2">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !packageId || previewCents <= 0}
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {submitting ? 'Drafting…' : 'Draft quote'}
        </button>
        <p className="text-xs text-gray-600">
          Creates a draft invoice and marks this inquiry as Quoted.
        </p>
      </div>
    </form>
  );
}
