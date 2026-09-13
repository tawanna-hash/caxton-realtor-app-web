'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import PageTitle from '@/components/ui/PageTitle';

export function SalesTransactionsClient({ invoices }: { invoices: InvoiceWithAdvertiser[] }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  const rows = useMemo(() => invoices.filter((invoice) => {
    const documentType = invoice.number?.startsWith('SR-') ? 'receipt' : 'invoice';
    if (type !== 'all' && documentType !== type) return false;
    if (status !== 'all' && invoice.status !== status) return false;
    const haystack = [invoice.number, invoice.advertiser_name, invoice.bill_to_name, invoice.memo].filter(Boolean).join(' ').toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [invoices, query, status, type]);

  const summary = useMemo(() => invoices.reduce((totals, invoice) => {
    if (invoice.status === 'paid') totals.paid += invoice.total_cents;
    else if (invoice.status !== 'void') totals.open += invoice.total_cents;
    if (invoice.is_overdue) totals.overdue += invoice.total_cents;
    return totals;
  }, { open: 0, overdue: 0, paid: 0 }), [invoices]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Admin · Get Paid</div><PageTitle size="md">Sales transactions</PageTitle></div>
        <Link href="/admin/getpaid/invoices?create=1" className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800">New transaction</Link>
      </div>
      <div className="grid overflow-hidden rounded-md border border-gray-200 bg-white md:grid-cols-3">
        <div className="border-b border-gray-200 p-4 md:border-b-0 md:border-r"><div className="text-xs text-gray-500">Open invoices and credits</div><div className="mt-1 text-xl font-semibold">{formatCents(summary.open)}</div><div className="mt-3 h-2 rounded bg-orange-500" /></div>
        <div className="border-b border-gray-200 p-4 md:border-b-0 md:border-r"><div className="text-xs text-gray-500">Overdue invoices</div><div className="mt-1 text-xl font-semibold">{formatCents(summary.overdue)}</div><div className="mt-3 h-2 rounded bg-amber-500" /></div>
        <div className="p-4"><div className="text-xs text-gray-500">Paid</div><div className="mt-1 text-xl font-semibold">{formatCents(summary.paid)}</div><div className="mt-3 h-2 rounded bg-emerald-500" /></div>
      </div>
      <div className="flex flex-wrap gap-2 rounded-md border border-gray-200 bg-white p-3">
        <select className="rounded border border-gray-300 px-3 py-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All transactions</option><option value="invoice">Invoices</option><option value="receipt">Sales receipts</option></select>
        <select className="rounded border border-gray-300 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="void">Void</option></select>
        <input className="min-w-60 flex-1 rounded border border-gray-300 px-3 py-2 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by number, client, or memo" />
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">No.</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Memo</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((invoice) => <tr key={invoice.id} className="hover:bg-gray-50"><td className="px-4 py-3">{(invoice.issued_at ?? invoice.created_at).slice(0, 10)}</td><td className="px-4 py-3">{invoice.number?.startsWith('SR-') ? 'Sales receipt' : 'Invoice'}</td><td className="px-4 py-3">{invoice.number ?? 'Draft'}</td><td className="px-4 py-3">{invoice.advertiser_name ?? invoice.bill_to_name ?? '—'}</td><td className="max-w-xs truncate px-4 py-3 text-gray-500">{invoice.memo ?? '—'}</td><td className="px-4 py-3 text-right">{formatCents(invoice.total_cents)}</td><td className="px-4 py-3 capitalize">{invoice.is_overdue ? 'Overdue' : invoice.status}</td><td className="px-4 py-3 text-right"><Link className="text-blue-700 hover:underline" href={`/admin/invoices/${invoice.id}/preview`}>View</Link></td></tr>)}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No sales transactions match these filters.</div>}
      </div>
    </div>
  );
}
