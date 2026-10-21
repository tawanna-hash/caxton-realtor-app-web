'use client';

// Reports (Beta), matched to Anchor's Reports: an "All Reports" index with five
// reports. Each report has filters, sortable columns, and an Export (CSV).

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { A, EditColumns, ColumnStyle, EmptyState, useColumns, type ColumnDef } from '@/components/anchor/ui';
import { SortTh } from '../agreements/clients/StatusFilter';
import { day, money, useJson, type Sch } from '../agreements/clients/data';
import { computeNextRun, type RecurringFrequency } from '@/lib/recurring-invoices';

export const REPORTS = [
  { slug: 'revenue', title: 'Revenue Breakdown', body: 'Review historical revenue with detailed breakdowns across various time intervals. This revenue data is based on paid invoices and accounts for any refunds and disputes, if applicable. Note that the revenue data does not include any platform fees.' },
  { slug: 'active-services', title: 'Active Services', body: 'View all active services across all of your agreements with options to apply various filters.' },
  { slug: 'future-invoices', title: 'Future Invoices', body: 'View all invoices scheduled for issuance over the next 12 months.' },
  { slug: 'sent-proposals', title: 'Sent Proposals', body: 'View all sent proposals by their sent date and current status.' },
  { slug: 'remaining-credit', title: 'Remaining Credit', body: 'View the remaining credit your clients have per agreement.' },
] as const;

