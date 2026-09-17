'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Search,
  Trash2,
} from 'lucide-react';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, outstandingCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { PaymentLinkDrawer } from '@/app/admin/ar/PaymentActionDrawers';
import PageTitle from '@/components/ui/PageTitle';

type LinkStatusFilter = 'all' | 'open' | 'overdue' | 'paid' | 'void';
type DateFilter = 'all' | '30-days' | '3-months' | '12-months';

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
const ORANGE_BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function linkStatus(invoice: InvoiceWithAdvertiser): Exclude<LinkStatusFilter, 'all'> {
  if (invoice.status === 'paid') return 'paid';
  if (invoice.status === 'void') return 'void';
  if (invoice.is_overdue || invoice.status === 'overdue') return 'overdue';
  return 'open';
}

function statusLabel(status: Exclude<LinkStatusFilter, 'all'>) {
  if (status === 'paid') return 'Paid';
  if (status === 'void') return 'Void';
  if (status === 'overdue') return 'Overdue';
  return 'Open';
}

function SummaryMetric({
  amount,
  count,
  label,
}: {
  amount: number;
  count: number;
  label: string;
}) {
  return (
    <div className="min-w-0 px-3 py-1 first:pl-0">
      <div className="text-lg font-semibold leading-tight text-gray-900">{formatCents(amount)}</div>
      <div className="mt-0.5 truncate text-xs text-gray-600">
        {count.toLocaleString()} {label}
      </div>
    </div>
  );
}

function StatusCell({ invoice }: { invoice: InvoiceWithAdvertiser }) {
  const status = linkStatus(invoice);
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />
        Paid
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <AlertCircle className="h-4 w-4 text-orange-600" aria-hidden="true" />
        Overdue
      </span>
    );
  }
  return <span className="whitespace-nowrap text-gray-700">{statusLabel(status)}</span>;
}

