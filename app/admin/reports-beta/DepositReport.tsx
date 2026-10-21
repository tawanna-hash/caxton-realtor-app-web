'use client';

// Deposit Slip and Deposit Detail inside Reports (Beta). Same recorded check
// payments as the old Get Paid reports; flat Anchor styling; print and PDF kept.
// Emailing the slip stays off while Beta email is off.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { A, EmptyState } from '@/components/anchor/ui';
import { SortTh } from '../agreements/clients/StatusFilter';
import { formatCents } from '@/lib/invoices';
import { PUBLICATION_OPTIONS } from '@/lib/publication-theme';
import type { DepositPaymentRow } from '@/lib/server/deposit-reports';
import { shortDate } from '@/app/admin/billing/_components/helpers';
import { BETA_EMAIL_ENABLED } from '@/lib/beta-email';

const PUB = new Map(PUBLICATION_OPTIONS.map((o) => [o.id as string, o.label]));
const pubLabel = (p: string | null) => (p ?? '').split(',').map((k) => k.trim()).filter(Boolean).map((k) => PUB.get(k) ?? k).join(' · ');
const source = (s: string | null) => { const v = (s ?? '').trim(); return v ? v.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) : 'Manual'; };
const stamp = (v: string | null) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };

type Key = 'payment_date' | 'partner_name' | 'invoice_number' | 'reference' | 'amount_cents';
const COLS_SLIP: Array<[Key | 'memo' | 'source' | 'created_at', string, boolean]> = [['payment_date', 'Date', false], ['partner_name', 'Partner', false], ['invoice_number', 'Invoice', false], ['reference', 'Check no.', false], ['memo', 'Memo', false], ['source', 'Source', false], ['created_at', 'Recorded', false], ['amount_cents', 'Amount', true]];
const COLS_DETAIL: Array<[Key | 'memo' | 'source' | 'created_at' | 'type', string, boolean]> = [['payment_date', 'Date', false], ['type', 'Type', false], ['reference', 'Check no.', false], ['partner_name', 'Client', false], ['invoice_number', 'Invoice', false], ['memo', 'Description', false], ['source', 'Source', false], ['created_at', 'Recorded', false], ['amount_cents', 'Amount', true]];

