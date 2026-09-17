'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import { formatCents } from '@/lib/invoices';
import StatementEmailButton from './StatementEmailButton';

export type StatementPartnerRow = {
  advertiser_id: number;
  advertiser_name: string;
  recipient_email: string | null;
  outstanding_cents: number;
  overdue_cents: number;
  open_invoice_count: number;
  last_sent_at: string | Date | null;
  send_count: number;
};

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500';
type SortKey = 'partner' | 'email' | 'invoices' | 'overdue' | 'outstanding';
type SortDir = 'asc' | 'desc';
type StatementHistory = { id: string; recipient_email: string; subject: string; sent_at: string; outstanding_cents: number };

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className = '',
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`${className} px-2 py-3 font-semibold`}>
      <button
        type="button"
        className={`flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

function SummaryMetric({
  amount,
  count,
  label,
}: {
  amount?: number;
  count: number;
  label: string;
}) {
  return (
    <div className="min-w-0 px-3 py-1 first:pl-0">
      <div className="text-lg font-semibold leading-tight text-gray-900">
        {amount == null ? count.toLocaleString() : formatCents(amount)}
      </div>
      <div className="mt-0.5 truncate text-xs text-gray-600">{label}</div>
    </div>
  );
}

function StatementCard({
  partner,
  onOpenHistory,
  onSent,
}: {
  partner: StatementPartnerRow;
  onOpenHistory: () => void;
  onSent: (sentAt: string) => void;
}) {
  return (
    <div className="space-y-2.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-900">{partner.advertiser_name}</div>
          <div className="truncate text-xs text-gray-600">{partner.recipient_email ?? '— no email on file'}</div>
        </div>
        <div className="whitespace-nowrap text-right text-sm font-semibold text-gray-900">{formatCents(partner.outstanding_cents)}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-gray-400">Invoices</div>
          <div className="text-gray-700">{Number(partner.open_invoice_count).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-400">Overdue</div>
          <div className="font-medium text-orange-700">{partner.overdue_cents ? formatCents(partner.overdue_cents) : '—'}</div>
        </div>
        <div>
          <div className="text-gray-400">Last sent</div>
          <div className="text-gray-600">
            {partner.last_sent_at ? (
              <>
                {new Date(partner.last_sent_at).toLocaleDateString('en-US')}
                <span className="ml-1 text-[11px] text-gray-400">({Number(partner.send_count)}x)</span>
              </>
            ) : '—'}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-2.5 text-xs">
        <Link href={`/admin/getpaid/statements/${partner.advertiser_id}`} className="font-medium text-orange-700 hover:underline">
          View
        </Link>
        <StatementEmailButton
          advertiserId={partner.advertiser_id}
          advertiserName={partner.advertiser_name}
          recipient={partner.recipient_email ?? ''}
          compact
          onSent={({ sentAt }) => onSent(sentAt)}
        />
        <button type="button" className="font-medium text-gray-700 hover:underline" onClick={onOpenHistory}>History</button>
      </div>
    </div>
  );
}

export default function StatementsClient({ partners }: { partners: StatementPartnerRow[] }) {
  const [rows, setRows] = useState(partners);
  const [query, setQuery] = useState('');
  const [balance, setBalance] = useState<'all' | 'overdue' | 'current'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('outstanding');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [historyPartner, setHistoryPartner] = useState<StatementPartnerRow | null>(null);
  const [history, setHistory] = useState<StatementHistory[]>([]);
  const [historyError, setHistoryError] = useState('');
  const historyRequest = useRef(0);

  const openHistory = async (partner: StatementPartnerRow) => {
    const requestId = ++historyRequest.current;
    setHistoryPartner(partner);
    setHistory([]);
    setHistoryError('');
    try {
      const response = await fetch(`/api/admin/advertisers/${partner.advertiser_id}/statement-history`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (requestId !== historyRequest.current) return;
      if (!response.ok) throw new Error(data.error ?? 'Could not load statement history.');
      setHistory(data.history ?? []);
    } catch (error) {
      if (requestId === historyRequest.current) {
        setHistoryError(error instanceof Error ? error.message : 'Could not load statement history.');
      }
    }
  };
  const deleteHistory = async (entry: StatementHistory) => {
    if (!historyPartner) return;
    const confirmation = window.prompt(`Permanent deletion cannot be undone. Type this statement history ID to delete it:\n${entry.id}`);
    if (confirmation !== entry.id) { setHistoryError('History record was not deleted: the typed ID did not match.'); return; }
    const response = await fetch(`/api/admin/advertisers/${historyPartner.advertiser_id}/statement-history`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history_id: entry.id, permanent: true, confirmation_id: confirmation }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setHistoryError(data.error ?? 'Could not permanently delete statement history.'); return; }
    setHistory((current) => current.filter((item) => item.id !== entry.id));
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchingRows = rows.filter((partner) => {
      if (balance === 'overdue' && partner.overdue_cents <= 0) return false;
      if (balance === 'current' && partner.overdue_cents > 0) return false;
      return !needle || partner.advertiser_name.toLowerCase().includes(needle) ||
        (partner.recipient_email ?? '').toLowerCase().includes(needle);
    });
    return matchingRows.sort((a, b) => {
      const left =
        sortKey === 'partner' ? a.advertiser_name.toLowerCase() :
        sortKey === 'email' ? (a.recipient_email ?? '').toLowerCase() :
        sortKey === 'invoices' ? Number(a.open_invoice_count) :
        sortKey === 'overdue' ? a.overdue_cents : a.outstanding_cents;
      const right =
        sortKey === 'partner' ? b.advertiser_name.toLowerCase() :
        sortKey === 'email' ? (b.recipient_email ?? '').toLowerCase() :
        sortKey === 'invoices' ? Number(b.open_invoice_count) :
        sortKey === 'overdue' ? b.overdue_cents : b.outstanding_cents;
      const comparison = typeof left === 'string'
        ? left.localeCompare(String(right))
        : Number(left) - Number(right);
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [balance, query, rows, sortDir, sortKey]);

  const sort = (key: SortKey) => {
    if (key === sortKey) setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'partner' || key === 'email' ? 'asc' : 'desc');
    }
  };

  const totalOutstanding = rows.reduce((sum, partner) => sum + partner.outstanding_cents, 0);
  const totalOverdue = rows.reduce((sum, partner) => sum + partner.overdue_cents, 0);
  const invoiceCount = rows.reduce((sum, partner) => sum + Number(partner.open_invoice_count), 0);
  const filteredTotal = filtered.reduce((sum, partner) => sum + partner.outstanding_cents, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header>
        <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
          Admin · Get Paid
        </div>
        <PageTitle size="md">Statements</PageTitle>
      </header>

      <section aria-label="Statement summary" className="bg-white">
        <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
          <SummaryMetric count={rows.length} label="partners with a balance" />
          <SummaryMetric count={invoiceCount} label="outstanding invoices" />
          <SummaryMetric amount={totalOverdue} count={0} label="overdue" />
          <SummaryMetric amount={totalOutstanding} count={0} label="total outstanding" />
        </div>
        <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
          <div
            className="bg-orange-600"
            style={{ width: `${totalOutstanding ? (totalOverdue / totalOutstanding) * 100 : 0}%` }}
          />
          <div className="flex-1 bg-orange-300" />
        </div>
      </section>

      <section aria-label="Statement filters" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Balance</span>
          <select
            className={`${CONTROL} min-w-40`}
            value={balance}
            onChange={(event) => setBalance(event.target.value as typeof balance)}
          >
            <option value="all">All balances</option>
            <option value="overdue">Overdue</option>
            <option value="current">Not yet due</option>
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
              placeholder="Partner or billing email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
      </section>

      <section className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-200 md:hidden">
          {filtered.map((partner) => (
            <StatementCard
              key={partner.advertiser_id}
              partner={partner}
              onOpenHistory={() => void openHistory(partner)}
              onSent={(sentAt) => setRows((current) => current.map((row) =>
                row.advertiser_id === partner.advertiser_id
                  ? { ...row, last_sent_at: sentAt, send_count: Number(row.send_count) + 1 }
                  : row,
              ))}
            />
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[940px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <SortableTh className="w-64 pl-3" label="Partner" sortKey="partner" activeKey={sortKey} dir={sortDir} onSort={sort} />
                <SortableTh className="w-64" label="Billing email" sortKey="email" activeKey={sortKey} dir={sortDir} onSort={sort} />
                <SortableTh className="w-28" label="Invoices" sortKey="invoices" activeKey={sortKey} dir={sortDir} onSort={sort} align="right" />
                <SortableTh className="w-36" label="Overdue" sortKey="overdue" activeKey={sortKey} dir={sortDir} onSort={sort} align="right" />
                <SortableTh className="w-36" label="Outstanding" sortKey="outstanding" activeKey={sortKey} dir={sortDir} onSort={sort} align="right" />
                <th className="w-36 px-2 py-3 text-left font-semibold">Last sent</th>
                <th className="w-52 px-3 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((partner) => (
                <tr key={partner.advertiser_id} className="hover:bg-orange-50/40">
                  <td className="truncate px-3 py-2.5 font-medium text-gray-900">
                    {partner.advertiser_name}
                  </td>
                  <td
                    className="truncate px-2 py-2.5 text-gray-600"
                    title={partner.recipient_email ?? ''}
                  >
                    {partner.recipient_email ?? '— no email on file'}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-700">
                    {Number(partner.open_invoice_count).toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium text-orange-700">
                    {partner.overdue_cents ? formatCents(partner.overdue_cents) : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium text-gray-900">
                    {formatCents(partner.outstanding_cents)}
                  </td>
                  <td className="px-2 py-2.5 text-gray-600">
                    {partner.last_sent_at ? (
                      <>
                        <div>{new Date(partner.last_sent_at).toLocaleDateString('en-US')}</div>
                        <div className="text-[11px] text-gray-400">{Number(partner.send_count)} sent</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/getpaid/statements/${partner.advertiser_id}`}
                      className="font-medium text-orange-700 hover:underline"
                    >
                      View
                    </Link>
                    <span className="ml-4">
                      <StatementEmailButton
                        advertiserId={partner.advertiser_id}
                        advertiserName={partner.advertiser_name}
                        recipient={partner.recipient_email ?? ''}
                        compact
                        onSent={({ sentAt }) => {
                          setRows((current) => current.map((row) =>
                            row.advertiser_id === partner.advertiser_id
                              ? { ...row, last_sent_at: sentAt, send_count: Number(row.send_count) + 1 }
                              : row,
                          ));
                        }}
                      />
                    </span>
                    <button type="button" className="ml-4 font-medium text-gray-700 hover:underline" onClick={() => void openHistory(partner)}>History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-gray-800">No statements found</div>
            <p className="mt-1 text-sm text-gray-500">
              {rows.length
                ? 'Adjust your search or balance filter.'
                : 'There are no partners with an outstanding balance.'}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div>
            Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} partners
          </div>
          <div className="font-semibold">Total <span className="ml-8">{formatCents(filteredTotal)}</span></div>
        </div>
      </section>
      {historyPartner && (
        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm" aria-label="Statement send history">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900">Send history · {historyPartner.advertiser_name}</h2><p className="text-xs text-gray-500">Sent records are retained by default. Permanent deletion requires the history ID.</p></div><button type="button" onClick={() => { historyRequest.current += 1; setHistoryPartner(null); }} className="text-sm text-gray-600 hover:underline">Close</button></div>
          {historyError && <p className="mt-3 text-sm text-rose-700">{historyError}</p>}
          <div className="mt-3 divide-y divide-gray-200">{history.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><div className="font-medium text-gray-800">{entry.recipient_email}</div><div className="text-xs text-gray-500">{new Date(entry.sent_at).toLocaleString('en-US')} · {entry.subject}</div></div><button type="button" className="text-xs font-medium text-rose-700 hover:underline" onClick={() => void deleteHistory(entry)}>Permanent delete</button></div>)}</div>
          {!historyError && history.length === 0 && <p className="mt-3 text-sm text-gray-500">No sent statements recorded.</p>}
        </section>
      )}
    </div>
  );
}