export function ReportsIndex() {
  return (
    <div className="space-y-4">
      <div><h1 className={A.title}>All Reports</h1><p className={`${A.subtitle} mt-1`}>Run and export reports on revenue, services, invoices, proposals and credit.</p></div>
      <div className="space-y-3">
        {REPORTS.map((r) => (
          <section key={r.slug} className="flex items-center justify-between gap-6 rounded-[10px] bg-white px-5 py-4">
            <div className="max-w-2xl"><h2 className="text-base font-semibold text-[color:var(--ds-ink)]">{r.title}</h2><p className="text-sm text-[color:var(--ds-body)]">{r.body}</p></div>
            <Link href={`/admin/reports-beta/${r.slug}`} className={A.primary}>Go to report</Link>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------- shared ----------
type Inv = { id: string; advertiser_id: number; advertiser_name: string | null; status: string; total_cents: number; amount_paid_cents: number; paid_at: string | null; issued_at: string | null; created_at: string; line_items: Array<{ description: string; qty: number; unit_cents: number }> | null };
type Agr = { id: string; advertiser_id: number | null; company_name: string | null; advertiser_name: string | null; status: string; ad_size: string | null; frequency: string | null; start_date: string | null; end_date: string | null; signed_at: string | null; created_at: string; created_by: string | null; total_monthly_rate_cents: number | null; ad_rate_cents: number | null; audit_log: Array<{ action?: string; event?: string; timestamp?: string; at?: string }> | null };
const noInv: Inv[] = []; const noAgr: Agr[] = []; const noSch: Sch[] = [];
const RANGES = [['last30', 'Last 30 days'], ['last3', 'Last 3 months'], ['last12', 'Last 12 months'], ['thisYear', 'This year'], ['lastYear', 'Last year'], ['all', 'All time']] as const;
type Range = (typeof RANGES)[number][0];
function rangeOf(r: Range): [string, string] {
  const now = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10); const back = (m: number, d = 0) => { const x = new Date(now); x.setMonth(x.getMonth() - m); x.setDate(x.getDate() - d); return x; };
  if (r === 'last30') return [iso(back(0, 30)), iso(now)]; if (r === 'last3') return [iso(back(3)), iso(now)]; if (r === 'last12') return [iso(back(12)), iso(now)];
  if (r === 'thisYear') return [`${now.getFullYear()}-01-01`, iso(now)]; if (r === 'lastYear') return [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`]; return ['0000-01-01', '9999-12-31'];
}
const clientOf = (a: Agr) => a.company_name || a.advertiser_name || 'Unnamed client';

function csv(name: string, head: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}

function Shell({ title, onExport, filters, children }: { title: string; onExport: () => void; filters?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><Link href="/admin/reports-beta" aria-label="Back to reports" className="text-2xl leading-none text-[color:var(--ds-ink)]">&lsaquo;</Link><h1 className={A.title}>{title}</h1></div>
          <p className={`${A.subtitle} mt-1`}>{REPORTS.find((r) => title.startsWith(r.title.split(' ')[0]))?.body ?? ''}</p>
        </div>
        <button type="button" className={A.primary} onClick={onExport}>Export</button>
      </div>
      {filters && <div className="flex flex-wrap items-center gap-3">{filters}</div>}
      {children}
    </div>
  );
}
function RangeSelect({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return <select aria-label="Date range" className={`${A.input} w-[170px]`} value={value} onChange={(e) => onChange(e.target.value as Range)}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
function ClientFilter({ value, onChange, names }: { value: string; onChange: (v: string) => void; names: string[] }) {
  return <select aria-label="Client name" className={`${A.input} w-[200px]`} value={value} onChange={(e) => onChange(e.target.value)}><option value="">All clients</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>;
}
type Col<T> = { key: string; label: string; right?: boolean; val: (r: T) => string | number; show?: (r: T) => React.ReactNode };
function Table<T extends { id: string }>({ cols, rows, loading, tableClass, empty }: { cols: Array<Col<T>>; rows: T[]; loading: boolean; tableClass?: string; empty?: string }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: cols[0].key, dir: 1 });
  const sorted = useMemo(() => { const c = cols.find((x) => x.key === sort.k) ?? cols[0]; return [...rows].sort((a, b) => (c.val(a) > c.val(b) ? 1 : c.val(a) < c.val(b) ? -1 : 0) * sort.dir); }, [rows, sort, cols]);
  return (
    <div className="overflow-x-auto">
      <table className={`${A.table} min-w-[720px] ${tableClass ?? ''}`}>
        <thead><tr>{cols.map((c) => (c.right ? <th key={c.key} className="text-right"><SortTh label={c.label} dir={sort.k === c.key ? (sort.dir === 1 ? 'asc' : 'desc') : undefined} onClick={() => setSort((s) => ({ k: c.key, dir: s.k === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))} /></th> : <SortTh key={c.key} label={c.label} dir={sort.k === c.key ? (sort.dir === 1 ? 'asc' : 'desc') : undefined} onClick={() => setSort((s) => ({ k: c.key, dir: s.k === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))} />))}</tr></thead>
        <tbody>
          {!loading && sorted.length === 0 && <tr><td colSpan={cols.length}><EmptyState title="No data" body={empty ?? 'Nothing matches the current filters.'} /></td></tr>}
          {sorted.map((r) => <tr key={r.id}>{cols.map((c) => <td key={c.key} className={`${c.right ? 'text-right ' : ''}text-[color:var(--ds-ink)]`}>{c.show ? c.show(r) : c.val(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
const Pill = ({ t, tone }: { t: string; tone: 'green' | 'gray' | 'red' | 'amber' }) => <span className={`rounded-full border px-2 py-0.5 text-xs ${tone === 'green' ? 'border-green-600 text-green-700' : tone === 'red' ? 'border-red-500 text-red-600' : tone === 'amber' ? 'border-amber-500 text-amber-700' : 'border-[color:var(--ds-body)] text-[color:var(--ds-body)]'}`}>{t}</span>;
const Name = ({ n }: { n: string }) => <div><div className="font-semibold text-[color:var(--ds-ink)]">{n}</div><div className="text-xs text-[color:var(--ds-body)]">Agreement</div></div>;

// ---------- Revenue Breakdown ----------
type RevRow = { id: string; period: string; service: string; client: string; cents: number };
function Revenue() {
  const inv = useJson('/api/admin/invoices', (j) => (j.invoices ?? []) as Inv[], noInv);
  const [range, setRange] = useState<Range>('last12');
  const [by, setBy] = useState<'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'>('month');
  const [bd, setBd] = useState<string[]>([]);
  const [client, setClient] = useState('');
  const rows = useMemo<RevRow[]>(() => {
    const [from, to] = rangeOf(range); const m = new Map<string, RevRow>();
    for (const i of inv.data) {
      if (i.status === 'void' || i.status === 'draft') continue;
      const paid = i.status === 'paid' ? (i.amount_paid_cents || i.total_cents) : i.amount_paid_cents;
      const d = (i.paid_at ?? i.issued_at ?? i.created_at ?? '').slice(0, 10);
      if (!paid || !d || d < from || d > to) continue;
      const nm = i.advertiser_name ?? 'Unknown'; if (client && nm !== client) continue;
      const dt = new Date(`${d}T12:00:00`);
      const period = by === 'all' ? 'All time' : by === 'day' ? d : by === 'year' ? String(dt.getFullYear()) : by === 'quarter' ? `${dt.getFullYear()} Q${Math.floor(dt.getMonth() / 3) + 1}` : by === 'week' ? (() => { const x = new Date(dt); x.setDate(x.getDate() - x.getDay()); return x.toISOString().slice(0, 10); })() : d.slice(0, 7);
      const items = (i.line_items ?? []).filter((l) => l.description);
      const sum = items.reduce((s, l) => s + l.qty * l.unit_cents, 0);
      const parts = bd.includes('service') && items.length && sum > 0 ? items.map((l) => ({ s: l.description, c: Math.round((paid * l.qty * l.unit_cents) / sum) })) : [{ s: bd.includes('service') ? 'Other' : '', c: paid }];
      for (const p of parts) { const k = `${period}|${p.s}|${bd.includes('client') ? nm : ''}`; const r = m.get(k) ?? { id: k, period, service: p.s, client: bd.includes('client') ? nm : '', cents: 0 }; r.cents += p.c; m.set(k, r); }
    }
    return [...m.values()];
  }, [inv.data, range, by, bd, client]);
  const names = useMemo(() => [...new Set(inv.data.map((i) => i.advertiser_name).filter(Boolean) as string[])].sort(), [inv.data]);
  const total = rows.reduce((s, r) => s + r.cents, 0);
  const cols: Array<Col<RevRow>> = [{ key: 'period', label: by === 'all' ? 'Period' : by[0].toUpperCase() + by.slice(1), val: (r) => r.period }, ...(bd.includes('service') ? [{ key: 'service', label: 'Service name', val: (r: RevRow) => r.service }] : []), ...(bd.includes('client') ? [{ key: 'client', label: 'Client name', val: (r: RevRow) => r.client }] : []), { key: 'rev', label: 'Revenue', right: true, val: (r) => r.cents, show: (r) => money(r.cents) }];
  return (
    <Shell title="Revenue Breakdown Report" onExport={() => csv('revenue-breakdown', cols.map((c) => c.label), rows.map((r) => cols.map((c) => (c.key === 'rev' ? (r.cents / 100).toFixed(2) : c.val(r)))))}
      filters={<>
        <RangeSelect value={range} onChange={setRange} />
        <select aria-label="Group by" className={`${A.input} w-[130px]`} value={by} onChange={(e) => setBy(e.target.value as typeof by)}>{['day', 'week', 'month', 'quarter', 'year', 'all'].map((v) => <option key={v} value={v}>{v === 'all' ? 'All time' : v[0].toUpperCase() + v.slice(1)}</option>)}</select>
        <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={bd.includes('service')} onChange={() => setBd((b) => (b.includes('service') ? b.filter((x) => x !== 'service') : [...b, 'service']))} /> Service name</label>
        <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={bd.includes('client')} onChange={() => setBd((b) => (b.includes('client') ? b.filter((x) => x !== 'client') : [...b, 'client']))} /> Client name</label>
        <ClientFilter value={client} onChange={setClient} names={names} />
      </>}>
      <Table cols={cols} rows={rows} loading={inv.loading} empty="No paid invoices in this date range." />
      {rows.length > 0 && <div className="text-right text-sm font-semibold text-[color:var(--ds-ink)]">Total {money(total)}</div>}
    </Shell>
  );
}

// ---------- Active Services ----------
type SvcRow = { id: string; client: string; service: string; occ: string; cents: number; status: string };
const OCC: Record<string, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Yearly', yearly: 'Yearly', one_time: 'One-time' };
function ActiveServices() {
  const agr = useJson('/api/admin/agreements', (j) => (j.agreements ?? []) as Agr[], noAgr);
  const [client, setClient] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo<SvcRow[]>(() => agr.data.filter((a) => a.signed_at && !['expired', 'cancelled', 'canceled', 'void', 'declined', 'draft', 'terminated'].includes(String(a.status).toLowerCase()) && (!a.end_date || a.end_date.slice(0, 10) >= today) && (!client || clientOf(a) === client))
    .map((a) => ({ id: a.id, client: clientOf(a), service: a.ad_size ? `${a.ad_size} ad` : 'Advertising', occ: OCC[String(a.frequency ?? '').toLowerCase()] ?? (a.frequency ?? '—'), cents: a.total_monthly_rate_cents ?? a.ad_rate_cents ?? 0, status: 'Approved' })), [agr.data, client, today]);
  const colDefs: ColumnDef[] = [{ key: 'service', label: 'Service name', index: 2 }, { key: 'occ', label: 'Occurrence', index: 3 }, { key: 'rate', label: 'Rate', index: 4 }, { key: 'status', label: 'Status', index: 5 }];
  const cd = useColumns('report-active-services', colDefs);
  const cols: Array<Col<SvcRow>> = [
    { key: 'client', label: 'Client name', val: (r) => r.client.toLowerCase(), show: (r) => <Name n={r.client} /> },
    { key: 'service', label: 'Service name', val: (r) => r.service }, { key: 'occ', label: 'Occurrence', val: (r) => r.occ },
    { key: 'rate', label: 'Rate', right: true, val: (r) => r.cents, show: (r) => money(r.cents) }, { key: 'status', label: 'Status', val: (r) => r.status, show: (r) => <Pill t={r.status} tone="green" /> },
  ];
  return (
    <Shell title="Active Services Report" onExport={() => csv('active-services', cols.map((c) => c.label), rows.map((r) => [r.client, r.service, r.occ, (r.cents / 100).toFixed(2), r.status]))}
      filters={<><EditColumns cols={colDefs} visible={cd.visible} onApply={cd.apply} /><ClientFilter value={client} onChange={setClient} names={[...new Set(agr.data.map(clientOf))].sort()} /></>}>
      <ColumnStyle tableClass="rep-active" cols={colDefs} visible={cd.visible} />
      <Table cols={cols} rows={rows} loading={agr.loading} tableClass="rep-active" empty="No active services." />
    </Shell>
  );
}

// ---------- Future Invoices ----------
type FutRow = { id: string; client: string; issue: string; due: string; approval: boolean; cents: number };
function FutureInvoices() {
  const sch = useJson('/api/admin/recurring-invoices', (j) => (j.schedules ?? j.recurring_invoices ?? []) as Array<Sch & { advertiser_name?: string | null }>, noSch as Array<Sch & { advertiser_name?: string | null }>);
  const [client, setClient] = useState('');
  const rows = useMemo<FutRow[]>(() => {
    const limit = new Date(); limit.setMonth(limit.getMonth() + 12); const out: FutRow[] = [];
    for (const s of sch.data) {
      if (s.status === 'ended') continue;
      const total = s.max_occurrences ?? null; const done = s.occurrences_generated ?? 0; let when = new Date(s.next_run_at);
      for (let n = 0; n < 200 && (total == null || done + n < total); n++) {
        if (when > limit || (s.end_date && when.toISOString().slice(0, 10) > String(s.end_date).slice(0, 10))) break;
        const nm = s.advertiser_name ?? s.name;
        if (!client || nm === client) out.push({ id: `${s.id}-${n}`, client: nm, issue: when.toISOString(), due: when.toISOString(), approval: s.status === 'paused', cents: s.amount_cents + (s.tax_cents ?? 0) });
        when = computeNextRun(when, s.frequency as RecurringFrequency, s.interval_count ?? 1);
      }
    }
    return out;
  }, [sch.data, client]);
  const cols: Array<Col<FutRow>> = [
    { key: 'client', label: 'Client name', val: (r) => r.client.toLowerCase(), show: (r) => <span className="font-semibold">{r.client}</span> },
    { key: 'issue', label: 'Issue date', val: (r) => r.issue, show: (r) => day(r.issue) }, { key: 'due', label: 'Due date', val: (r) => r.due, show: (r) => day(r.due) },
    { key: 'appr', label: 'Requires approval', val: (r) => (r.approval ? 'Yes' : 'No') }, { key: 'total', label: 'Total', right: true, val: (r) => r.cents, show: (r) => money(r.cents) },
  ];
  return (
    <Shell title="Future Invoices Report" onExport={() => csv('future-invoices', cols.map((c) => c.label), rows.map((r) => [r.client, day(r.issue), day(r.due), r.approval ? 'Yes' : 'No', (r.cents / 100).toFixed(2)]))}
      filters={<ClientFilter value={client} onChange={setClient} names={[...new Set(sch.data.map((s) => s.advertiser_name ?? s.name))].sort()} />}>
      <Table cols={cols.map((c) => (c.key === 'issue' ? { ...c } : c))} rows={rows} loading={sch.loading} empty="No invoices are scheduled." />
    </Shell>
  );
}

// ---------- Sent Proposals ----------
type PropRow = { id: string; client: string; by: string; sent: string; approved: string; status: string };
function SentProposals() {
  const agr = useJson('/api/admin/agreements', (j) => (j.agreements ?? []) as Agr[], noAgr);
  const [range, setRange] = useState<Range>('last12'); const [client, setClient] = useState('');
  const rows = useMemo<PropRow[]>(() => {
    const [from, to] = rangeOf(range);
    return agr.data.filter((a) => String(a.status).toLowerCase() !== 'draft').map((a) => {
      const sentEntry = (a.audit_log ?? []).find((x) => /sent/i.test(`${x.action ?? ''}${x.event ?? ''}`));
      const sent = (sentEntry?.timestamp ?? sentEntry?.at ?? a.created_at ?? '').slice(0, 10);
      const s = String(a.status).toLowerCase();
      return { id: a.id, client: clientOf(a), by: a.created_by ?? '—', sent, approved: a.signed_at ? a.signed_at.slice(0, 10) : '', status: a.signed_at ? 'Signed' : s === 'expired' ? 'Expired' : s === 'declined' ? 'Declined' : 'Sent' };
    }).filter((r) => r.sent >= from && r.sent <= to && (!client || r.client === client));
  }, [agr.data, range, client]);
  const cols: Array<Col<PropRow>> = [
    { key: 'client', label: 'Client name', val: (r) => r.client.toLowerCase(), show: (r) => <Name n={r.client} /> }, { key: 'by', label: 'Sent by', val: (r) => r.by },
    { key: 'sent', label: 'Sent date', val: (r) => r.sent, show: (r) => day(r.sent) }, { key: 'appr', label: 'Approval date', val: (r) => r.approved, show: (r) => (r.approved ? day(r.approved) : '—') },
    { key: 'status', label: 'Status', val: (r) => r.status, show: (r) => <Pill t={r.status} tone={r.status === 'Signed' ? 'green' : r.status === 'Sent' ? 'amber' : 'red'} /> },
  ];
  return (
    <Shell title="Proposals Report" onExport={() => csv('proposals', cols.map((c) => c.label), rows.map((r) => [r.client, r.by, day(r.sent), r.approved ? day(r.approved) : '', r.status]))}
      filters={<><RangeSelect value={range} onChange={setRange} /><ClientFilter value={client} onChange={setClient} names={[...new Set(agr.data.map(clientOf))].sort()} /></>}>
      <Table cols={cols} rows={rows} loading={agr.loading} empty="No proposals were sent in this date range." />
    </Shell>
  );
}

// ---------- Remaining Credit ----------
type CredRow = { id: string; client: string; agreement: string; service: string; cents: number };
function RemainingCredit() {
  const rows: CredRow[] = [];
  const cols: Array<Col<CredRow>> = [{ key: 'client', label: 'Client name', val: (r) => r.client }, { key: 'agr', label: 'Agreement name', val: (r) => r.agreement }, { key: 'svc', label: 'Service name', val: (r) => r.service }, { key: 'credit', label: 'Credit', right: true, val: (r) => r.cents, show: (r) => money(r.cents) }];
  return (
    <Shell title="Remaining Credit Report" onExport={() => csv('remaining-credit', cols.map((c) => c.label), [])}>
      <Table cols={cols} rows={rows} loading={false} empty="No clients have remaining credit on an agreement." />
    </Shell>
  );
}

export function ReportView({ slug }: { slug: string }) {
  if (slug === 'revenue') return <Revenue />;
  if (slug === 'active-services') return <ActiveServices />;
  if (slug === 'future-invoices') return <FutureInvoices />;
  if (slug === 'sent-proposals') return <SentProposals />;
  if (slug === 'remaining-credit') return <RemainingCredit />;
  return <EmptyState title="Report not found" body="Choose a report from the list." />;
}
