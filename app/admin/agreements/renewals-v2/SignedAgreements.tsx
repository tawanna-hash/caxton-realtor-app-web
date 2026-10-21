'use client';

// Agreements (Beta) main list, matched to Anchor's signed Agreements page:
// count, search, Agreement status filter (Active / Completed / Terminated),
// Add filter, Bulk actions, More Actions, Create proposal menu, sortable
// columns and a per-row menu.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { A, EmptyState, FilterChip, RowMenu, SearchBox } from '@/components/anchor/ui';
import { SortTh } from '../clients/StatusFilter';
import { day, useJson, type Inv } from '../clients/data';

type Agr = {
  id: string; advertiser_id: number | null; company_name: string | null; advertiser_name: string | null; status: string; type: string | null;
  ad_size: string | null; frequency: string | null; start_date: string | null; end_date: string | null; signed_at: string | null;
  created_by: string | null; payment_mode: string | null; card_type: string | null; card_number_last4: string | null;
  total_monthly_rate_cents: number | null; ad_rate_cents: number | null; audit_log: Array<{ action?: string; event?: string }> | null;
  [k: string]: unknown;
};
type St = 'active' | 'completed' | 'terminated';
const ST_LABEL: Record<St, string> = { active: 'Active', completed: 'Completed', terminated: 'Terminated' };
const ST_STYLE: Record<St, string> = { active: 'border-green-600 text-green-700', completed: 'border-[color:var(--ds-body)] text-[color:var(--ds-body)]', terminated: 'border-red-500 text-red-600' };
const today = () => new Date().toISOString().slice(0, 10);

function stOf(a: Agr): St | null {
  const s = String(a.status).toLowerCase();
  if (s === 'cancelled' || s === 'canceled' || s === 'terminated') return 'terminated';
  if (s === 'expired') return 'completed';
  if (s === 'signed' || s === 'active' || a.signed_at) return a.end_date && a.end_date.slice(0, 10) < today() ? 'completed' : 'active';
  return null;
}
const nameOf = (a: Agr) => a.company_name || a.advertiser_name || 'Unnamed client';
const payOf = (a: Agr) => (a.card_number_last4 ? `${(a.card_type ?? 'Card').replace(/^./, (c) => c.toUpperCase())} ••${a.card_number_last4}` : a.payment_mode ? a.payment_mode.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

type FilterKey = 'effective' | 'billed' | 'payment' | 'amended';
const FILTERS: Array<[FilterKey, string]> = [['effective', 'Effective date'], ['billed', 'Last billing date'], ['payment', 'Payment method'], ['amended', 'Is amended']];

function Menu({ label, items, primary }: { label: string; items: Array<{ label: string; href?: string; onClick?: () => void; disabled?: boolean }>; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={primary ? A.primary : A.outline}>{label} <span aria-hidden="true" className="ml-2 text-[10px] leading-none">&#9660;</span></button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 min-w-[200px] rounded-[14px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
          {items.map((i) => i.href && !i.disabled
            ? <Link key={i.label} role="menuitem" href={i.href} className="block rounded-full px-4 py-2 text-sm text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)]">{i.label}</Link>
            : <button key={i.label} role="menuitem" type="button" disabled={i.disabled} onClick={() => { setOpen(false); i.onClick?.(); }} style={{ border: 0, background: 'transparent' }} className="block w-full px-4 py-2 text-left text-sm text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)] disabled:opacity-40">{i.label}</button>)}
        </div>
      )}
    </div>
  );
}

