'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCents } from '@/lib/invoices';
import type { DepositPaymentRow } from '@/lib/server/deposit-reports';
import { shortDate } from '@/app/admin/billing/_components/helpers';

const CONTROL =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';

function sourceLabel(source: string | null): string {
  const value = (source ?? '').trim();
  if (!value) return 'Manual';
  return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function timestamp(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DepositDetailClient({
  payments,
  from,
  to,
  preparedBy,
}: {
  payments: DepositPaymentRow[];
  from: string;
  to: string;
  preparedBy: string | null;
}) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const totalCents = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.amount_cents, 0),
    [payments],
  );

  const applyRange = () => {
    const query = new URLSearchParams({ from: fromDate, to: toDate });
    router.push(`/admin/reports/detail?${query.toString()}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deposit detail</h1>
          <p className="mt-1 text-sm text-gray-600">
            Transaction-level check detail from recorded invoice payments.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-600">From</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={CONTROL} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-600">To</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={CONTROL} />
          </label>
          <button
            type="button"
            onClick={applyRange}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Update range
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            Print report
          </button>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 border-b border-gray-200 pb-4 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Caxton Publications, Inc.</div>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">Deposit Detail</h2>
          <div className="mt-1 text-xs text-gray-600">{shortDate(from)} – {shortDate(to)}</div>
        </div>

        <div className="mb-3 flex items-center justify-between text-xs text-gray-600">
          <span>{payments.length} check{payments.length === 1 ? '' : 's'}</span>
          <span>Prepared by: <span className="font-medium text-gray-900">{preparedBy ?? '—'}</span></span>
        </div>

        {payments.length === 0 ? (
          <div className="border-y border-gray-200 px-4 py-10 text-center text-sm text-gray-600">
            No check payments were recorded between {shortDate(from)} and {shortDate(to)}.
          </div>
        ) : (
          <div className="overflow-x-auto border-y border-gray-200 print:overflow-visible">
            <table className="deposit-ledger-table w-full min-w-[1100px] text-left text-xs print:min-w-0">
              <thead className="border-b border-gray-300 text-gray-700">
                <tr>
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">Check no.</th>
                  <th className="px-2 py-2 font-semibold">Client</th>
                  <th className="px-2 py-2 font-semibold">Invoice</th>
                  <th className="px-2 py-2 font-semibold">Description</th>
                  <th className="px-2 py-2 font-semibold">Source</th>
                  <th className="px-2 py-2 font-semibold">Recorded</th>
                  <th className="px-2 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <tr key={payment.id} className="align-top">
                    <td className="whitespace-nowrap px-2 py-2">{shortDate(payment.payment_date)}</td>
                    <td className="whitespace-nowrap px-2 py-2">Check</td>
                    <td className="whitespace-nowrap px-2 py-2 font-medium">{payment.reference?.trim() || '—'}</td>
                    <td className="px-2 py-2 font-medium text-gray-900">{payment.partner_name ?? '—'}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{payment.invoice_number ?? 'Draft'}</div>
                      <div className="text-gray-500">{payment.invoice_status ?? '—'}</div>
                    </td>
                    <td className="px-2 py-2 text-gray-700">{payment.memo?.trim() || 'Payment received'}</td>
                    <td className="px-2 py-2 text-gray-700">{sourceLabel(payment.source)}</td>
                    <td className="px-2 py-2 text-gray-600">
                      <div>{timestamp(payment.created_at)}</div>
                      {payment.created_by && <div className="text-gray-500 print:hidden">{payment.created_by}</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">
                      {formatCents(payment.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-300">
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-right font-semibold">Total</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">
                    {formatCents(totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
