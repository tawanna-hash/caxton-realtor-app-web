'use client';

// Agreements (Beta): every invoice from Get Paid, read-only, in the Anchor-style
// Invoices layout. Reads the same invoice records, so nothing is duplicated.

import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

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
  const tone = s === 'paid' ? 'border-green-600 text-green-700' : s === 'overdue' ? 'border-red-500 text-red-700' : s === 'void' ? 'border-[color:var(--ds-placeholder)] text-[color:var(--ds-body)]' : s === 'draft' ? 'border-[color:var(--ds-placeholder)] text-[color:var(--ds-body)]' : 'border-[color:var(--ds-primary)] text-[color:var(--ds-primary)]';
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
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading invoices…</p>;
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Outstanding', totals.outstanding], ['Overdue', totals.overdue], ['Collected', totals.paid]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{money(v)}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]">
          {['all', 'draft', 'sent', 'overdue', 'paid', 'void'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span className="text-xs text-[color:var(--ds-body)]">{shown.length} of {rows.length} invoices</span>
        <a href="/admin/getpaid/invoices" className={`${A.outline} ml-auto`}>Manage in Get Paid</a>
      </div>
      {shown.length === 0 ? <EmptyState title="No invoices found" body="Try a different search or status." /> : (
        <div className="overflow-x-auto">
          <SortTable rows={shown} cols={[{ label: 'Invoice', get: (r) => r.number }, { label: 'Client', get: (r) => r.advertiser_name }, { label: 'Status', get: (r) => r.status }, { label: 'Issued', get: (r) => r.issued_at ?? r.created_at }, { label: 'Due', get: (r) => r.due_date }, { label: 'Total', get: (r) => r.total_cents, className: 'text-right' }, { label: 'Paid', get: (r) => r.amount_paid_cents, className: 'text-right' }, { label: 'Balance', get: (r) => r.balance_cents, className: 'text-right' }, { label: 'Agreement', get: (r) => (r.agreement_id ? 1 : 0) }]} className={A.table} offset={page * PAGE} limit={PAGE}>
{(rws) => (<>
              {rws.map((i) => (
                <tr key={i.id}>
                  <td className="max-w-[180px] truncate whitespace-nowrap font-medium text-[color:var(--ds-ink)]" title={i.number ?? undefined}>{i.number ?? 'Draft'}</td>
                  <td className="min-w-[180px]">{i.advertiser_name ?? '—'}</td>
                  <td><Status i={i} /></td>
                  <td className="whitespace-nowrap">{day(i.issued_at ?? i.created_at)}</td>
                  <td className="whitespace-nowrap">{day(i.due_date)}</td>
                  <td className="whitespace-nowrap text-right">{money(i.total_cents)}</td>
                  <td className="whitespace-nowrap text-right">{money(i.amount_paid_cents)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{money(i.balance_cents)}</td>
                  <td>{i.agreement_id ? <span className="text-xs text-[color:var(--ds-primary)]">Linked</span> : <span className="text-xs text-[color:var(--ds-placeholder)]">None</span>}</td>
                </tr>
              ))}
            </>)}
</SortTable>
        </div>
      )}
      {shown.length > PAGE && (
        <div className="flex items-center justify-end gap-3 text-sm text-[color:var(--ds-body)]">
          <button type="button" className={A.small} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(shown.length / PAGE)}</span>
          <button type="button" className={A.small} disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
