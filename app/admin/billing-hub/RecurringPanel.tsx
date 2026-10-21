'use client';

// Agreements (Beta): every recurring invoice schedule from Get Paid, read-only.
// Reads the same schedule records, so nothing is duplicated.

import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Sch = {
  id: string; name: string; advertiser_name: string | null; status: string; frequency: string; interval_count: number | null;
  amount_cents: number; tax_cents: number | null; next_run_at: string | null; end_date: string | null;
  max_occurrences: number | null; occurrences_generated: number | null; auto_send: boolean; source: string | null; agreement_id: string | null;
};

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const every = (s: Sch) => { const n = s.interval_count ?? 1; const u = s.frequency.replace(/ly$/, '').replace('dai', 'day'); return n > 1 ? `Every ${n} ${u}s` : s.frequency[0].toUpperCase() + s.frequency.slice(1); };

export default function RecurringPanel() {
  const [rows, setRows] = useState<Sch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    fetch('/api/admin/recurring-invoices', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setRows(j.schedules as Sch[]); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load recurring invoices.'));
  }, []);

  const statuses = useMemo(() => [...new Set((rows ?? []).map((r) => r.status))].sort(), [rows]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (status === 'all' || r.status === status) && (!term || `${r.name} ${r.advertiser_name ?? ''}`.toLowerCase().includes(term)));
  }, [rows, q, status]);
  const monthly = useMemo(() => (rows ?? []).filter((r) => r.status === 'active' && r.frequency === 'monthly').reduce((n, r) => n + r.amount_cents + (r.tax_cents ?? 0), 0), [rows]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading recurring invoices…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Active schedules', String(rows.filter((r) => r.status === 'active').length)], ['Drafts (paused)', String(rows.filter((r) => r.status === 'paused').length)], ['Active monthly billing', money(monthly)]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]">
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span className="text-xs text-[color:var(--ds-body)]">{shown.length} of {rows.length} schedules</span>
        <a href="/admin/getpaid/reoccuringpayments" className={`${A.outline} ml-auto`}>Manage in Get Paid</a>
      </div>
      {shown.length === 0 ? <EmptyState title="No recurring invoices found" body="Try a different search or status." /> : (
        <div className="overflow-x-auto">
          <SortTable rows={shown} cols={[{ label: 'Schedule', get: (r) => r.name }, { label: 'Client', get: (r) => r.advertiser_name }, { label: 'Status', get: (r) => r.status }, { label: 'Repeats', get: (r) => every(r) }, { label: 'Amount', get: (r) => r.amount_cents + (r.tax_cents ?? 0), className: 'text-right' }, { label: 'Next invoice', get: (r) => r.next_run_at }, { label: 'Sent', get: (r) => r.occurrences_generated ?? 0 }, { label: 'Ends', get: (r) => r.end_date }]} className={A.table}>
{(rws) => (<>
              {rws.map((s) => (
                <tr key={s.id}>
                  <td className="max-w-[260px] truncate" title={s.name}>{s.name}{s.source === 'agreement' && <span className="ml-2 rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[10px] text-[color:var(--ds-body)]">From agreement</span>}</td>
                  <td>{s.advertiser_name ?? '—'}</td>
                  <td><span className="rounded-full border border-[color:var(--ds-line)] px-2.5 py-0.5 text-xs capitalize">{s.status === 'paused' ? 'draft' : s.status}</span></td>
                  <td className="whitespace-nowrap">{every(s)}</td>
                  <td className="whitespace-nowrap text-right">{money(s.amount_cents + (s.tax_cents ?? 0))}</td>
                  <td className="whitespace-nowrap">{day(s.next_run_at)}</td>
                  <td className="whitespace-nowrap">{s.occurrences_generated ?? 0}{s.max_occurrences ? ` of ${s.max_occurrences}` : ''}</td>
                  <td className="whitespace-nowrap">{day(s.end_date)}</td>
                </tr>
              ))}
            </>)}
</SortTable>
        </div>
      )}
    </div>
  );
}
