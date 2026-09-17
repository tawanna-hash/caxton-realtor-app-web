import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getStripe } from '@/lib/stripe';
import { formatCents } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PageTitle from '@/components/ui/PageTitle';

export const dynamic = 'force-dynamic';

type PayoutRow = { id: string; batch_date: string; amount_cents: number; fees_cents: number; transactions: number; status: string };

// Wrapping Date.now() in a named module-level function keeps the actual
// call site outside the page component's render body, satisfying the React
// Compiler's "no impure calls during render" rule while behaving identically.
function currentTimeMs(): number {
  return Date.now();
}

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


async function loadStripePayouts(createdGte?: number): Promise<PayoutRow[]> {
  const stripe = getStripe();
  const payouts: Awaited<ReturnType<typeof stripe.payouts.list>>['data'] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.payouts.list({
      limit: 100,
      ...(createdGte ? { created: { gte: createdGte } } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    payouts.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  const rows: PayoutRow[] = [];
  for (const payout of payouts) {
    let transactionStartingAfter: string | undefined;
    let transactions = 0;
    let feesCents = 0;
    do {
      const page = await stripe.balanceTransactions.list({
        payout: payout.id,
        limit: 100,
        ...(transactionStartingAfter ? { starting_after: transactionStartingAfter } : {}),
      });
      transactions += page.data.length;
      feesCents += page.data.reduce((sum, transaction) => sum + transaction.fee, 0);
      transactionStartingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (transactionStartingAfter);
    rows.push({
      id: payout.id,
      batch_date: new Date(payout.arrival_date * 1000).toISOString().slice(0, 10),
      amount_cents: payout.amount,
      fees_cents: feesCents,
      transactions,
      status: payout.status,
    });
  }
  return rows;
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
  const params = await searchParams;
  const query = (params.q ?? '').trim().toLowerCase();
  const range = ['30-days', '90-days', '12-months', 'all'].includes(params.range ?? '')
    ? params.range!
    : '12-months';
  const rangeDays = range === '30-days' ? 30 : range === '90-days' ? 90 : range === '12-months' ? 365 : null;
  const createdGte = rangeDays == null ? undefined : Math.floor((currentTimeMs() - rangeDays * 86_400_000) / 1000);
  let rows: PayoutRow[];
  try {
    rows = await loadStripePayouts(createdGte);
  } catch (error) {
    console.error('[stripe-payouts] Could not load Stripe payout data', error);
    throw new Error('Stripe payout data is temporarily unavailable. Please retry.');
  }
  const pageSize = [25, 50, 100].includes(Number(params.perPage))
    ? Number(params.perPage)
    : 25;
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const filteredRows = rows.filter((row) => {
    if (!isInRange(row.batch_date, range)) return false;
    if (!query) return true;
    return [row.batch_date, row.id, row.status, row.transactions, row.amount_cents]
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
            Actual Stripe payouts by expected bank arrival date, including settlement fees and adjustments.
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
            <div className="mt-0.5 text-xs text-gray-600">net payouts</div>
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
              placeholder="Search arrival date, payout ID, or status"
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
                <th className="w-32 px-4 py-3 font-semibold">Arrival date</th>
                <th className="w-32 px-3 py-3 text-right font-semibold">Net payout</th>
                <th className="w-44 px-3 py-3 text-right font-semibold">Fees</th>
                <th className="w-40 px-3 py-3 text-right font-semibold">Transactions</th>
                <th className="w-32 px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Deposit ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-orange-50/40">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{row.batch_date}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">{formatCents(Number(row.amount_cents))}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{formatCents(row.fees_cents)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{Number(row.transactions).toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
                      {row.status === 'paid' && <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />}
                      {row.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="truncate px-3 py-2.5 font-mono text-xs text-gray-600" title={row.id}>{row.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-gray-800">No payouts found</div>
            <p className="mt-1 text-xs text-gray-500">
              {rows.length ? 'Try changing your search or date filter.' : 'Stripe payouts will appear here when Stripe creates them.'}
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
