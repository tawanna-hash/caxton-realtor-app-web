'use client';

// app/admin/reports/_components/DepositReportClient.tsx
//
// Deposit-ready view of received checks. Checks are the only tender that
// reaches a bank deposit slip, so the server query admits check payments only
// and this view carries no tender filter. Screen chrome is marked `print:hidden` / `no-print` so the printed
// sheet is just the report. The global print stylesheet hides any element
// whose class contains "sticky" or "fixed", so report content avoids both.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCents } from '@/lib/invoices';
import { PUBLICATION_OPTIONS } from '@/lib/publication-theme';
import type { DepositPaymentRow } from '@/lib/server/deposit-reports';
import { shortDate } from '@/app/admin/billing/_components/helpers';

export type { DepositPaymentRow } from '@/lib/server/deposit-reports';

const PUB_LABELS = new Map(PUBLICATION_OPTIONS.map((option) => [option.id as string, option.label]));

/**
 * `advertisers.publication` stores keys and may be comma-separated for
 * multi-market advertisers, so render the reader-facing titles instead of
 * raw keys like `san_antonio`.
 */
function publicationLabel(publication: string | null): string {
  const keys = (publication ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length) return '';
  return keys.map((key) => PUB_LABELS.get(key) ?? key).join(' · ');
}

const CONTROL =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';

function sourceLabel(source: string | null): string {
  const value = (source ?? '').trim();
  if (!value) return 'Manual';
  return value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
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

export default function DepositReportClient({
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
  const rows = payments;

  const totalCents = useMemo(
    () => rows.reduce((sum, payment) => sum + payment.amount_cents, 0),
    [rows],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, { count: number; cents: number }>();
    for (const payment of rows) {
      const key = payment.payment_date ?? 'Undated';
      const current = map.get(key) ?? { count: 0, cents: 0 };
      map.set(key, { count: current.count + 1, cents: current.cents + payment.amount_cents });
    }
    return Array.from(map.entries())
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const applyRange = () => {
    const query = new URLSearchParams({ from: fromDate, to: toDate });
    router.push(`/admin/reports/deposits?${query.toString()}`);
  };

  const rangeLabel = `${shortDate(from)} – ${shortDate(to)}`;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 print:max-w-none print:px-0 print:py-0">
      {/* Screen-only controls */}
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deposit Slip</h1>
          <p className="mt-1 text-sm text-gray-600">
            Every check recorded against an invoice in the selected range, totalled for the bank deposit slip.
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
            Print deposit slip
          </button>
        </div>
      </div>

      {/* Printed report */}
      <div className="rounded border border-gray-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 border-b border-gray-200 pb-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Caxton Publications, Inc.</div>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">Deposit Slip</h2>
          <div className="mt-2 grid gap-x-8 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
            <div>Period: <span className="font-medium text-gray-900">{rangeLabel}</span></div>
            <div>Checks included: <span className="font-medium text-gray-900">{rows.length}</span></div>
            <div>Tender: <span className="font-medium text-gray-900">Checks only</span></div>
            <div>Prepared by: <span className="font-medium text-gray-900">{preparedBy ?? '—'}</span></div>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 print:bg-white">
            <div className="text-xs text-emerald-800">Total deposit</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-900">{formatCents(totalCents)}</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 print:bg-white">
            <div className="text-xs text-gray-600">Checks</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900">{rows.length}</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 print:bg-white">
            <div className="text-xs text-gray-600">Deposit days</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900">{byDay.length}</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-600">
            No check payments were recorded between {shortDate(from)} and {shortDate(to)}.
          </div>
        ) : (
          <>
            <div className="deposit-date-summary mb-6 grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-md border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 print:bg-white">
                  Deposit by date
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 text-right font-semibold">Count</th>
                      <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {byDay.map((entry) => (
                      <tr key={entry.day}>
                        <td className="px-3 py-2 text-gray-800">{entry.day === 'Undated' ? 'Undated' : shortDate(entry.day)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{entry.count}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{formatCents(entry.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-gray-200 print:overflow-visible">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 print:bg-white">
                Check detail
              </div>
              <table className="deposit-detail-table w-full min-w-[980px] text-left text-xs print:min-w-0">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Partner</th>
                    <th className="px-3 py-2 font-semibold">Invoice</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Check no.</th>
                    <th className="px-3 py-2 font-semibold">Memo</th>
                    <th className="px-3 py-2 font-semibold">Source</th>
                    <th className="px-3 py-2 font-semibold">Recorded</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((payment) => (
                    <tr key={payment.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{shortDate(payment.payment_date)}</td>
                      {/* Kept on one line: a wrapped partner name pushes every
                          row taller and spills the sheet onto a second page. */}
                      <td className="px-3 py-2 text-gray-900 print:whitespace-nowrap">
                        <div className="font-medium">{payment.partner_name ?? '—'}</div>
                        {publicationLabel(payment.publication) && (
                          <div className="text-gray-500">{publicationLabel(payment.publication)}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">
                        <div className="font-medium">{payment.invoice_number ?? 'Draft'}</div>
                        <div className="text-gray-500">
                          {formatCents(payment.invoice_total_cents)} · {payment.invoice_status ?? '—'}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">{payment.reference?.trim() || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{payment.memo?.trim() || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-700">{sourceLabel(payment.source)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600 print:whitespace-normal">
                        <div>{timestamp(payment.created_at)}</div>
                        {/* Preparer is already named in the printed header. */}
                        {payment.created_by && <div className="text-gray-500 print:hidden">{payment.created_by}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                        {formatCents(payment.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-300 bg-gray-50 print:bg-white">
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right font-semibold text-gray-900">Total deposit</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                      {formatCents(totalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-6 grid gap-6 border-t border-gray-200 pt-6 text-xs text-gray-600 sm:grid-cols-2 print:break-inside-avoid">
              <div>
                <div className="mb-6">Prepared by</div>
                <div className="border-t border-gray-400 pt-1">{preparedBy ?? ''}</div>
              </div>
              <div>
                <div className="mb-6">Verified / deposited by</div>
                <div className="border-t border-gray-400 pt-1" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
