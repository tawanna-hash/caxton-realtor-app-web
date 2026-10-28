'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, SearchBox } from '@/components/anchor/ui';
import type { StripeTxn } from '@/app/api/admin/stripe/transactions/route';

const usd = (c: number | null) => (c == null ? '—' : `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const when = (v: string) => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const LABEL: Record<StripeTxn['status'], string> = { succeeded: 'Succeeded', pending: 'Pending', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Partly refunded', disputed: 'Disputed' };
const TONE: Record<StripeTxn['status'], string> = { succeeded: '#1a7f4b', pending: '#8a6100', failed: '#b00020', refunded: '#5b5870', partially_refunded: '#5b5870', disputed: '#b00020' };

export default function StripeTransactionsPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [scope, setScope] = useState<'client' | 'all'>('client');
  const [rows, setRows] = useState<StripeTxn[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const qs = useCallback((after?: string) => {
    const p = new URLSearchParams({ limit: '100' });
    if (scope === 'client') p.set('advertiser_id', String(clientId));
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (after) p.set('starting_after', after);
    return p.toString();
  }, [scope, clientId, from, to]);

  const load = useCallback(async (after?: string) => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/admin/stripe/transactions?${qs(after)}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed');
      setRows((prev) => (after ? [...prev, ...j.transactions] : j.transactions));
      setNext(j.next); setMore(Boolean(j.has_more) && scope === 'all');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load transactions.'); if (!after) setRows([]); }
    setLoading(false);
  }, [qs, scope]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter((t) => [t.id, t.partner_name, t.payer, t.description, t.method, t.status].some((v) => v?.toLowerCase().includes(n))) : rows;
  }, [rows, q]);
  const sums = useMemo(() => shown.reduce((a, t) => {
    if (t.status === 'failed') return a;
    a.gross += t.amount_cents; a.fee += t.fee_cents ?? 0; a.refunded += t.refunded_cents; a.net += (t.net_cents ?? 0) - t.refunded_cents; return a;
  }, { gross: 0, fee: 0, refunded: 0, net: 0 }), [shown]);

  function exportCsv() {
    const head = ['Date', 'Partner', 'Payer', 'Description', 'Method', 'Status', 'Gross', 'Fee', 'Refunded', 'Net', 'Charge ID', 'Receipt'];
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = shown.map((t) => [t.created, t.partner_name, t.payer, t.description, t.method, LABEL[t.status], (t.amount_cents / 100).toFixed(2), t.fee_cents == null ? '' : (t.fee_cents / 100).toFixed(2), (t.refunded_cents / 100).toFixed(2), t.net_cents == null ? '' : ((t.net_cents - t.refunded_cents) / 100).toFixed(2), t.id, t.receipt_url].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stripe-transactions-${scope === 'client' ? clientName.replace(/\W+/g, '-').toLowerCase() : 'all'}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Transaction scope" className="flex items-center gap-2">
          {([['client', 'This partner'], ['all', 'All partners']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`rounded-md border px-4 py-1.5 text-sm ${scope === k ? 'border-[color:var(--ds-primary)]' : 'bg-white border-[color:var(--ds-line)] text-[color:var(--ds-body)] hover:bg-[color:var(--ds-selected)]'}`}>{l}</button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} label="Search transactions" />
        <label className="text-xs text-[color:var(--ds-body)]">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded-md border border-[color:var(--ds-line)] bg-white px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-[color:var(--ds-body)]">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded-md border border-[color:var(--ds-line)] bg-white px-2 py-1.5 text-sm" /></label>
        <button type="button" className={A.outline} onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>
      <div className="grid max-w-[760px] grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Gross', sums.gross], ['Stripe fees', sums.fee], ['Refunded', sums.refunded], ['Net', sums.net]] as const).map(([l, v]) => (
          <div key={l} className="rounded-[12px] bg-white p-4"><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{usd(v)}</div></div>
        ))}
      </div>
      {err && <div className={A.error}>{err}</div>}
      <div className="overflow-x-auto rounded-[12px] bg-white">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[color:var(--ds-body)]">
            <th className="p-3 font-medium">Date</th>{scope === 'all' && <th className="p-3 font-medium">Partner</th>}<th className="p-3 font-medium">Description</th><th className="p-3 font-medium">Method</th><th className="p-3 font-medium">Status</th>
            <th className="p-3 text-right font-medium">Gross</th><th className="p-3 text-right font-medium">Fee</th><th className="p-3 text-right font-medium">Net</th>
          </tr></thead>
          <tbody>
            {shown.map((t) => (
              <>
                <tr key={t.id} onClick={() => setOpen(open === t.id ? null : t.id)} className="cursor-pointer border-t border-[color:var(--ds-line)] hover:bg-[color:var(--ds-selected)]">
                  <td className="p-3 whitespace-nowrap">{when(t.created)}</td>
                  {scope === 'all' && <td className="p-3">{t.partner_name ?? t.payer ?? 'Unmatched'}</td>}
                  <td className="p-3">{t.description ?? '—'}</td>
                  <td className="p-3 whitespace-nowrap">{t.method}</td>
                  <td className="p-3 whitespace-nowrap font-medium" style={{ color: TONE[t.status] }}>{LABEL[t.status]}</td>
                  <td className="p-3 text-right">{usd(t.amount_cents)}</td>
                  <td className="p-3 text-right">{usd(t.fee_cents)}</td>
                  <td className="p-3 text-right">{usd(t.net_cents == null ? null : t.net_cents - t.refunded_cents)}</td>
                </tr>
                {open === t.id && (
                  <tr key={`${t.id}-d`} className="bg-[color:var(--ds-page)]">
                    <td colSpan={scope === 'all' ? 8 : 7} className="p-4 text-xs text-[color:var(--ds-body)]">
                      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                        <div>Charge ID: <span className="text-[color:var(--ds-ink)]">{t.id}</span></div>
                        <div>Payment intent: <span className="text-[color:var(--ds-ink)]">{t.payment_intent ?? '—'}</span></div>
                        <div>Payer: <span className="text-[color:var(--ds-ink)]">{t.payer ?? '—'}</span></div>
                        <div>Partner: <span className="text-[color:var(--ds-ink)]">{t.partner_name ?? 'Not matched to a partner'}</span></div>
                        <div>Refunded: <span className="text-[color:var(--ds-ink)]">{usd(t.refunded_cents)}</span></div>
                        <div>Agreement: <span className="text-[color:var(--ds-ink)]">{t.agreement_id ?? '—'}</span></div>
                        {t.failure && <div className="sm:col-span-2" style={{ color: '#b00020' }}>Failure: {t.failure}</div>}
                        {t.receipt_url && <div><a href={t.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--ds-primary)] underline">Open Stripe receipt</a></div>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-[color:var(--ds-body)]">No Stripe transactions found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        {loading && <span className="text-sm text-[color:var(--ds-body)]">Loading…</span>}
        {!loading && more && next && <button type="button" className={A.outline} onClick={() => load(next)}>Load more</button>}
      </div>
    </div>
  );
}