export function PaymentLinksClient({
  initialInvoices,
  advertisers,
}: {
  initialInvoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [creating, setCreating] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LinkStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const selectedInvoice = selectedInvoiceId
    ? invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null
    : null;

  const links = useMemo(
    () => invoices.filter((invoice) => Boolean(invoice.stripe_payment_link_url)),
    [invoices],
  );

  const summary = useMemo(() => {
    const paid = links.filter((invoice) => linkStatus(invoice) === 'paid');
    const overdue = links.filter((invoice) => linkStatus(invoice) === 'overdue');
    const open = links.filter((invoice) => linkStatus(invoice) === 'open');
    return {
      totalAmount: links.reduce((sum, invoice) => sum + outstandingCents(invoice), 0),
      paidAmount: paid.reduce((sum, invoice) => sum + outstandingCents(invoice), 0),
      overdueAmount: overdue.reduce((sum, invoice) => sum + outstandingCents(invoice), 0),
      openAmount: open.reduce((sum, invoice) => sum + outstandingCents(invoice), 0),
      paidCount: paid.length,
      overdueCount: overdue.length,
      openCount: open.length,
    };
  }, [links]);

  const filteredLinks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return links.filter((invoice) => {
      if (status !== 'all' && linkStatus(invoice) !== status) return false;
      if (dateFilter !== 'all') {
        const cutoff = new Date();
        if (dateFilter === '30-days') cutoff.setDate(cutoff.getDate() - 30);
        else cutoff.setMonth(cutoff.getMonth() - (dateFilter === '3-months' ? 3 : 12));
        if (new Date(invoice.updated_at).getTime() < cutoff.getTime()) return false;
      }
      if (!normalizedQuery) return true;
      return [
        invoice.number,
        invoice.advertiser_name,
        invoice.bill_to_name,
        invoice.bill_to_email,
        invoice.stripe_payment_link_url,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [dateFilter, links, query, status]);

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredLinks.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredAmount = filteredLinks.reduce((sum, invoice) => sum + outstandingCents(invoice), 0);

  const updateFilters = (update: () => void) => {
    update();
    setPage(1);
  };

  const reload = async () => {
    const response = await fetch('/api/admin/invoices', { cache: 'no-store' });
    if (!response.ok) {
      setError('Could not refresh payment links.');
      return;
    }
    setInvoices((await response.json()).invoices ?? []);
    setError('');
  };

  const closeDrawer = () => {
    setCreating(false);
    setSelectedInvoiceId(null);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteLink = async (invoice: InvoiceWithAdvertiser) => {
    if (!window.confirm(`Remove the payment link for invoice ${invoice.number ?? 'this invoice'}? This does not delete the invoice.`)) {
      return;
    }
    setDeletingId(invoice.id);
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}/payment-link`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? 'Could not delete the payment link.');
        return;
      }
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
            Admin · Get Paid
          </div>
          <PageTitle size="md">Payment links</PageTitle>
        </div>
      </header>

      <section aria-label="Payment link summary" className="bg-white">
        <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
          <SummaryMetric amount={summary.totalAmount} count={links.length} label="created links" />
          <SummaryMetric amount={summary.openAmount} count={summary.openCount} label="open links" />
          <SummaryMetric amount={summary.overdueAmount} count={summary.overdueCount} label="overdue links" />
          <SummaryMetric amount={summary.paidAmount} count={summary.paidCount} label="paid links" />
        </div>
        <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
          <div
            className="bg-orange-400"
            style={{ width: `${summary.totalAmount ? (summary.openAmount / summary.totalAmount) * 100 : 0}%` }}
          />
          <div
            className="bg-orange-600"
            style={{ width: `${summary.totalAmount ? (summary.overdueAmount / summary.totalAmount) * 100 : 0}%` }}
          />
          <div className="flex-1 bg-emerald-600" />
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section aria-label="Payment link filters" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Status</span>
          <select
            className={`${CONTROL} min-w-36`}
            value={status}
            onChange={(event) =>
              updateFilters(() => setStatus(event.target.value as LinkStatusFilter))
            }
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Last updated</span>
          <select
            className={`${CONTROL} min-w-36`}
            value={dateFilter}
            onChange={(event) => updateFilters(() => setDateFilter(event.target.value as DateFilter))}
          >
            <option value="all">All dates</option>
            <option value="30-days">Last 30 days</option>
            <option value="3-months">Last 3 months</option>
            <option value="12-months">Last 12 months</option>
          </select>
        </label>
        <label className="min-w-64 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              className={`${CONTROL} w-full pl-9`}
              placeholder="Invoice, client, email, or link"
              value={query}
              onChange={(event) => updateFilters(() => setQuery(event.target.value))}
            />
          </span>
        </label>
        <button type="button" className={`${ORANGE_BUTTON} ml-auto`} onClick={() => setCreating(true)}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Create payment link
        </button>
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <th className="w-32 px-3 py-3 font-semibold">Updated</th>
                <th className="w-36 px-2 py-3 font-semibold">Invoice no.</th>
                <th className="w-56 px-2 py-3 font-semibold">Client</th>
                <th className="w-56 px-2 py-3 font-semibold">Email</th>
                <th className="w-28 px-2 py-3 text-right font-semibold">Amount</th>
                <th className="w-32 px-2 py-3 font-semibold">Status</th>
                <th className="w-56 px-3 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-orange-50/40">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                    {formatDate(invoice.updated_at)}
                  </td>
                  <td className="truncate px-2 py-2.5 font-medium text-gray-900" title={invoice.number ?? 'Draft'}>
                    {invoice.number ?? 'Draft'}
                  </td>
                  <td
                    className="truncate px-2 py-2.5 text-gray-800"
                    title={invoice.advertiser_name ?? invoice.bill_to_name ?? ''}
                  >
                    {invoice.advertiser_name ?? invoice.bill_to_name ?? '—'}
                  </td>
                  <td className="truncate px-2 py-2.5 text-gray-600" title={invoice.bill_to_email ?? ''}>
                    {invoice.bill_to_email ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium text-gray-900">
                    {formatCents(outstandingCents(invoice))}
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusCell invoice={invoice} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <button
                      type="button"
                      className="font-medium text-orange-700 hover:underline"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                    >
                      View/Edit
                    </button>
                    {isSafeHttpUrl(invoice.stripe_payment_link_url) ? (
                      <a
                        className="ml-4 inline-flex items-center gap-1 font-medium text-orange-700 hover:underline"
                        href={invoice.stripe_payment_link_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open link
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="ml-4 text-gray-400" title="Stored link is not a safe HTTP(S) URL">
                        Invalid link
                      </span>
                    )}
                    <button
                      type="button"
                      className="ml-4 inline-flex items-center gap-1 font-medium text-red-600 hover:underline disabled:opacity-50"
                      onClick={() => deleteLink(invoice)}
                      disabled={deletingId === invoice.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {deletingId === invoice.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && (
          <div className="p-12 text-center">
            <Link2 className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
            <div className="mt-3 text-sm font-medium text-gray-800">No payment links found</div>
            <p className="mt-1 text-sm text-gray-500">
              {links.length ? 'Adjust your filters to see more results.' : 'Create a secure link for an unpaid invoice.'}
            </p>
            {!links.length && (
              <button
                type="button"
                className="mt-4 text-sm font-medium text-orange-700 hover:underline"
                onClick={() => setCreating(true)}
              >
                Create payment link
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="font-semibold">
            Total <span className="ml-8">{formatCents(filteredAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select
                className="rounded border border-gray-300 bg-white px-1 py-1"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <span>
              {filteredLinks.length
                ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredLinks.length)} of ${filteredLinks.length}`
                : '0 results'}
            </span>
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setPage(1)}
            >
              First
            </button>
            <button
              type="button"
              aria-label="Previous page"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded p-1 hover:bg-gray-200 disabled:opacity-40"
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      </section>

      {(creating || selectedInvoice) && (
        <PaymentLinkDrawer
          invoices={invoices}
          advertisers={advertisers}
          initialInvoiceId={selectedInvoice?.id}
          onClose={closeDrawer}
          onSaved={reload}
          onError={setError}
        />
      )}
    </div>
  );
}
