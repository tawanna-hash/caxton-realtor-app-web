'use client';

// Dashboard (Beta) > Get Paid: overdue alert, receivables aging, payments this
// month, filterable invoice tables, outstanding by partner and income over
// time with period choices and a year-over-year comparison.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import { agingBucketForDaysPastDue, AGING_BUCKET_LABELS, type AgingBucket } from '@/lib/invoices';
import { day, money } from '../agreements/clients/data';

export type GInv = { id: string; status: string; total_cents: number; balance_cents?: number | null; amount_paid_cents?: number | null; paid_at: string | null; due_date?: string | null; number?: string | null; advertiser_name?: string | null; bill_to_name?: string | null };
export type GPayout = { id: string; batch_date: string; amount_cents: number; status: string };

const ORDER: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
const COLOR: Record<AgingBucket, string> = { current: '#8C94F5', d1_30: '#F2C94C', d31_60: '#F2994A', d61_90: '#EB5757', d90_plus: '#9B1C1C' };
const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const PAGE = 10;

const PERIODS = [
  ['this-month', 'This month'], ['last-month', 'Last month'], ['this-month-to-date', 'This month to date'],
  ['this-quarter', 'This quarter'], ['last-quarter', 'Last quarter'], ['this-quarter-to-date', 'This quarter to date'],
  ['last-12-months', 'Last 12 months'], ['this-year-to-date', 'This year to date'], ['this-year-to-last-month', 'This year to last month'],
  ['this-year', 'This year'], ['last-year', 'Last year'],
] as const;
type Period = (typeof PERIODS)[number][0];

