import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ensureSchema, getSql } from '@/lib/db';
import { formatCents } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PageTitle from '@/components/ui/PageTitle';

export const dynamic = 'force-dynamic';

type PayoutRow = { batch_date: string; amount_cents: number; transactions: number; deposit_id: string | null };

type PageProps = {
  searchParams: Promise<{
    q?: string;
    range?: string;
    page?: string;
    perPage?: string;
  }>;
};

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100';

function payoutHref(
  params: Awaited<PageProps['searchParams']>,
  changes: Record<string, string | number>,
) {
  const next = new URLSearchParams();
  const values = { ...params, ...changes };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') next.set(key, String(value));
  }
  return `/admin/getpaid/stripepayouts?${next.toString()}`;
}

function isInRange(date: string, range: string) {
  if (range === 'all') return true;
  const days = range === '30-days' ? 30 : range === '90-days' ? 90 : 365;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(`${date}T12:00:00`).getTime() >= cutoff.getTime();
}

export default async function StripePayoutsPage({ searchParams }: PageProps) {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const payouts = await sql`
    SELECT to_char(date_trunc('day', paid_at), 'YYYY-MM-DD') AS batch_date,
      sum(total_cents)::bigint AS amount_cents,
      count(*)::int AS transactions,
      max(stripe_payment_intent_id) AS deposit_id
    FROM invoices
    WHERE status = 'paid' AND paid_at IS NOT NULL AND stripe_payment_intent_id IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC
  `.catch(() => [] as unknown[]);
  const rows = payouts as unknown as PayoutRow[];
  const params = await searchParams;
  const query = (params.q ?? '').trim().toLowerCase();
  const range = ['30-days', '90-days', '12-months', 'all'].includes(params.range ?? '')
    ? params.range!
    : '12-months';
  const pageSize = [25, 50, 100].includes(Number(params.perPage))
    ? Number(params.perPage)
    : 25;
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const filteredRows = rows.filter((row) => {
    if (!isInRange(row.batch_date, range)) return false;
    if (!query) return true;
    return [row.batch_date, row.deposit_id, row.transactions, row.amount_cents]
      .filter((value) => value !== null)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPaid = filteredRows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const transactionCount = filteredRows.reduce((sum, row) => sum + Number(row.transactions), 0);
  const averagePayout = filteredRows.length ? Math.round(totalPaid / filteredRows.length) : 0;
  const latestPayout = filteredRows[0]?.batch_date ?? '—';

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
            Admin · Get Paid
          </div>
          <PageTitle size="md">Payouts from Stripe</PageTitle>
          <p className="mt-1 text-sm text-gray-600">
            Paid card transactions grouped by settlement date.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />
          Stripe connected
        </span>
      </div>

      <section aria-label="Payout summary" className="bg-white">
        <div className="grid grid-cols-2 divide-x divide-gray-200 lg:grid-cols-4">
          <div className="min-w-0 pr-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{formatCents(totalPaid)}</div>
            <div className="mt-0.5 text-xs text-gray-600">total paid</div>
          </div>
          <div className="min-w-0 px-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{filteredRows.length.toLocaleString()}</div>
            <div className="mt-0.5 text-xs text-gray-600">payout batches</div>
          </div>
          <div className="min-w-0 px-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{transactionCount.toLocaleString()}</div>
            <div className="mt-0.5 text-xs text-gray-600">transactions</div>
          </div>
          <div className="min-w-0 pl-4">
            <div className="text-lg font-semibold leading-tight text-gray-900">{formatCents(averagePayout)}</div>
            <div className="mt-0.5 truncate text-xs text-gray-600">average payout · latest {latestPayout}</div>
          </div>
        </div>
        <div className="mt-3 h-4 rounded-sm bg-emerald-600" aria-hidden="true" />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Payout filters">
        <label className="min-w-60 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search payouts</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={params.q}
              placeholder="Search date or deposit ID"
              className={`${CONTROL} w-full pl-9`}
            />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Date</span>
          <select name="range" defaultValue={range} className={`${CONTROL} min-w-40`}>
            <option value="30-days">Last 30 days</option>
            <option value="90-days">Last 3 months</option>
            <option value="12-months">Last 12 months</option>
            <option value="all">All dates</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Rows</span>
          <select name="perPage" defaultValue={pageSize} className={`${CONTROL} min-w-20`}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          Apply
        </button>
      </form>

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <th className="w-32 px-4 py-3 font-semibold">Batch date</th>
                <th className="w-32 px-3 py-3 text-right font-semibold">Amount</th>
                <th className="w-44 px-3 py-3 font-semibold">Fees</th>
                <th className="w-40 px-3 py-3 text-right font-semibold">Transactions</th>
                <th className="w-32 px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Deposit ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((row) => (
                <tr key={row.batch_date} className="hover:bg-orange-50/40">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{row.batch_date}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">{formatCents(Number(row.amount_cents))}</td>
                  <td className="px-3 py-2.5 text-gray-500">Calculated by Stripe</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{Number(row.transactions).toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
                      <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />
                      Paid
                    </span>
                  </td>
                  <td className="truncate px-3 py-2.5 font-mono text-xs text-gray-600" title={row.deposit_id ?? undefined}>{row.deposit_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-gray-800">No payouts found</div>
            <p className="mt-1 text-xs text-gray-500">
              {rows.length ? 'Try changing your search or date filter.' : 'Stripe payouts will appear here after paid card transactions settle.'}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="font-semibold">
            Total <span className="ml-8">{formatCents(totalPaid)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              {filteredRows.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length}`
                : '0 results'}
            </span>
            <Link
              href={payoutHref(params, { page: 1, range, perPage: pageSize })}
              aria-disabled={currentPage === 1}
              className={`rounded px-1 py-1 hover:bg-gray-200 ${currentPage === 1 ? 'pointer-events-none opacity-40' : ''}`}
            >
              First
            </Link>
            <Link
              href={payoutHref(params, { page: Math.max(1, currentPage - 1), range, perPage: pageSize })}
              aria-label="Previous page"
              aria-disabled={currentPage === 1}
              className={`rounded p-1 hover:bg-gray-200 ${currentPage === 1 ? 'pointer-events-none opacity-40' : ''}`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={payoutHref(params, { page: Math.min(totalPages, currentPage + 1), range, perPage: pageSize })}
              aria-label="Next page"
              aria-disabled={currentPage === totalPages}
              className={`rounded p-1 hover:bg-gray-200 ${currentPage === totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={payoutHref(params, { page: totalPages, range, perPage: pageSize })}
              aria-disabled={currentPage === totalPages}
              className={`rounded px-1 py-1 hover:bg-gray-200 ${currentPage === totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              Last
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
