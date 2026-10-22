'use client';

// Billing > Statements: partners with an open balance, each with a full
// statement of account page. Emailing statements is off in beta.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Row = { advertiser_id: number; advertiser_name: string; recipient_email: string | null; outstanding_cents: number; overdue_cents: number; open_invoice_count: number; last_sent_at: string | null; send_count: number };

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never');

export default function StatementsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    fetch('/api/admin/agreements-v2/statements', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setRows(j.partners as Row[]); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load statements.'));
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!overdueOnly || r.overdue_cents > 0) && (!term || `${r.advertiser_name} ${r.recipient_email ?? ''}`.toLowerCase().includes(term)));
  }, [rows, q, overdueOnly]);

  if (error) return <div className={A.error}>{error}</div>;
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading statements…</p>;
  const out = rows.reduce((n, r) => n + r.outstanding_cents, 0);
  const over = rows.reduce((n, r) => n + r.overdue_cents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Partners with a balance', String(rows.length)], ['Outstanding', money(out)], ['Overdue', money(over)]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-5`}><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <label className="flex items-center gap-2 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />Overdue only</label>
        <span className="text-xs text-[color:var(--ds-body)]">{shown.length} of {rows.length} partners</span>
        <span className="ml-auto text-xs text-[color:var(--ds-body)]">Open a statement to send it or copy its payment links.</span>
      </div>
      {shown.length === 0 ? <EmptyState title="No statements found" body="Try a different search." /> : (
        <div className="overflow-x-auto">
          <SortTable rows={shown} cols={[{ label: 'Partner', get: (r) => r.advertiser_name }, { label: 'Email', get: (r) => r.recipient_email }, { label: 'Open invoices', get: (r) => r.open_invoice_count, className: 'text-right' }, { label: 'Overdue', get: (r) => r.overdue_cents, className: 'text-right' }, { label: 'Outstanding', get: (r) => r.outstanding_cents, className: 'text-right' }, { label: 'Last sent', get: (r) => r.last_sent_at }, { label: '' }]} className={A.table}>
{(rws) => (<>
              {rws.map((r) => (
                <tr key={r.advertiser_id}>
                  <td className="max-w-[240px] truncate" title={r.advertiser_name}>{r.advertiser_name}</td>
                  <td className="max-w-[220px] truncate" title={r.recipient_email ?? ''}>{r.recipient_email ?? '—'}</td>
                  <td className="text-right">{r.open_invoice_count}</td>
                  <td className={`whitespace-nowrap text-right ${r.overdue_cents > 0 ? 'text-red-700' : ''}`}>{money(r.overdue_cents)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{money(r.outstanding_cents)}</td>
                  <td className="whitespace-nowrap">{day(r.last_sent_at)}{r.send_count > 1 ? ` (${r.send_count}x)` : ''}</td>
                  <td className="whitespace-nowrap"><Link className="text-[color:var(--ds-primary)]" href={`/admin/billing-hub/statements/${r.advertiser_id}`}>View statement</Link></td>
                </tr>
              ))}
            </>)}
</SortTable>
        </div>
      )}
    </div>
  );
}
