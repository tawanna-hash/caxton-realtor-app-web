'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';
import type { PayoutRow, ProcessingRow } from '@/app/api/admin/stripe/payouts/route';
import type { PayoutLine } from '@/app/api/admin/stripe/payouts/[id]/route';

type Balance = { available_cents: number; pending_cents: number; in_transit_cents: number; instant_available_cents: number };
const usd = (c: number | null) => (c == null ? '—' : `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dayOf = (v: string) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const cap = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const TONE: Record<string, string> = { paid: '#1a7f4b', in_transit: '#8a6100', pending: '#8a6100', failed: '#b00020', canceled: '#5b5870' };
const STATUSES = ['', 'paid', 'in_transit', 'pending', 'failed', 'canceled'];

export default function PayoutsPanel() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [processing, setProcessing] = useState<ProcessingRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, PayoutLine[] | 'loading' | 'error'>>({});

  const load = useCallback(async (after?: string) => {
    setLoading(true); setErr('');
    const p = new URLSearchParams({ limit: '50' });
    if (status) p.set('status', status);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (after) p.set('starting_after', after);
    try {
      const r = await fetch(`/api/admin/stripe/payouts?${p}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed');
      setPayouts((prev) => (after ? [...prev, ...j.payouts] : j.payouts));
      if (!after) { setBalance(j.balance); setProcessing(j.processing ?? []); }
      setNext(j.next); setMore(Boolean(j.has_more));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load payouts.'); }
    setLoading(false);
  }, [status, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (lines[id] && lines[id] !== 'error') return;
    setLines((m) => ({ ...m, [id]: 'loading' }));
    try {
      const r = await fetch(`/api/admin/stripe/payouts/${id}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setLines((m) => ({ ...m, [id]: j.lines }));
    } catch { setLines((m) => ({ ...m, [id]: 'error' })); }
  }

  function csvOf(name: string, head: string[], data: Array<Array<string | number | null>>) {
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob([[head.map(esc).join(','), ...data.map((r) => r.map(esc).join(','))].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
  const exportPayouts = () => csvOf('stripe-payouts.csv', ['Payout ID', 'Status', 'Amount', 'Arrival date', 'Created', 'Method', 'Type', 'Bank', 'Automatic', 'Failure'],
    payouts.map((p) => [p.id, cap(p.status), (p.amount_cents / 100).toFixed(2), p.arrival_date, p.created, p.method, p.type, p.bank, p.automatic ? 'Yes' : 'No', p.failure]));
  const exportLines = (id: string) => { const l = lines[id]; if (Array.isArray(l)) csvOf(`stripe-payout-${id}.csv`, ['Date', 'Type', 'Partner', 'Description', 'Method', 'Gross', 'Fee', 'Net', 'Charge ID', 'Receipt'], l.map((x) => [x.created, cap(x.type), x.partner_name, x.description, x.method, (x.gross_cents / 100).toFixed(2), (x.fee_cents / 100).toFixed(2), (x.net_cents / 100).toFixed(2), x.charge_id, x.receipt_url])); };

  const procTotal = processing.reduce((n, t) => n + t.amount_cents, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">Stripe payouts</h1><p className="text-xs text-[color:var(--ds-body)]">Money moving from Stripe to your bank, what is still processing, and every payment inside each payout.</p></div>
        <button type="button" className={A.outline} onClick={exportPayouts} disabled={!payouts.length}>Export payouts CSV</button>
      </div>
      {err && <div className={A.error}>{err}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([['Available to pay out', balance?.available_cents ?? null], ['Pending in Stripe', balance?.pending_cents ?? null], ['In transit to bank', balance?.in_transit_cents ?? null], ['Processing (not settled)', procTotal], ['Instant available', balance?.instant_available_cents ?? null]] as const).map(([l, v]) => (
          <div key={l} className="rounded-[12px] bg-white p-4"><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{usd(v)}</div></div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Processing payments ({processing.length})</h2>
        <div className="overflow-x-auto rounded-[12px] bg-white">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-[color:var(--ds-body)]"><th className="p-3 font-medium">Started</th><th className="p-3 font-medium">Partner</th><th className="p-3 font-medium">Description</th><th className="p-3 font-medium">Method</th><th className="p-3 text-right font-medium">Amount</th></tr></thead>
            <tbody>
              {processing.map((t) => (<tr key={t.id} className="border-t border-[color:var(--ds-line)]"><td className="p-3 whitespace-nowrap">{dayOf(t.created)}</td><td className="p-3">{t.partner_name ?? 'Unmatched'}</td><td className="p-3">{t.description ?? '—'}</td><td className="p-3 whitespace-nowrap">{t.method}</td><td className="p-3 text-right">{usd(t.amount_cents)}</td></tr>))}
              {!loading && processing.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[color:var(--ds-body)]">Nothing is processing right now.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-[color:var(--ds-ink)]">Payouts</h2>
          <select aria-label="Payout status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-[color:var(--ds-line)] bg-white px-3 py-1.5 text-sm">{STATUSES.map((s) => <option key={s} value={s}>{s ? cap(s) : 'All statuses'}</option>)}</select>
          <label className="text-xs text-[color:var(--ds-body)]">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded-md border border-[color:var(--ds-line)] bg-white px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-[color:var(--ds-body)]">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded-md border border-[color:var(--ds-line)] bg-white px-2 py-1.5 text-sm" /></label>
        </div>
        <div className="overflow-x-auto rounded-[12px] bg-white">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-[color:var(--ds-body)]"><th className="p-3 font-medium">Arrival date</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Bank</th><th className="p-3 font-medium">Method</th><th className="p-3 font-medium">Payout ID</th><th className="p-3 text-right font-medium">Amount</th></tr></thead>
            <tbody>
              {payouts.map((p) => {
                const l = lines[p.id];
                return (
                  <Fragment key={p.id}>
                    <tr onClick={() => toggle(p.id)} className="cursor-pointer border-t border-[color:var(--ds-line)] hover:bg-[color:var(--ds-selected)]">
                      <td className="p-3 whitespace-nowrap">{dayOf(p.arrival_date)}</td>
                      <td className="p-3 whitespace-nowrap font-medium" style={{ color: TONE[p.status] ?? '#5b5870' }}>{cap(p.status)}</td>
                      <td className="p-3">{p.bank ?? '—'}</td>
                      <td className="p-3 whitespace-nowrap">{cap(p.method)}{p.automatic ? '' : ' (manual)'}</td>
                      <td className="p-3 text-xs text-[color:var(--ds-body)]">{p.id}</td>
                      <td className="p-3 text-right font-medium">{usd(p.amount_cents)}</td>
                    </tr>
                    {open === p.id && (
                      <tr className="bg-[color:var(--ds-page)]"><td colSpan={6} className="p-4">
                        {p.failure && <p className="mb-2 text-xs" style={{ color: '#b00020' }}>Failure: {p.failure}</p>}
                        {l === 'loading' || l === undefined ? <p className="text-xs text-[color:var(--ds-body)]">Loading payout detail…</p>
                          : l === 'error' ? <p className="text-xs" style={{ color: '#b00020' }}>Could not load this payout.</p>
                          : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between"><span className="text-xs text-[color:var(--ds-body)]">{l.length} items. Created {dayOf(p.created)}.</span><button type="button" className={A.outline} onClick={() => exportLines(p.id)}>Export detail CSV</button></div>
                              <table className="w-full text-xs">
                                <thead><tr className="text-left text-[color:var(--ds-body)]"><th className="py-1 pr-3 font-medium">Date</th><th className="py-1 pr-3 font-medium">Type</th><th className="py-1 pr-3 font-medium">Partner</th><th className="py-1 pr-3 font-medium">Description</th><th className="py-1 pr-3 font-medium">Method</th><th className="py-1 pr-3 text-right font-medium">Gross</th><th className="py-1 pr-3 text-right font-medium">Fee</th><th className="py-1 pr-3 text-right font-medium">Net</th><th className="py-1 font-medium">Receipt</th></tr></thead>
                                <tbody>{l.map((x) => (
                                  <tr key={x.id} className="border-t border-[color:var(--ds-line)]">
                                    <td className="py-1 pr-3 whitespace-nowrap">{dayOf(x.created)}</td><td className="py-1 pr-3">{cap(x.type)}</td><td className="py-1 pr-3">{x.partner_name ?? '—'}</td><td className="py-1 pr-3">{x.description ?? '—'}</td><td className="py-1 pr-3 whitespace-nowrap">{x.method ?? '—'}</td>
                                    <td className="py-1 pr-3 text-right">{usd(x.gross_cents)}</td><td className="py-1 pr-3 text-right">{usd(-x.fee_cents)}</td><td className="py-1 pr-3 text-right">{usd(x.net_cents)}</td>
                                    <td className="py-1">{x.receipt_url ? <a href={x.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--ds-primary)] underline">Open</a> : '—'}</td>
                                  </tr>))}
                                  <tr className="border-t-2 border-[color:var(--ds-line)] font-semibold"><td colSpan={5} className="py-1 pr-3">Total</td><td className="py-1 pr-3 text-right">{usd(l.reduce((n, x) => n + x.gross_cents, 0))}</td><td className="py-1 pr-3 text-right">{usd(-l.reduce((n, x) => n + x.fee_cents, 0))}</td><td className="py-1 pr-3 text-right">{usd(l.reduce((n, x) => n + x.net_cents, 0))}</td><td /></tr>
                                </tbody>
                              </table>
                            </div>)}
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
              {!loading && payouts.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[color:var(--ds-body)]">No payouts found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-[color:var(--ds-body)]">Loading…</span>}
          {!loading && more && next && <button type="button" className={A.outline} onClick={() => load(next)}>Load more</button>}
        </div>
      </section>
    </div>
  );
}
