'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, X } from 'lucide-react';

type Props = {
  advertiserId: number;
  advertiserName: string;
  recipient: string;
  compact?: boolean;
  onSent?: (event: { sentAt: string; recipient: string }) => void;
};

type InvoiceSender =
  | 'tawanna@newslinesa.com'
  | 'hello@newslinesa.com';

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500';

export default function StatementEmailButton({
  advertiserId,
  advertiserName,
  recipient,
  compact = false,
  onSent,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState<InvoiceSender>('hello@newslinesa.com');
  const [to, setTo] = useState(recipient);
  const [subject, setSubject] = useState(`Statement of Account from Caxton Publications, Inc.`);
  const [message, setMessage] = useState(
    `Dear ${advertiserName},\n\nPlease find your current Statement of Account below and attached as a PDF. Each outstanding invoice includes a secure online payment link.\n\nPlease contact us if you have any questions.\n\nSincerely,\nTawanna Verock\nCaxton Publications Inc.`,
  );
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch(`/api/admin/advertisers/${advertiserId}/send-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, message }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail ?? data.error ?? 'Could not send statement.');
      setResult(`Statement sent to ${data.recipient}. ${data.invoice_count} payment links refreshed.`);
      onSent?.({
        sentAt: String(data.sent_at ?? new Date().toISOString()),
        recipient: String(data.recipient ?? to),
      });
      if (!onSent) router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not send statement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError('');
          setResult('');
        }}
        className={
          compact
            ? 'font-medium text-orange-700 hover:underline'
            : 'inline-flex h-9 items-center justify-center gap-2 rounded bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-700'
        }
      >
        {!compact && <Mail className="h-4 w-4" aria-hidden="true" />}
        Email statement
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/45 p-4 text-left"
          role="dialog"
          aria-modal="true"
          aria-label={`Email statement to ${advertiserName}`}
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Email statement</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Fresh payment links will be created before the email and PDF are generated.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close email statement"
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid gap-6 p-6 lg:grid-cols-[1fr_240px]">
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-600">
                  From
                  <select
                    className={`${CONTROL} mt-1 w-full`}
                    value={from}
                    onChange={(event) => setFrom(event.target.value as InvoiceSender)}
                  >
                    <option value="hello@newslinesa.com">
                      Caxton Publications Inc. &lt;hello@newslinesa.com&gt;
                    </option>
                    <option value="tawanna@newslinesa.com">
                      Tawanna Verock &lt;tawanna@newslinesa.com&gt;
                    </option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  To
                  <input
                    type="email"
                    className={`${CONTROL} mt-1 w-full`}
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Subject
                  <input
                    className={`${CONTROL} mt-1 w-full`}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Message
                  <textarea
                    className="mt-1 min-h-48 w-full rounded border border-gray-300 p-3 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
              </div>
              <aside className="rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
                <div className="font-semibold text-gray-900">Included</div>
                <ul className="mt-2 list-disc space-y-2 pl-4">
                  <li>Branded statement in the email</li>
                  <li>Statement PDF attachment</li>
                  <li>Fresh Pay Invoice link for every open invoice</li>
                  <li>Current payments and remaining balances</li>
                </ul>
                <p className="mt-4 text-gray-500">
                  Review the recipient carefully. Sending creates new Stripe Checkout Sessions and
                  replaces the links shown on the Payment Links page.
                </p>
              </aside>
            </div>

            {(error || result) && (
              <div
                className={`mx-6 mb-4 rounded border px-4 py-3 text-sm ${
                  error
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                {error || result}
              </div>
            )}

            <footer className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
                onClick={() => setOpen(false)}
              >
                {result ? 'Close' : 'Cancel'}
              </button>
              {!result && (
                <button
                  type="button"
                  disabled={busy || !to.trim() || !subject.trim()}
                  className="inline-flex h-9 items-center justify-center rounded bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50"
                  onClick={send}
                >
                  {busy ? 'Refreshing links and sending…' : 'Send email + PDF'}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