export default function SignedAgreements() {
  const [version, setVersion] = useState(0);
  const agr = useJson(`/api/admin/agreements?v=${version}`, (j) => (j.agreements ?? []) as Agr[], [] as Agr[]);
  const inv = useJson('/api/admin/invoices', (j) => (j.invoices ?? []) as Inv[], [] as Inv[]);
  const [q, setQ] = useState('');
  const [sts, setSts] = useState<St[]>(['active']);
  const [extra, setExtra] = useState<FilterKey[]>([]);
  const [eff, setEff] = useState({ from: '', to: '' }); const [bill, setBill] = useState({ from: '', to: '' });
  const [pay, setPay] = useState(''); const [amended, setAmended] = useState('yes');
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<{ k: 'name' | 'status' | 'assignee' | 'eff' | 'pay' | 'billed'; dir: 1 | -1 }>({ k: 'eff', dir: -1 });
  const [sel, setSel] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const lastBilled = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of inv.data) { if (!i.agreement_id || i.status === 'draft' || i.status === 'void' || !i.issue_date) continue; const d = i.issue_date.slice(0, 10); if (!m.get(i.agreement_id) || d > (m.get(i.agreement_id) as string)) m.set(i.agreement_id, d); }
    return m;
  }, [inv.data]);

  const all = useMemo(() => agr.data.filter((a) => stOf(a)), [agr.data]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = all.filter((a) => {
      const s = stOf(a) as St; if (!sts.includes(s)) return false;
      if (n && !nameOf(a).toLowerCase().includes(n)) return false;
      const e = (a.start_date ?? '').slice(0, 10), b = lastBilled.get(a.id) ?? '';
      if (extra.includes('effective') && ((eff.from && e < eff.from) || (eff.to && e > eff.to))) return false;
      if (extra.includes('billed') && ((bill.from && (!b || b < bill.from)) || (bill.to && (!b || b > bill.to)))) return false;
      if (extra.includes('payment') && pay && !payOf(a).toLowerCase().includes(pay.toLowerCase())) return false;
      if (extra.includes('amended')) { const am = (a.audit_log ?? []).some((x) => /amend/i.test(`${x.action ?? ''}${x.event ?? ''}`)); if ((amended === 'yes') !== am) return false; }
      return true;
    });
    const key = (a: Agr): string => String(sort.k === 'name' ? nameOf(a).toLowerCase() : sort.k === 'status' ? stOf(a) : sort.k === 'assignee' ? (a.created_by ?? '') : sort.k === 'pay' ? payOf(a) : sort.k === 'billed' ? (lastBilled.get(a.id) ?? '') : (a.start_date ?? ''));
    return out.sort((x, y) => (key(x) > key(y) ? 1 : key(x) < key(y) ? -1 : 0) * sort.dir);
  }, [all, q, sts, extra, eff, bill, pay, amended, sort, lastBilled]);

  const th = (k: typeof sort.k, label: string) => <SortTh label={label} dir={sort.k === k ? (sort.dir === 1 ? 'asc' : 'desc') : undefined} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} />;
  const chosen = rows.filter((r) => sel.includes(r.id));

  function exportCsv(list: Agr[]) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Client', 'Status', 'Assignee', 'Effective date', 'End date', 'Payment method', 'Last billed', 'Ad size', 'Monthly rate'].map(esc).join(',')]
      .concat(list.map((a) => [nameOf(a), ST_LABEL[stOf(a) as St], a.created_by, a.start_date, a.end_date, payOf(a), lastBilled.get(a.id), a.ad_size, a.total_monthly_rate_cents != null ? (a.total_monthly_rate_cents / 100).toFixed(2) : ''].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const l = document.createElement('a'); l.href = url; l.download = `agreements-${today()}.csv`; l.click(); URL.revokeObjectURL(url);
  }
  async function terminate(list: Agr[]) {
    if (!window.confirm(`Terminate ${list.length} agreement${list.length === 1 ? '' : 's'}? Billing for ${list.length === 1 ? 'it' : 'them'} stops being tracked as active.`)) return;
    const res = await Promise.all(list.map((a) => fetch(`/api/admin/agreements/${a.id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })));
    setNotice(res.every((r) => r.ok) ? 'Terminated.' : 'Some agreements could not be terminated.'); setSel([]); setVersion((v) => v + 1);
  }
  async function duplicate(a: Agr) {
    const keep = ['advertiser_id', 'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone', 'advertiser_address', 'type', 'ad_size', 'frequency', 'ad_rate_cents', 'total_monthly_rate_cents', 'discount_cents', 'ad_premium_cents', 'publication', 'payment_mode'];
    const body: Record<string, unknown> = { status: 'draft' }; for (const k of keep) if (a[k] != null) body[k] = a[k];
    const r = await fetch('/api/admin/agreements', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setNotice(r.ok ? 'Duplicated as a draft agreement.' : 'Could not duplicate the agreement.'); if (r.ok) setVersion((v) => v + 1);
  }
  async function link(a: Agr) {
    const r = await fetch(`/api/admin/agreements/${a.id}/sign-link`, { credentials: 'include' }); const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { setNotice('Could not create the link.'); return; }
    try { await navigator.clipboard.writeText(j.url); setNotice('Direct link copied.'); } catch { setNotice(j.url); }
  }
  const menu = (a: Agr) => [
    { label: 'Edit agreement', href: '/admin/agreements' },
    { label: 'Duplicate agreement', onClick: () => duplicate(a) },
    { label: 'Download PDF', href: `/api/admin/agreements/${a.id}/pdf` },
    { label: 'Share direct link', onClick: () => link(a) },
    { label: 'Manage billing', href: `/admin/billing-hub?agreementId=${a.id}&tab=hub` },
    { label: 'View invoices', href: `/admin/billing-hub?agreementId=${a.id}&tab=invoices` },
    { label: 'View activity log', href: `/admin/billing-hub?agreementId=${a.id}&tab=activity` },
    { label: 'Terminate agreement', onClick: () => terminate([a]), danger: true, disabled: stOf(a) === 'terminated' },
  ];
  const allSel = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const dateIn = 'w-[150px]';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Menu label="More Actions" items={[{ label: 'Import agreements', href: '/admin/agreements' }, { label: 'Export agreements', onClick: () => exportCsv(rows) }]} />
        <Menu primary label="Create proposal" items={[{ label: 'Use a template', href: '/admin/agreements/proposals/templates' }, { label: 'Start from scratch', href: '/admin/agreements/renewals-v2/new' }, { label: 'Import with AI', disabled: true }]} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search agreements" />
        <FilterChip<St> title="Agreement status" value={sts} onApply={setSts} options={(Object.keys(ST_LABEL) as St[]).map((v) => ({ value: v, label: ST_LABEL[v] }))} summary={`Agreement status (${sts.length})`} />
        {extra.includes('effective') && <span className="inline-flex items-center gap-2 text-xs text-[color:var(--ds-body)]">Effective date <input type="date" aria-label="Effective from" className={`${A.input} ${dateIn}`} value={eff.from} onChange={(e) => setEff({ ...eff, from: e.target.value })} /> to <input type="date" aria-label="Effective to" className={`${A.input} ${dateIn}`} value={eff.to} onChange={(e) => setEff({ ...eff, to: e.target.value })} /></span>}
        {extra.includes('billed') && <span className="inline-flex items-center gap-2 text-xs text-[color:var(--ds-body)]">Last billed <input type="date" aria-label="Billed from" className={`${A.input} ${dateIn}`} value={bill.from} onChange={(e) => setBill({ ...bill, from: e.target.value })} /> to <input type="date" aria-label="Billed to" className={`${A.input} ${dateIn}`} value={bill.to} onChange={(e) => setBill({ ...bill, to: e.target.value })} /></span>}
        {extra.includes('payment') && <input aria-label="Payment method" placeholder="Payment method" className={`${A.input} w-[170px]`} value={pay} onChange={(e) => setPay(e.target.value)} />}
        {extra.includes('amended') && <select aria-label="Is amended" className={`${A.input} w-[130px]`} value={amended} onChange={(e) => setAmended(e.target.value)}><option value="yes">Amended</option><option value="no">Not amended</option></select>}
        <div className="relative">
          <button type="button" className={A.outline} onClick={() => setAddOpen((o) => !o)} aria-haspopup="menu" aria-expanded={addOpen}>Add filter <span aria-hidden="true" className="ml-2">⊕</span></button>
          {addOpen && (
            <div role="menu" className="absolute left-0 z-30 mt-2 min-w-[220px] rounded-[14px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
              {FILTERS.map(([k, l]) => <button key={k} role="menuitem" type="button" disabled={extra.includes(k)} onClick={() => { setExtra([...extra, k]); setAddOpen(false); }} style={{ border: 0, background: 'transparent' }} className="block w-full px-4 py-2 text-left text-sm text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)] disabled:opacity-40">{l}</button>)}
            </div>
          )}
        </div>
        {extra.length > 0 && <button type="button" className="text-xs text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent' }} onClick={() => { setExtra([]); setEff({ from: '', to: '' }); setBill({ from: '', to: '' }); setPay(''); }}>Clear filters</button>}
        <div className="ml-auto"><Menu label="Bulk actions" items={[{ label: `Export selected (${chosen.length})`, disabled: chosen.length === 0, onClick: () => exportCsv(chosen) }, { label: `Terminate selected (${chosen.length})`, disabled: chosen.length === 0, onClick: () => terminate(chosen) }]} /></div>
      </div>
      {notice && <div className={A.notice}>{notice}</div>}
      <div className="text-sm text-[color:var(--ds-body)]">{agr.loading ? 'Loading…' : `${rows.length} agreement${rows.length === 1 ? '' : 's'}`}</div>
      <div className="overflow-x-auto">
        <table className={`${A.table} min-w-[820px]`}>
          <thead><tr>
            <th className="w-10"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : rows.map((r) => r.id))} className="h-4 w-4 accent-[color:var(--ds-primary)]" /></th>
            {th('name', 'Client name')}{th('status', 'Status')}{th('assignee', 'Assignee')}{th('eff', 'Effective date')}{th('pay', 'Payment method')}{th('billed', 'Last billed')}<th />
          </tr></thead>
          <tbody>
            {!agr.loading && rows.length === 0 && <tr><td colSpan={8}><EmptyState title="No agreements" body="No agreements match your current filters." action={{ label: 'Clear filters', onClick: () => { setQ(''); setSts(['active', 'completed', 'terminated']); setExtra([]); } }} /></td></tr>}
            {rows.map((a) => { const s = stOf(a) as St; return (
              <tr key={a.id}>
                <td><input type="checkbox" aria-label={`Select ${nameOf(a)}`} checked={sel.includes(a.id)} onChange={() => setSel((c) => (c.includes(a.id) ? c.filter((x) => x !== a.id) : [...c, a.id]))} className="h-4 w-4 accent-[color:var(--ds-primary)]" /></td>
                <td><div className="font-semibold text-[color:var(--ds-ink)]">{nameOf(a)}</div><div className="text-xs text-[color:var(--ds-body)]">Agreement{a.ad_size ? ` · ${a.ad_size}` : ''}</div></td>
                <td><span className={`rounded-full border px-2 py-0.5 text-xs ${ST_STYLE[s]}`}>{ST_LABEL[s]}</span></td>
                <td className="text-[color:var(--ds-ink)]">{a.created_by ?? '—'}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{day(a.start_date)}</td>
                <td className="text-[color:var(--ds-ink)]">{payOf(a) || '—'}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{lastBilled.get(a.id) ? day(lastBilled.get(a.id)) : '—'}</td>
                <td className="text-right"><RowMenu items={menu(a)} /></td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