export function DepositReport({ kind, payments, from, to, preparedBy }: { kind: 'slip' | 'detail'; payments: DepositPaymentRow[]; from: string; to: string; preparedBy: string | null }) {
  const router = useRouter();
  const slip = kind === 'slip';
  const title = slip ? 'Deposit Slip' : 'Deposit Detail';
  const base = slip ? '/admin/reports-beta/deposit-slip' : '/admin/reports-beta/deposit-detail';
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'payment_date', dir: 1 });
  const cols = slip ? COLS_SLIP : COLS_DETAIL;
  const total = useMemo(() => payments.reduce((s, p) => s + p.amount_cents, 0), [payments]);
  const byDay = useMemo(() => {
    const m = new Map<string, { count: number; cents: number }>();
    for (const p of payments) { const k = p.payment_date ?? 'Undated'; const c = m.get(k) ?? { count: 0, cents: 0 }; m.set(k, { count: c.count + 1, cents: c.cents + p.amount_cents }); }
    return [...m.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  }, [payments]);
  const val = (p: DepositPaymentRow, k: string): string | number => k === 'type' ? 'Check' : k === 'amount_cents' ? p.amount_cents : String((p as unknown as Record<string, unknown>)[k] ?? '');
  const rows = useMemo(() => [...payments].sort((a, b) => (val(a, sort.k) > val(b, sort.k) ? 1 : val(a, sort.k) < val(b, sort.k) ? -1 : 0) * sort.dir), [payments, sort]);
  const pdf = `/api/admin/reports/deposits/pdf?${new URLSearchParams({ from, to, ...(slip ? {} : { kind: 'detail' }) })}`;
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Partner', 'Invoice', 'Check no.', 'Memo', 'Source', 'Amount'], ...payments.map((p) => [p.payment_date, p.partner_name, p.invoice_number ?? 'Draft', p.reference, p.memo, source(p.source), (p.amount_cents / 100).toFixed(2)])];
    const url = URL.createObjectURL(new Blob([lines.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${slip ? 'deposit-slip' : 'deposit-detail'}-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const cell = (p: DepositPaymentRow, k: string) => {
    switch (k) {
      case 'payment_date': return shortDate(p.payment_date);
      case 'type': return 'Check';
      case 'reference': return <span className="font-medium">{p.reference?.trim() || '—'}</span>;
      case 'partner_name': return <div><div className="font-medium">{p.partner_name ?? '—'}</div>{slip && pubLabel(p.publication) && <div className="text-xs text-[color:var(--ds-body)]">{pubLabel(p.publication)}</div>}</div>;
      case 'invoice_number': return <div><div className="font-medium">{p.invoice_number ?? 'Draft'}</div><div className="text-xs text-[color:var(--ds-body)]">{slip ? `${formatCents(p.invoice_total_cents ?? 0)} · ` : ''}{p.invoice_status ?? '—'}</div></div>;
      case 'memo': return p.memo?.trim() || (slip ? '—' : 'Payment received');
      case 'source': return source(p.source);
      case 'created_at': return <div><div>{stamp(p.created_at)}</div>{p.created_by && <div className="text-xs text-[color:var(--ds-body)] print:hidden">{p.created_by}</div>}</div>;
      default: return <span className="font-semibold tabular-nums">{formatCents(p.amount_cents)}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3"><Link href="/admin/reports-beta" aria-label="Back to reports" className="text-2xl leading-none text-[color:var(--ds-ink)]">&lsaquo;</Link><h1 className={A.title}>{title}</h1></div>
          <p className={`${A.subtitle} mt-1`}>{slip ? 'Every check recorded against an invoice in the selected range, totalled for the bank deposit slip.' : 'Transaction-level check detail from recorded invoice payments.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={A.outline} onClick={csv}>Export</button>
          <a className={A.outline} href={pdf} target="_blank" rel="noreferrer">Save PDF</a>
          <button type="button" className={A.primary} onClick={() => window.print()}>Print</button>
          {slip && <button type="button" className={A.outline} disabled title={BETA_EMAIL_ENABLED ? undefined : 'Email is off in beta'}>Email deposit slip{BETA_EMAIL_ENABLED ? '' : ' (off in beta)'}</button>}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs text-[color:var(--ds-body)]">From<input type="date" value={f} onChange={(e) => setF(e.target.value)} className={`${A.input} mt-1 block w-[170px]`} /></label>
        <label className="text-xs text-[color:var(--ds-body)]">To<input type="date" value={t} onChange={(e) => setT(e.target.value)} className={`${A.input} mt-1 block w-[170px]`} /></label>
        <button type="button" className={A.outline} onClick={() => router.push(`${base}?${new URLSearchParams({ from: f, to: t })}`)}>Update range</button>
      </div>

      <div className="rounded-[10px] bg-white px-5 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--ds-body)]">Caxton Publications, Inc.</div>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--ds-ink)]">{title}</h2>
        <div className="mt-2 grid gap-x-8 gap-y-1 text-xs text-[color:var(--ds-body)] sm:grid-cols-2">
          <div>Period: <span className="font-medium text-[color:var(--ds-ink)]">{shortDate(from)} – {shortDate(to)}</span></div>
          <div>Checks included: <span className="font-medium text-[color:var(--ds-ink)]">{payments.length}</span></div>
          <div>Tender: <span className="font-medium text-[color:var(--ds-ink)]">Checks only</span></div>
          <div>Prepared by: <span className="font-medium text-[color:var(--ds-ink)]">{preparedBy ?? '—'}</span></div>
        </div>
      </div>

      {slip && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[['Total deposit', formatCents(total)], ['Checks', String(payments.length)], ['Deposit days', String(byDay.length)]].map(([l, v]) => (
            <div key={l} className="rounded-[10px] bg-white px-5 py-4"><div className="text-xs text-[color:var(--ds-body)]">{l}</div><div className="mt-0.5 text-2xl font-semibold tabular-nums text-[color:var(--ds-ink)]">{v}</div></div>
          ))}
        </div>
      )}

      {payments.length === 0 ? (
        <EmptyState title="No check payments" body={`No check payments were recorded between ${shortDate(from)} and ${shortDate(to)}.`} />
      ) : (
        <>
          {slip && (
            <div className="overflow-x-auto"><table className={`${A.table} max-w-xl`}>
              <thead><tr><th>Deposit by date</th><th className="text-right">Count</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{byDay.map((d) => <tr key={d.day}><td>{d.day === 'Undated' ? 'Undated' : shortDate(d.day)}</td><td className="text-right tabular-nums">{d.count}</td><td className="text-right font-medium tabular-nums">{formatCents(d.cents)}</td></tr>)}</tbody>
            </table></div>
          )}
          <div className="overflow-x-auto">
            <table className={`${A.table} min-w-[900px] print:min-w-0`}>
              <thead><tr>{cols.map(([k, l, right]) => {
                const dir = sort.k === k ? (sort.dir === 1 ? 'asc' : 'desc') as 'asc' | 'desc' : undefined;
                const click = () => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }));
                return right ? <th key={k} className="text-right"><SortTh label={l} dir={dir} onClick={click} /></th> : <SortTh key={k} label={l} dir={dir} onClick={click} />;
              })}</tr></thead>
              <tbody>{rows.map((p) => <tr key={p.id} className="align-top">{cols.map(([k, , right]) => <td key={k} className={`${right ? 'text-right ' : ''}text-[color:var(--ds-ink)]`}>{cell(p, k)}</td>)}</tr>)}</tbody>
              <tfoot><tr><td colSpan={cols.length - 1} className="text-right font-semibold">{slip ? 'Total deposit' : 'Total'}</td><td className="text-right font-semibold tabular-nums">{formatCents(total)}</td></tr></tfoot>
            </table>
          </div>
          {slip && (
            <div className="grid gap-6 rounded-[10px] bg-white px-5 py-4 text-xs text-[color:var(--ds-body)] sm:grid-cols-2 print:break-inside-avoid">
              <div><div className="mb-6">Prepared by</div><div className="border-t border-gray-400 pt-1">{preparedBy ?? ''}</div></div>
              <div><div className="mb-6">Verified / deposited by</div><div className="border-t border-gray-400 pt-1" /></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
