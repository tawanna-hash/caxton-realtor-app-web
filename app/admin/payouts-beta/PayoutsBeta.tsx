'use client';

// Payouts (Beta): Anchor's Payouts page, with every field from the Get Paid "Payouts from Stripe" page
// (arrival date, net payout, fees, transactions, status, deposit ID, range, search, page size, paging)
// plus a per-payout drill-down of the Stripe balance transactions.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import { day, money } from '../agreements/clients/data';

type Payout = { id: string; batch_date: string; amount_cents: number; fees_cents: number; transactions: number; status: string };
type Tx = { id: string; created: string; type: string; description: string | null; gross_cents: number; fee_cents: number; net_cents: number; source: string | null };
type Detail = { payout: { method: string; type: string; created: string; statement_descriptor: string | null; failure_message: string | null }; transactions: Tx[] };

const RANGES: Array<[string, string]> = [['30-days', 'Last 30 days'], ['90-days', 'Last 90 days'], ['12-months', 'Last 12 months'], ['all', 'All time']];
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (s: string) => s.replaceAll('_', ' ');

function csv(name: string, head: string[], rows: Array<Array<string | number>>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}

function Stat({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-[10px] bg-white px-3 py-4 text-center"><div className="text-sm text-[color:var(--ds-ink)]">{l}</div><div className="mt-1 text-xl font-semibold text-[color:var(--ds-ink)]">{value}</div>{sub && <div className="text-xs text-[color:var(--ds-body)]">{sub}</div>}</div>;
}

function Drill({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/agreements-v2/payouts/${id}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || j.error); if (live) setD(j); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not load this payout.'); });
    return () => { live = false; };
  }, [id]);
  if (err) return <p className={A.error}>{err}</p>;
  if (!d) return <p className="text-sm text-[color:var(--ds-body)]">Loading transactions from Stripe…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[color:var(--ds-body)]">{label(d.payout.type)} · {d.payout.method} · created {day(d.payout.created)}{d.payout.statement_descriptor ? ` · statement descriptor ${d.payout.statement_descriptor}` : ''}</p>
      {d.payout.failure_message && <p className={A.error}>{d.payout.failure_message}</p>}
      <div className="overflow-x-auto">
        <SortTable rows={d.transactions} className="w-full text-sm" cols={[
          { label: 'Date', get: (r) => r.created }, { label: 'Type', get: (r) => r.type }, { label: 'Description', get: (r) => r.description },
          { label: 'Gross', get: (r) => r.gross_cents, className: 'text-right' }, { label: 'Fee', get: (r) => r.fee_cents, className: 'text-right' }, { label: 'Net', get: (r) => r.net_cents, className: 'text-right' }]}>
          {(rws) => (<>{rws.map((t) => (
            <tr key={t.id} className="border-t border-[color:var(--ds-line)]">
              <td className="whitespace-nowrap py-2">{day(t.created)}</td><td className="capitalize">{label(t.type)}</td>
              <td className="max-w-[320px] truncate" title={t.description ?? ''}>{t.description ?? '—'}</td>
              <td className="text-right">{usd(t.gross_cents)}</td><td className="text-right">{usd(t.fee_cents)}</td><td className="text-right font-medium">{usd(t.net_cents)}</td>
            </tr>))}
            {rws.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[color:var(--ds-body)]">No transactions are attached to this payout.</td></tr>}</>)}
        </SortTable>
      </div>
      <button type="button" className={A.small} onClick={() => csv(`payout-${id}`, ['Date', 'Type', 'Description', 'Gross', 'Fee', 'Net'], d.transactions.map((t) => [t.created.slice(0, 10), t.type, t.description ?? '', (t.gross_cents / 100).toFixed(2), (t.fee_cents / 100).toFixed(2), (t.net_cents / 100).toFixed(2)]))}>Export transactions</button>
    </div>
  );
}

export default function PayoutsBeta() {
  const [range, setRange] = useState('12-months');
  const [data, setData] = useState<{ range: string; rows: Payout[] } | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/agreements-v2/payouts?range=${range}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || j.error || 'failed'); if (live) { setError(''); setData({ range, rows: j.payouts as Payout[] }); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load payouts.'); });
    return () => { live = false; };
  }, [range]);

  const rows = data?.range === range ? data.rows : null;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.batch_date} ${r.id} ${r.status} ${r.transactions} ${r.amount_cents}`.toLowerCase().includes(t)).sort((a, b) => b.batch_date.localeCompare(a.batch_date));
  }, [rows, q]);
  const month = new Date().toISOString().slice(0, 7);
  const total = shown.reduce((n, r) => n + r.amount_cents, 0);
  const fees = shown.reduce((n, r) => n + r.fees_cents, 0);
  const tx = shown.reduce((n, r) => n + r.transactions, 0);
  const paidMonth = shown.filter((r) => r.status === 'paid' && r.batch_date.startsWith(month)).reduce((n, r) => n + r.amount_cents, 0);
  const processing = shown.filter((r) => !['paid', 'canceled', 'failed'].includes(r.status)).reduce((n, r) => n + r.amount_cents, 0);
  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const cur = Math.min(page, pages);
  const offset = (cur - 1) * perPage;
  const NCOL = 7;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className={A.title}>Payouts</h1><p className={`${A.subtitle} mt-1`}>Stripe payouts by expected bank arrival date, including settlement fees and adjustments.</p></div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white px-3 py-1.5 text-xs text-[color:var(--ds-body)]">Source: Stripe</span>
          <button type="button" className={A.outline} disabled={!shown.length} onClick={() => csv('payouts', ['Arrival date', 'Net payout', 'Fees', 'Transactions', 'Status', 'Deposit ID'], shown.map((r) => [r.batch_date, (r.amount_cents / 100).toFixed(2), (r.fees_cents / 100).toFixed(2), r.transactions, r.status, r.id]))}>Export</button>
        </div>
      </div>
      {error && <p className={A.error}>{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Paid this month" value={usd(paidMonth)} />
        <Stat label="Processing" value={usd(processing)} />
        <Stat label="Net payouts" value={usd(total)} sub={`${shown.length} payout${shown.length === 1 ? '' : 's'}`} />
        <Stat label="Transactions" value={tx.toLocaleString()} sub={`${usd(fees)} in fees`} />
        <Stat label="Average payout" value={usd(shown.length ? Math.round(total / shown.length) : 0)} sub={shown[0] ? `Latest ${day(shown[0].batch_date)}` : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} label="Search payouts" />
        <select aria-label="Date range" className={`${A.input} w-[170px]`} value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Rows per page" className={`${A.input} w-[110px]`} value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}</select>
      </div>

      {!rows && !error ? <p className={A.subtitle}>Loading payouts from Stripe…</p> : rows && rows.length === 0 && !q ? (
        <EmptyState title="Automatic payments, with confidence" body="Payouts from Stripe appear here once clients start paying invoices. Try a longer date range if you expect to see some." />
      ) : (
        <div className="overflow-x-auto">
          <SortTable rows={shown} offset={offset} limit={perPage} className={`${A.table} min-w-[820px]`} cols={[
            { label: '' },
            { label: 'Arrival date', get: (r) => r.batch_date }, { label: 'Net payout', get: (r) => r.amount_cents, className: 'text-right' }, { label: 'Fees', get: (r) => r.fees_cents, className: 'text-right' },
            { label: 'Transactions', get: (r) => r.transactions, className: 'text-right' }, { label: 'Status', get: (r) => r.status }, { label: 'Deposit ID', get: (r) => r.id }]}>
            {(rws) => (<>
              {rws.map((p) => (
                <Fragment key={p.id}>
                  <tr>
                    <td className="w-8"><button type="button" aria-label={openId === p.id ? 'Hide transactions' : 'Show transactions'} aria-expanded={openId === p.id} onClick={() => setOpenId(openId === p.id ? null : p.id)} style={{ border: 0, background: 'transparent', padding: 0 }}><span aria-hidden="true" className={`inline-block text-[10px] leading-none ${openId === p.id ? 'rotate-180' : ''}`}>&#9660;</span></button></td>
                    <td className="whitespace-nowrap">{day(p.batch_date)}</td>
                    <td className="whitespace-nowrap text-right font-medium">{usd(p.amount_cents)}</td>
                    <td className="whitespace-nowrap text-right">{usd(p.fees_cents)}</td>
                    <td className="text-right">{p.transactions.toLocaleString()}</td>
                    <td><span className="rounded-full border border-[color:var(--ds-line)] px-2.5 py-0.5 text-xs capitalize">{label(p.status)}</span></td>
                    <td className="max-w-[200px] truncate font-mono text-xs" title={p.id}>{p.id}</td>
                  </tr>
                  {openId === p.id && <tr><td colSpan={NCOL} className="!bg-white"><Drill id={p.id} /></td></tr>}
                </Fragment>
              ))}
              {rws.length === 0 && <tr><td colSpan={NCOL} className="py-10 text-center text-[color:var(--ds-body)]">No payouts match your search.</td></tr>}
            </>)}
          </SortTable>
        </div>
      )}

      {shown.length > perPage && (
        <div className="flex items-center justify-between text-sm text-[color:var(--ds-body)]">
          <span>Showing {offset + 1} to {Math.min(offset + perPage, shown.length)} of {shown.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={A.small} disabled={cur <= 1} onClick={() => setPage(1)}>First</button>
            <button type="button" className={A.small} disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Previous</button>
            <span>Page {cur} of {pages}</span>
            <button type="button" className={A.small} disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next</button>
            <button type="button" className={A.small} disabled={cur >= pages} onClick={() => setPage(pages)}>Last</button>
          </div>
        </div>
      )}
      <p className="text-xs text-[color:var(--ds-body)]">Future payouts may vary in amount and date.</p>
    </div>
  );
}