function bounds(p: Period, now = new Date()): { start: Date; end: Date } {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const eod = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 23, 59, 59, 999));
  const today = eod(y, m, now.getUTCDate());
  const q = Math.floor(m / 3) * 3;
  switch (p) {
    case 'last-month': return { start: new Date(Date.UTC(y, m - 1, 1)), end: eod(y, m, 0) };
    case 'this-month-to-date': return { start: new Date(Date.UTC(y, m, 1)), end: today };
    case 'this-quarter': return { start: new Date(Date.UTC(y, q, 1)), end: eod(y, q + 3, 0) };
    case 'last-quarter': return { start: new Date(Date.UTC(y, q - 3, 1)), end: eod(y, q, 0) };
    case 'this-quarter-to-date': return { start: new Date(Date.UTC(y, q, 1)), end: today };
    case 'last-12-months': return { start: new Date(Date.UTC(y, m - 11, 1)), end: today };
    case 'this-year-to-date': return { start: new Date(Date.UTC(y, 0, 1)), end: today };
    case 'this-year-to-last-month': return { start: new Date(Date.UTC(y, 0, 1)), end: eod(y, m, 0) };
    case 'this-year': return { start: new Date(Date.UTC(y, 0, 1)), end: eod(y, 11, 31) };
    case 'last-year': return { start: new Date(Date.UTC(y - 1, 0, 1)), end: eod(y - 1, 11, 31) };
    default: return { start: new Date(Date.UTC(y, m, 1)), end: eod(y, m + 1, 0) };
  }
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`rounded-[14px] bg-white p-5 ${className}`}>{children}</div>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-lg font-medium text-[color:var(--ds-ink)]">{children}</h2>;
const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} style={{ background: on ? 'var(--ds-selected)' : 'transparent' }} className={`rounded-full border px-4 py-1.5 text-sm ${on ? 'border-[color:var(--ds-primary)] text-[color:var(--ds-primary)]' : 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>{children}</button>
);

export default function GetPaidSection({ invoices, payouts, loading }: { invoices: GInv[]; payouts: GPayout[]; loading: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);
  const [dismissed, setDismissed] = useState(false);
  const [view, setView] = useState<'unpaid' | 'paid'>('unpaid');
  const [bucket, setBucket] = useState<'all' | AgingBucket | 'overdue'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [pPage, setPPage] = useState(0);
  const [period, setPeriod] = useState<Period>('this-year');
  const [compare, setCompare] = useState(true);

  const d = useMemo(() => {
    const live = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft');
    const bal = (i: GInv) => i.balance_cents ?? i.total_cents - (i.amount_paid_cents ?? 0);
    const days = (i: GInv) => (i.due_date ? Math.floor((Date.parse(today) - Date.parse(i.due_date.slice(0, 10))) / 86400000) : 0);
    const unpaid = live.filter((i) => i.status !== 'paid' && bal(i) > 0).map((i) => ({ ...i, bal: bal(i), days: days(i), bucket: agingBucketForDaysPastDue(days(i)) }));
    const paid = live.filter((i) => i.status === 'paid');
    const aging = Object.fromEntries(ORDER.map((b) => [b, 0])) as Record<AgingBucket, number>;
    for (const i of unpaid) aging[i.bucket] += i.bal;
    const notPaid = unpaid.reduce((n, i) => n + i.bal, 0);
    const overdue = unpaid.filter((i) => i.days > 0);
    const paidMonth = paid.filter((i) => i.paid_at?.startsWith(monthKey));
    const deposits = payouts.filter((p) => p.batch_date.startsWith(monthKey) && p.status !== 'canceled' && p.status !== 'failed');
    const pm = new Map<string, { name: string; count: number; total: number; over: number }>();
    for (const i of unpaid) { const k = i.advertiser_name ?? i.bill_to_name ?? 'Unassigned'; const r = pm.get(k) ?? { name: k, count: 0, total: 0, over: 0 }; r.count++; r.total += i.bal; if (i.days > 0) r.over += i.bal; pm.set(k, r); }
    return {
      unpaid, paid, aging, notPaid, overdue, overdueTotal: overdue.reduce((n, i) => n + i.bal, 0),
      paidMonthTotal: paidMonth.reduce((n, i) => n + i.total_cents, 0), paidMonthCount: paidMonth.length,
      depositedTotal: deposits.reduce((n, p) => n + p.amount_cents, 0), depositedCount: deposits.length,
      partners: [...pm.values()].sort((a, b) => b.over - a.over || b.total - a.total),
    };
  }, [invoices, payouts, today, monthKey]);

  const nq = q.trim().toLowerCase();
  const match = (i: GInv) => !nq || [i.number, i.advertiser_name, i.bill_to_name].some((v) => v?.toLowerCase().includes(nq));
  const unpaidRows = d.unpaid.filter((i) => match(i) && (bucket === 'all' || (bucket === 'overdue' ? i.days > 0 : i.bucket === bucket)));
  const paidRows = d.paid.filter(match);
  const rowsLen = view === 'unpaid' ? unpaidRows.length : paidRows.length;
  const pages = Math.max(1, Math.ceil(rowsLen / PAGE));
  const cur = Math.min(page, pages - 1);
  const partnerPages = Math.max(1, Math.ceil(d.partners.length / 8));
  const pcur = Math.min(pPage, partnerPages - 1);

  const income = useMemo(() => {
    const { start, end } = bounds(period);
    const prevS = new Date(start), prevE = new Date(end); prevS.setUTCFullYear(prevS.getUTCFullYear() - 1); prevE.setUTCFullYear(prevE.getUTCFullYear() - 1);
    const monthly = end.getTime() - start.getTime() > 62 * 86400000;
    const keyOf = (dt: Date) => (monthly ? dt.toISOString().slice(0, 7) : dt.toISOString().slice(0, 10));
    const events = d.paid.filter((i) => i.paid_at).map((i) => ({ at: new Date(i.paid_at!), c: i.amount_paid_cents ?? i.total_cents }));
    const slots: Array<{ key: string; label: string; cur: number; prev: number }> = [];
    for (let t = new Date(start); t <= end; monthly ? t.setUTCMonth(t.getUTCMonth() + 1) : t.setUTCDate(t.getUTCDate() + 1)) {
      slots.push({ key: keyOf(t), label: monthly ? t.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : String(t.getUTCDate()), cur: 0, prev: 0 });
    }
    const idx = new Map(slots.map((s, n) => [s.key, n]));
    let totalCur = 0, totalPrev = 0;
    for (const e of events) {
      if (e.at >= start && e.at <= end) { const n = idx.get(keyOf(e.at)); if (n != null) { slots[n].cur += e.c; totalCur += e.c; } }
      if (e.at >= prevS && e.at <= prevE) { const proj = new Date(e.at); proj.setUTCFullYear(proj.getUTCFullYear() + 1); const n = idx.get(keyOf(proj)); if (n != null) { slots[n].prev += e.c; } totalPrev += e.c; }
    }
    return { slots, totalCur, totalPrev, monthly };
  }, [d.paid, period]);

  const W = 640, H = 170, pad = 40;
  const max = Math.max(1, ...income.slots.map((s) => Math.max(s.cur, compare ? s.prev : 0)));
  const bw = (W - pad) / Math.max(1, income.slots.length);
  const change = income.totalPrev ? ((income.totalCur - income.totalPrev) / income.totalPrev) * 100 : null;
  const showEvery = Math.ceil(income.slots.length / 14);

  return (
    <div className="space-y-6">
      {!dismissed && d.overdue.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-[#FDE8E8] px-5 py-3 text-sm text-[#7A1B12]">
          <span className="font-medium">{d.overdue.length} invoice{d.overdue.length === 1 ? ' is' : 's are'} overdue, totaling {usd0(d.overdueTotal)}.</span>
          <button type="button" className="underline" style={{ border: 0, background: 'transparent' }} onClick={() => { setView('unpaid'); setBucket('overdue'); setPage(0); document.getElementById('gp-invoices')?.scrollIntoView({ behavior: 'smooth' }); }}>Show overdue invoices</button>
          <button type="button" aria-label="Dismiss overdue alert" className="ml-auto text-lg leading-none" style={{ border: 0, background: 'transparent' }} onClick={() => setDismissed(true)}>&times;</button>
        </div>
      )}

      <section className="space-y-3">
        <H2>Receivables</H2>
        <div className="grid items-stretch gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Card className="space-y-4">
            <div className="flex items-baseline justify-between text-sm"><span className="font-semibold text-[color:var(--ds-ink)]">{usd0(d.notPaid)} outstanding</span><span className="text-xs text-[color:var(--ds-body)]">{d.unpaid.length} unpaid invoice{d.unpaid.length === 1 ? '' : 's'}</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ORDER.map((b) => (
                <button key={b} type="button" aria-pressed={bucket === b} onClick={() => { setView('unpaid'); setBucket(bucket === b ? 'all' : b); setPage(0); }} style={{ border: 0, background: bucket === b ? 'var(--ds-selected)' : 'transparent' }} className="rounded-[10px] px-3 py-2 text-left">
                  <div className="text-lg font-semibold text-[color:var(--ds-ink)]">{usd0(d.aging[b])}</div>
                  <div className="text-xs text-[color:var(--ds-body)]">{AGING_BUCKET_LABELS[b]}</div>
                </button>
              ))}
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-[#ECECF3]" aria-label="Outstanding balance by aging bucket">
              {ORDER.map((b) => d.aging[b] > 0 && <div key={b} title={`${AGING_BUCKET_LABELS[b]}: ${usd0(d.aging[b])}`} style={{ width: `${(d.aging[b] / d.notPaid) * 100}%`, background: COLOR[b] }} />)}
            </div>
          </Card>
          <Card className="space-y-4">
            <div className="text-sm font-semibold text-[color:var(--ds-ink)]">Payments this month</div>
            <div className="grid grid-cols-3 gap-3">
              {([[d.notPaid, d.unpaid.length, 'not paid'], [d.paidMonthTotal, d.paidMonthCount, 'paid'], [d.depositedTotal, d.depositedCount, 'deposited']] as const).map(([a, c, l]) => (
                <div key={l}><div className="text-lg font-semibold text-[color:var(--ds-ink)]">{usd0(a)}</div><div className="text-xs text-[color:var(--ds-body)]">{c} {l}</div></div>
              ))}
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-[#ECECF3]" aria-hidden="true"><div style={{ width: `${d.notPaid + d.paidMonthTotal ? (d.notPaid / (d.notPaid + d.paidMonthTotal)) * 100 : 0}%`, background: '#8C94F5' }} /><div className="flex-1" style={{ background: '#1B7A3D' }} /></div>
          </Card>
        </div>
      </section>

      <section id="gp-invoices"><Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <H2>Invoices</H2>
          <div role="group" aria-label="Invoice view" className="flex gap-2"><Pill on={view === 'unpaid'} onClick={() => { setView('unpaid'); setPage(0); }}>Unpaid ({d.unpaid.length})</Pill><Pill on={view === 'paid'} onClick={() => { setView('paid'); setPage(0); }}>Paid ({d.paid.length})</Pill></div>
          {view === 'unpaid' && (
            <select aria-label="Aging filter" className={`${A.input} w-auto`} value={bucket} onChange={(e) => { setBucket(e.target.value as typeof bucket); setPage(0); }}>
              <option value="all">All aging</option><option value="overdue">Overdue</option>
              {ORDER.map((b) => <option key={b} value={b}>{AGING_BUCKET_LABELS[b]}</option>)}
            </select>
          )}
          <div className="ml-auto"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); setPPage(0); }} label="Search invoices" /></div>
        </div>
        <div className="overflow-x-auto">
          {view === 'unpaid' ? (
            <SortTable rows={unpaidRows} offset={cur * PAGE} limit={PAGE} cols={[{ label: 'Invoice', get: (i) => i.number }, { label: 'Partner', get: (i) => i.advertiser_name ?? i.bill_to_name }, { label: 'Balance', get: (i) => i.bal }, { label: 'Due date', get: (i) => i.due_date }, { label: 'Aging status', get: (i) => i.days }]} className={`${A.table} min-w-[640px]`}>
              {(rws) => (<>
                {rws.length === 0 && <tr><td colSpan={5}><EmptyState title="No unpaid invoices" body={loading ? 'Loading invoices…' : 'Nothing matches these filters.'} /></td></tr>}
                {rws.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium text-[color:var(--ds-ink)]">{i.number ?? 'Draft'}</td>
                    <td className="text-[color:var(--ds-ink)]">{i.advertiser_name ?? i.bill_to_name ?? '—'}</td>
                    <td className="text-[color:var(--ds-ink)]">{money(i.bal)}</td>
                    <td className="text-[color:var(--ds-body)]">{i.due_date ? day(i.due_date) : '—'}</td>
                    <td><span className={`rounded-full px-3 py-0.5 text-xs ${i.days > 0 ? 'bg-[#FDE8E8] text-[#B42318]' : 'bg-[#EEF0F6] text-[color:var(--ds-ink)]'}`}>{i.days > 0 ? `${i.days} day${i.days === 1 ? '' : 's'} overdue` : 'Current'}</span></td>
                  </tr>
                ))}
              </>)}
            </SortTable>
          ) : (
            <SortTable rows={paidRows} offset={cur * PAGE} limit={PAGE} cols={[{ label: 'Invoice', get: (i) => i.number }, { label: 'Partner', get: (i) => i.advertiser_name ?? i.bill_to_name }, { label: 'Amount', get: (i) => i.amount_paid_cents ?? i.total_cents }, { label: 'Paid on', get: (i) => i.paid_at }]} className={`${A.table} min-w-[560px]`}>
              {(rws) => (<>
                {rws.length === 0 && <tr><td colSpan={4}><EmptyState title="No paid invoices" body={loading ? 'Loading invoices…' : 'Nothing matches these filters.'} /></td></tr>}
                {rws.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium text-[color:var(--ds-ink)]">{i.number ?? 'Draft'}</td>
                    <td className="text-[color:var(--ds-ink)]">{i.advertiser_name ?? i.bill_to_name ?? '—'}</td>
                    <td className="text-[color:var(--ds-ink)]">{money(i.amount_paid_cents ?? i.total_cents)}</td>
                    <td className="text-[color:var(--ds-body)]">{i.paid_at ? day(i.paid_at) : '—'}</td>
                  </tr>
                ))}
              </>)}
            </SortTable>
          )}
        </div>
        <div className="flex items-center justify-between text-sm text-[color:var(--ds-body)]">
          <span>{rowsLen ? `${cur * PAGE + 1}–${Math.min((cur + 1) * PAGE, rowsLen)} of ${rowsLen}` : '0 results'} · <Link href="/admin/billing-hub" className="text-[color:var(--ds-primary)]">Open Billing</Link></span>
          <span className="flex gap-2"><button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button><button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button></span>
        </div>
      </Card></section>

      <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-3">
          <H2>Outstanding by partner</H2>
          <div className="flex-1">
            <table className={A.table}><thead><tr><th>Partner</th><th className="text-right">Invoices</th><th className="text-right">Overdue</th><th className="text-right">Outstanding</th></tr></thead>
              <tbody>{d.partners.slice(pcur * 8, pcur * 8 + 8).map((p) => <tr key={p.name} ><td>{p.name}</td><td className="text-right">{p.count}</td><td className={`text-right ${p.over ? 'text-[#B42318]' : ''}`}>{money(p.over)}</td><td className="text-right">{money(p.total)}</td></tr>)}</tbody></table>
            {d.partners.length === 0 && <p className="py-6 text-center text-sm text-[color:var(--ds-body)]">{loading ? 'Loading invoices…' : 'Nothing outstanding'}</p>}
            {partnerPages > 1 && <div className="mt-3 flex justify-end gap-2"><button type="button" className={A.small} disabled={pcur === 0} onClick={() => setPPage(pcur - 1)}>Previous</button><button type="button" className={A.small} disabled={pcur >= partnerPages - 1} onClick={() => setPPage(pcur + 1)}>Next</button></div>}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <H2>Income over time</H2>
            <select aria-label="Income period" className={`${A.input} ml-auto w-auto`} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Card className="flex-1 space-y-3">
            <div className="flex flex-wrap items-end gap-6">
              <div><div className="text-xs text-[color:var(--ds-body)]">Income</div><div className="text-xl font-semibold text-[color:var(--ds-ink)]">{usd0(income.totalCur)}</div></div>
              {compare && <div><div className="text-xs text-[color:var(--ds-body)]">Same period last year</div><div className="text-xl font-semibold text-[color:var(--ds-body)]">{usd0(income.totalPrev)}</div></div>}
              {compare && change != null && <div className={`text-sm font-medium ${change >= 0 ? 'text-[#1B7A3D]' : 'text-[#B42318]'}`}>{change >= 0 ? '+' : ''}{change.toFixed(0)}% year over year</div>}
              <label className="ml-auto flex items-center gap-2 text-sm text-[color:var(--ds-body)]"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />Compare to last year</label>
            </div>
            <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label="Income over time" className="w-full">
              {[0, 0.5, 1].map((t) => <g key={t}><line x1={pad} x2={W} y1={H - H * t} y2={H - H * t} stroke="#ECECF3" /><text x={pad - 4} y={H - H * t + 3} fontSize="9" textAnchor="end" fill="#6B6A7C">{usd0(max * t)}</text></g>)}
              {income.slots.map((s, n) => {
                const w = bw * (compare ? 0.38 : 0.7), x0 = pad + n * bw + bw * 0.1;
                return (
                  <g key={s.key}>
                    {compare && <rect x={x0} width={w} y={H - (s.prev / max) * H} height={(s.prev / max) * H} rx="2" fill="#D5D4E0"><title>{`Last year: ${usd0(s.prev)}`}</title></rect>}
                    <rect x={compare ? x0 + w + 1 : x0} width={w} y={H - (s.cur / max) * H} height={(s.cur / max) * H} rx="2" fill="#1B7A3D"><title>{`${s.key}: ${usd0(s.cur)}`}</title></rect>
                    {n % showEvery === 0 && <text x={pad + n * bw + bw / 2} y={H + 14} fontSize="9" textAnchor="middle" fill="#6B6A7C">{s.label}</text>}
                  </g>
                );
              })}
            </svg>
            <div className="flex items-center justify-center gap-4 border-t border-[color:var(--ds-line)] pt-2 text-xs text-[color:var(--ds-body)]">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1B7A3D]" />This period</span>
              {compare && <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#D5D4E0]" />Last year</span>}
              <span>{income.monthly ? 'By month' : 'By day'}</span>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
