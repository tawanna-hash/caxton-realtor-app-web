'use client';

// Agreements (Beta): payouts, read-only, straight from Stripe.

import { useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';

type Payout = { id: string; batch_date: string; amount_cents: number; fees_cents: number; transactions: number; status: string };

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function PayoutsPanel() {
  const [range, setRange] = useState('90-days');
  const [data, setData] = useState<{ range: string; rows: Payout[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/agreements-v2/payouts?range=${range}`, { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); if (live) { setError(null); setData({ range, rows: j.payouts as Payout[] }); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load payouts.'); });
    return () => { live = false; };
  }, [range]);

  const rows = data?.range === range ? data.rows : null;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !term || `${r.id} ${r.batch_date} ${r.status}`.toLowerCase().includes(term));
  }, [rows, q]);

  if (error) return <div className={A.error}>{error}</div>;
  const total = shown.reduce((n, r) => n + r.amount_cents, 0);
  const fees = shown.reduce((n, r) => n + r.fees_cents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([['Payouts', rows ? String(shown.length) : '…'], ['Paid out', rows ? money(total) : '…'], ['Stripe fees', rows ? money(fees) : '…']] as const).map(([l, v]) => (
          <div key={l} className={`${A.card} p-4`}><div className="text-xs text-[#6E6A8A]">{l}</div><div className="mt-1 text-xl font-semibold text-[#261E5A]">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} />
        <select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)} className="anchor-input rounded-full border border-[#D8D5E6] bg-white px-4 py-2 text-sm text-[#261E5A]">
          <option value="30-days">Last 30 days</option><option value="90-days">Last 90 days</option><option value="12-months">Last 12 months</option><option value="all">All time</option>
        </select>
        <a href="/admin/getpaid/stripepayouts" className={`${A.outline} ml-auto`}>Open in Get Paid</a>
      </div>
      {!rows ? <p className="text-sm text-[#6E6A8A]">Loading payouts from Stripe…</p> : shown.length === 0 ? <EmptyState title="No payouts found" body="Try a longer date range." /> : (
        <div className="overflow-x-auto">
          <table className={A.table}>
            <thead><tr><th>Arrival date</th><th>Payout</th><th>Status</th><th className="text-right">Transactions</th><th className="text-right">Fees</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{day(p.batch_date)}</td>
                  <td className="max-w-[200px] truncate font-mono text-xs" title={p.id}>{p.id}</td>
                  <td><span className="rounded-full border border-[#D8D5E6] px-2.5 py-0.5 text-xs capitalize">{p.status.replaceAll('_', ' ')}</span></td>
                  <td className="text-right">{p.transactions.toLocaleString()}</td>
                  <td className="whitespace-nowrap text-right">{money(p.fees_cents)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{money(p.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
