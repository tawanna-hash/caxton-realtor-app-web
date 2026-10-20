'use client';

// Agreements (Beta): every invoice from Get Paid, read-only, in the Anchor-style
// Invoices layout. Reads the same invoice records, so nothing is duplicated.

import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';

type Inv = {
  id: string; number: string | null; advertiser_name: string | null; agreement_id: string | null; status: string;
  total_cents: number; amount_paid_cents: number; balance_cents: number; issued_at: string | null; due_date: string | null; paid_at: string | null;
  is_overdue: boolean; created_at: string; memo: string | null;
};

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const PAGE = 50;

function Status({ i }: { i: Inv }) {
  const s = i.is_overdue ? 'overdue' : i.status;
  const tone = s === 'paid' ? 'border-green-600 text-green-700' : s === 'overdue' ? 'border-red-500 text-red-700' : s === 'void' ? 'border-[#9A97B3] text-[#6E6A8A]' : s === 'draft' ? 'border-[#9A97B3] text-[#6E6A8A]' : 'border-[#5B3FE3] text-[#5B3FE3]';
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${tone}`}>{s}</span>;
}

export default function InvoicesPanel() {
  const [rows, setRows] = useState<Inv[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/api/admin/invoices', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setRows(j.invoices as Inv[]); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load invoices.'));
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((i) => {
      const s = i.is_overdue ? 'overdue' : i.status;
      if (status !== 'all' && s !== status) return false;
      return !term || `${i.number ?? ''} ${i.advertiser_name ?? ''} ${i.memo ?? ''}`.toLowerCase().includes(term);
    });
  }, [rows, q, status]);

  const totals = useMemo(() => {
    const live = (rows ?? []).filter((i) => i.status !== 'void' && i.status !== 'draft');
    return {
      outstanding: live.reduce((n, i) => n + i.balance_cents, 0),
      overdue: live.filter((i) => i.is_overdue).reduce((n, i) => n + i.balance_cents, 0),
      paid: live.reduce((n, i) => n + i.amount_paid_cents, 0),
    };
  }, [rows]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!rows) return <p className="text-sm text-[#6E6A8A]">Loading invoices…</p>;
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Outstanding', totals.outstanding], ['Overdue', totals.overdue], ['Collected', totals.paid]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[#6E6A8A]">{l}</div><div className="mt-1 text-xl font-semibold text-[#261E5A]">{money(v)}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="anchor-input rounded-full border border-[#D8D5E6] bg-white px-4 py-2 text-sm text-[#261E5A]">
          {['all', 'draft', 'sent', 'overdue', 'paid', 'void'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span className="text-xs text-[#6E6A8A]">{shown.length} of {rows.length} invoices</span>
        <a href="/admin/getpaid/invoices" className={`${A.outline} ml-auto`}>Manage in Get Paid</a>
      </div>
      {shown.length === 0 ? <EmptyState title="No invoices found" body="Try a different search or status." /> : (
        <div className="overflow-x-auto">
          <table className={A.table}>
            <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Agreement</th></tr></thead>
            <tbody>
              {pageRows.map((i) => (
                <tr key={i.id}>
                  <td className="max-w-[180px] truncate whitespace-nowrap font-medium text-[#261E5A]" title={i.number ?? undefined}>{i.number ?? 'Draft'}</td>
                  <td className="min-w-[180px]">{i.advertiser_name ?? '—'}</td>
                  <td><Status i={i} /></td>
                  <td className="whitespace-nowrap">{day(i.issued_at ?? i.created_at)}</td>
                  <td className="whitespace-nowrap">{day(i.due_date)}</td>
                  <td className="whitespace-nowrap text-right">{money(i.total_cents)}</td>
                  <td className="whitespace-nowrap text-right">{money(i.amount_paid_cents)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{money(i.balance_cents)}</td>
                  <td>{i.agreement_id ? <span className="text-xs text-[#5B3FE3]">Linked</span> : <span className="text-xs text-[#9A97B3]">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > PAGE && (
        <div className="flex items-center justify-end gap-3 text-sm text-[#6E6A8A]">
          <button type="button" className={A.small} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(shown.length / PAGE)}</span>
          <button type="button" className={A.small} disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
