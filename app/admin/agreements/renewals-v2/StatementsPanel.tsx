'use client';

// Agreements (Beta): partners with an open balance and their statement of
// account, read-only. Sending stays in Get Paid.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';

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
  if (!rows) return <p className="text-sm text-[#6E6A8A]">Loading statements…</p>;
  const out = rows.reduce((n, r) => n + r.outstanding_cents, 0);
  const over = rows.reduce((n, r) => n + r.overdue_cents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Partners with a balance', String(rows.length)], ['Outstanding', money(out)], ['Overdue', money(over)]] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[#6E6A8A]">{l}</div><div className="mt-1 text-xl font-semibold text-[#261E5A]">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <label className="flex items-center gap-2 text-sm text-[#261E5A]"><input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />Overdue only</label>
        <span className="text-xs text-[#6E6A8A]">{shown.length} of {rows.length} partners</span>
        <Link href="/admin/getpaid/statements" className={`${A.outline} ml-auto`}>Send in Get Paid</Link>
      </div>
      {shown.length === 0 ? <EmptyState title="No statements found" body="Try a different search." /> : (
        <div className="overflow-x-auto">
          <table className={A.table}>
            <thead><tr><th>Partner</th><th>Email</th><th className="text-right">Open invoices</th><th className="text-right">Overdue</th><th className="text-right">Outstanding</th><th>Last sent</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.advertiser_id}>
                  <td className="max-w-[240px] truncate" title={r.advertiser_name}>{r.advertiser_name}</td>
                  <td className="max-w-[220px] truncate" title={r.recipient_email ?? ''}>{r.recipient_email ?? '—'}</td>
                  <td className="text-right">{r.open_invoice_count}</td>
                  <td className={`whitespace-nowrap text-right ${r.overdue_cents > 0 ? 'text-red-700' : ''}`}>{money(r.overdue_cents)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{money(r.outstanding_cents)}</td>
                  <td className="whitespace-nowrap">{day(r.last_sent_at)}{r.send_count > 1 ? ` (${r.send_count}x)` : ''}</td>
                  <td className="whitespace-nowrap"><Link className="text-[#5B3FE3]" href={`/admin/getpaid/statements/${r.advertiser_id}`}>View statement</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
