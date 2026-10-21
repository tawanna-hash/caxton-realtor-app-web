'use client';

// Billing > Payment links, in the flat Anchor look: summary cards, search and
// status filter, one sortable table, paging. Create/edit uses the existing
// payment link drawer; the data comes from the same queries Get Paid used.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import { PaymentLinkDrawer } from '@/app/admin/ar/PaymentActionDrawers';
import { formatCents, outstandingCents } from '@/lib/invoices';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';

type St = 'open' | 'overdue' | 'paid' | 'void';
const PAGE = 25;

const day = (v: string | null | undefined) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};
const safe = (v: string | null | undefined): v is string => {
  try { const u = new URL(v ?? ''); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};
const stOf = (i: InvoiceWithAdvertiser): St => (i.status === 'paid' ? 'paid' : i.status === 'void' ? 'void' : i.is_overdue || i.status === 'overdue' ? 'overdue' : 'open');
const LABEL: Record<St, string> = { open: 'Open', overdue: 'Overdue', paid: 'Paid', void: 'Void' };
const PILL: Record<St, string> = { open: 'bg-[#EEF0F6] text-[color:var(--ds-ink)]', overdue: 'bg-[#FDE8E8] text-[#B42318]', paid: 'bg-[#E6F6EC] text-[#1B7A3D]', void: 'bg-[#EEE] text-[color:var(--ds-body)]' };

export default function PaymentLinksPanel() {
  const [invoices, setInvoices] = useState<InvoiceWithAdvertiser[] | null>(null);
  const [advertisers, setAdvertisers] = useState<AdvertiserOption[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | St>('all');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/billing/payment-links-data', { cache: 'no-store', credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setInvoices(j.invoices ?? []); setAdvertisers(j.advertisers ?? []); setErr(''); })
      .catch((e) => { setErr(e instanceof Error ? e.message : 'Could not load payment links.'); setInvoices((x) => x ?? []); });
  }, []);
  useEffect(load, [load]);

  const links = useMemo(() => (invoices ?? []).filter((i) => Boolean(i.stripe_payment_link_url)), [invoices]);
  const sums = useMemo(() => {
    const by = (s: St) => links.filter((i) => stOf(i) === s);
    const amt = (l: InvoiceWithAdvertiser[]) => l.reduce((n, i) => n + outstandingCents(i), 0);
    return { all: [links.length, amt(links)], open: [by('open').length, amt(by('open'))], overdue: [by('overdue').length, amt(by('overdue'))], paid: [by('paid').length, amt(by('paid'))] };
  }, [links]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return links.filter((i) => (status === 'all' || stOf(i) === status) && (!n || [i.number, i.advertiser_name, i.bill_to_name, i.bill_to_email, i.stripe_payment_link_url].some((v) => v?.toLowerCase().includes(n))));
  }, [links, q, status]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);

  async function del(i: InvoiceWithAdvertiser) {
    if (!window.confirm(`Remove the payment link for invoice ${i.number ?? 'this invoice'}? This does not delete the invoice.`)) return;
    setDeleting(i.id);
    try {
      const r = await fetch(`/api/admin/invoices/${i.id}/payment-link`, { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Could not delete the payment link.'); return; }
      load();
    } finally { setDeleting(null); }
  }
  async function copy(i: InvoiceWithAdvertiser) {
    try { await navigator.clipboard.writeText(i.stripe_payment_link_url ?? ''); setCopied(i.id); setTimeout(() => setCopied(null), 1500); } catch { setErr('Could not copy the link.'); }
  }

  if (invoices === null) return <p className="text-sm text-[color:var(--ds-body)]">Loading payment links…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([['Created links', sums.all], ['Open links', sums.open], ['Overdue links', sums.overdue], ['Paid links', sums.paid]] as const).map(([l, [c, a]]) => (
          <div key={l} className="rounded-[10px] bg-white px-4 py-3">
            <div className="text-xs text-[color:var(--ds-body)]">{l} ({c})</div>
            <div className="text-xl font-medium text-[color:var(--ds-ink)]">{formatCents(a)}</div>
          </div>
        ))}
      </div>
      {err && <div className={A.error}>{err}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} label="Search payment links" />
        <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
          {(['all', 'open', 'overdue', 'paid', 'void'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(0); }} style={{ background: status === k ? 'var(--ds-selected)' : 'transparent' }} className={`rounded-full border px-4 py-1.5 text-sm ${status === k ? 'border-[color:var(--ds-primary)] text-[color:var(--ds-primary)]' : 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>{k === 'all' ? 'All' : LABEL[k]}</button>
          ))}
        </div>
        <button type="button" className={`${A.primary} ml-auto`} onClick={() => setCreating(true)}>Create payment link</button>
      </div>
      <div className="overflow-x-auto">
        <SortTable rows={rows} offset={cur * PAGE} limit={PAGE} cols={[
          { label: 'Updated', get: (i) => i.updated_at }, { label: 'Invoice', get: (i) => i.number }, { label: 'Client', get: (i) => i.advertiser_name ?? i.bill_to_name },
          { label: 'Email', get: (i) => i.bill_to_email }, { label: 'Amount', get: (i) => outstandingCents(i) }, { label: 'Status', get: (i) => stOf(i) }, { label: '' },
        ]} className={`${A.table} min-w-[900px]`}>
          {(rws) => (<>
            {rws.length === 0 && <tr><td colSpan={7}><EmptyState title="No payment links found" body={links.length ? 'Adjust your filters to see more results.' : 'Create a secure link for an unpaid invoice.'} /></td></tr>}
            {rws.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap text-[color:var(--ds-body)]">{day(i.updated_at)}</td>
                <td className="font-medium text-[color:var(--ds-ink)]">{i.number ?? 'Draft'}</td>
                <td className="text-[color:var(--ds-ink)]">{i.advertiser_name ?? i.bill_to_name ?? '—'}</td>
                <td className="text-[color:var(--ds-body)]">{i.bill_to_email ?? '—'}</td>
                <td className="whitespace-nowrap font-medium text-[color:var(--ds-ink)]">{formatCents(outstandingCents(i))}</td>
                <td><span className={`rounded-full px-3 py-0.5 text-xs ${PILL[stOf(i)]}`}>{LABEL[stOf(i)]}</span></td>
                <td className="whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-3 text-sm">
                    <button type="button" className="text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent' }} onClick={() => setSelected(i.id)}>View/Edit</button>
                    {safe(i.stripe_payment_link_url) ? (<>
                      <button type="button" className="text-[color:var(--ds-primary)]" style={{ border: 0, background: 'transparent' }} onClick={() => copy(i)}>{copied === i.id ? 'Copied' : 'Copy link'}</button>
                      <a className="text-[color:var(--ds-primary)]" href={i.stripe_payment_link_url} target="_blank" rel="noreferrer">Open</a>
                    </>) : <span className="text-[color:var(--ds-body)]">Invalid link</span>}
                    <button type="button" className="text-[#B42318] disabled:opacity-50" style={{ border: 0, background: 'transparent' }} disabled={deleting === i.id} onClick={() => del(i)}>{deleting === i.id ? 'Deleting…' : 'Delete'}</button>
                  </span>
                </td>
              </tr>
            ))}
          </>)}
        </SortTable>
      </div>
      <div className="flex items-center justify-between text-sm text-[color:var(--ds-body)]">
        <span>{rows.length ? `${cur * PAGE + 1}–${Math.min((cur + 1) * PAGE, rows.length)} of ${rows.length}` : '0 results'}</span>
        <span className="flex gap-2">
          <button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </span>
      </div>
      {(creating || selected) && (
        <PaymentLinkDrawer invoices={invoices} advertisers={advertisers} initialInvoiceId={selected ?? undefined} onClose={() => { setCreating(false); setSelected(null); }} onSaved={async () => load()} onError={setErr} />
      )}
    </div>
  );
}
