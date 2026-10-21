'use client';

// Billing > Recurring invoices: the full schedule manager (formerly Get Paid > Recurring invoices).
// Same schedule records and the same schedule editor, so every field and the generation engine are unchanged.
// Beta rule: new schedules default to no automatic email while BETA_EMAIL_ENABLED is off.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, EmptyState, RowMenu, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import { computeNextRun, frequencyLabel, type RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import { formatCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/beta-core/billing/types';
import { RecurringScheduleDrawer } from '@/app/admin/beta-core/RecurringScheduleDrawer';
import { BETA_EMAIL_ENABLED } from '@/lib/beta-email';

type Sch = RecurringScheduleWithAdvertiser;
const SELECT = 'anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-3 py-2 text-sm text-[color:var(--ds-ink)]';
const SIZES = [25, 50, 100];

const day = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const amountOf = (s: Sch) => s.amount_cents + s.tax_cents;
const every = (s: Sch) => (s.interval_count > 1 ? `Every ${s.interval_count} ${frequencyLabel(s.frequency).toLowerCase()}` : frequencyLabel(s.frequency));

// How many invoices a schedule will generate between two moments (respects end date and max occurrences).
function projected(s: Sch, fromMs: number, toMs: number) {
  let next = new Date(s.next_run_at);
  if (Number.isNaN(next.getTime())) return 0;
  const endMs = s.end_date ? new Date(`${s.end_date}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  const remaining = s.max_occurrences == null ? Number.POSITIVE_INFINITY : Math.max(0, s.max_occurrences - s.occurrences_generated);
  let count = 0; let seen = 0;
  while (next.getTime() < fromMs && seen < 1000) { next = computeNextRun(next, s.frequency, s.interval_count); seen += 1; }
  while (next.getTime() <= toMs && next.getTime() <= endMs && count < remaining && seen < 1000) { count += 1; next = computeNextRun(next, s.frequency, s.interval_count); seen += 1; }
  return count;
}

function Metric({ amount, count, label }: { amount: number; count: number; label: string }) {
  return (
    <div className={`${A.card} p-5`}>
      <div className="text-lg font-semibold text-[color:var(--ds-ink)]">{formatCents(amount)}</div>
      <div className="text-xs text-[color:var(--ds-body)]">{count.toLocaleString()} {label}</div>
    </div>
  );
}

export default function RecurringPanel({ clientId = null }: { clientId?: number | null }) {
  const [rows, setRows] = useState<Sch[] | null>(null);
  const [advertisers, setAdvertisers] = useState<AdvertiserOption[]>([]);
  const [agreements, setAgreements] = useState<AgreementWithAdvertiser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [freq, setFreq] = useState('all');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    const r = await fetch('/api/admin/recurring-invoices', { cache: 'no-store', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'Could not refresh recurring invoices.');
    setRows(j.schedules as Sch[]); setNow(Date.now());
  }, []);

  useEffect(() => {
    const get = (u: string) => fetch(u, { credentials: 'include', cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); return j; });
    Promise.all([get('/api/admin/recurring-invoices'), get('/api/admin/advertisers'), get('/api/admin/agreements')])
      .then(([s, a, g]) => { setRows(s.schedules as Sch[]); setAdvertisers((a.advertisers ?? []) as AdvertiserOption[]); setAgreements((g.agreements ?? []) as AgreementWithAdvertiser[]); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load recurring invoices.'));
  }, []);

  const [allClients, setAllClients] = useState(false);
  const list = (rows ?? []).filter((s) => allClients || !clientId || Number(s.advertiser_id) === Number(clientId));
  const summary = useMemo(() => {
    const cutoff = now + 30 * 86_400_000;
    const proj = (items: Sch[]) => items.reduce((a, s) => { const n = projected(s, now, cutoff); return { amount: a.amount + n * amountOf(s), count: a.count + n }; }, { amount: 0, count: 0 });
    const active = list.filter((s) => s.status === 'active');
    const paused = list.filter((s) => s.status === 'paused');
    return { active: proj(active), paused: proj(paused), auto: proj(active.filter((s) => s.auto_send)), activeN: active.length, pausedN: paused.length };
  }, [list, now]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (freq !== 'all' && s.frequency !== freq) return false;
      return !term || [s.name, s.advertiser_name, s.bill_to_name, s.bill_to_email, s.memo].some((v) => v?.toLowerCase().includes(term));
    });
  }, [list, q, status, freq]);

  const pages = Math.max(1, Math.ceil(shown.length / size));
  const cur = Math.min(page, pages - 1);
  const total = shown.reduce((n, s) => n + amountOf(s), 0);
  const editing = editingId ? list.find((s) => s.id === editingId) ?? null : null;
  const filt = (f: () => void) => { f(); setPage(0); };

  const pause = async (s: Sch) => {
    setErr('');
    try {
      const r = await fetch(`/api/admin/recurring-invoices/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Could not pause schedule.');
      await reload(); setMsg(`${s.name} paused.`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not pause schedule.'); }
  };
  const del = async (s: Sch) => {
    if (s.status === 'active') { setErr('Pause the active schedule before permanent deletion.'); return; }
    const typed = window.prompt(`Permanent deletion cannot be undone. Type this schedule ID to delete it:\n${s.id}`);
    if (typed !== s.id) { setErr('Schedule was not deleted: the typed ID did not match.'); return; }
    setErr('');
    try {
      const r = await fetch(`/api/admin/recurring-invoices/${s.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permanent: true, confirmation_id: typed }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Could not permanently delete schedule.');
      await reload(); setMsg('Schedule permanently deleted.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not permanently delete schedule.'); }
  };

  if (loadError) return <div className={A.error}>{loadError}</div>;
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading recurring invoices…</p>;

  const statusLabel = (s: Sch) => (s.status === 'active' ? 'Active' : s.status === 'paused' ? 'Paused' : 'Ended');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric amount={summary.active.amount} count={summary.activeN} label="active schedules · projected next 30 days" />
        <Metric amount={summary.active.amount} count={summary.active.count} label="invoices projected · next 30 days" />
        <Metric amount={summary.auto.amount} count={summary.auto.count} label="auto-send · next 30 days" />
        <Metric amount={summary.paused.amount} count={summary.pausedN} label="paused schedules · projected next 30 days" />
      </div>
      {(msg || err) && <div role="status" className={err ? A.error : A.notice}>{err || msg}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => filt(() => setQ(v))} label="Search schedules" />
        {clientId ? (
          <select aria-label="Client scope" value={allClients ? 'all' : 'client'} onChange={(e) => filt(() => setAllClients(e.target.value === 'all'))} className={SELECT}>
            <option value="client">This client</option><option value="all">All clients</option>
          </select>
        ) : null}
        <select aria-label="Status" value={status} onChange={(e) => filt(() => setStatus(e.target.value))} className={SELECT}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
        </select>
        <select aria-label="Interval" value={freq} onChange={(e) => filt(() => setFreq(e.target.value))} className={SELECT}>
          <option value="all">All intervals</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option>
        </select>
        <button type="button" className={`${A.primary} ml-auto`} onClick={() => setCreating(true)}>Create recurring invoice</button>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No recurring invoices found" body={list.length ? 'Adjust your filters to see more results.' : 'Create a schedule to automate repeat billing.'} action={list.length ? undefined : { label: 'Create recurring invoice', onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto">
          <SortTable
            rows={shown} offset={cur * size} limit={size} className={A.table}
            cols={[
              { label: 'Schedule', get: (r) => r.name },
              { label: 'Client', get: (r) => r.advertiser_name ?? r.bill_to_name },
              { label: 'Interval', get: (r) => every(r) },
              { label: 'Next charge', get: (r) => r.next_run_at },
              { label: 'Amount', get: (r) => amountOf(r), className: 'text-right' },
              { label: 'Delivery', get: (r) => (r.auto_send ? 'Auto-send' : 'Manual') },
              { label: 'Status', get: (r) => r.status },
              { label: <span className="sr-only">Actions</span> },
            ]}
          >
            {(rws) => (<>
              {rws.map((s) => (
                <tr key={s.id}>
                  <td className="max-w-[260px] truncate font-medium text-[color:var(--ds-ink)]" title={s.name}>{s.name}{s.source === 'agreement' && <span className="ml-2 rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[10px] font-normal text-[color:var(--ds-body)]">From agreement</span>}</td>
                  <td className="min-w-[160px]">{s.advertiser_name ?? s.bill_to_name ?? `Partner ${s.advertiser_id}`}</td>
                  <td className="whitespace-nowrap">{every(s)}</td>
                  <td className="whitespace-nowrap">{day(s.next_run_at)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{formatCents(amountOf(s))}</td>
                  <td className="whitespace-nowrap">{s.auto_send ? 'Auto-send' : 'Manual'}</td>
                  <td><span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${s.status === 'active' ? 'border-green-600 text-green-700' : 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]'}`}>{statusLabel(s)}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" className={`${A.small} mr-2`} onClick={() => setEditingId(s.id)}>View/Edit</button>
                    <RowMenu label={`More actions for ${s.name}`} items={[
                      { label: 'View/Edit', onClick: () => setEditingId(s.id) },
                      { label: 'Pause', onClick: () => void pause(s), disabled: s.status !== 'active' },
                      { label: 'Permanent delete', onClick: () => void del(s), disabled: s.status === 'active', danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </>)}
          </SortTable>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--ds-body)]">
        <div className="font-semibold text-[color:var(--ds-ink)]">{shown.length} of {list.length} schedules · {formatCents(total)} per cycle</div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">Rows
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className={SELECT}>{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <span>{shown.length ? `${cur * size + 1}–${Math.min((cur + 1) * size, shown.length)} of ${shown.length}` : '0 results'}</span>
          <button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(0)}>First</button>
          <button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          <button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button>
        </div>
      </div>

      {creating && <RecurringScheduleDrawer emailOff={!BETA_EMAIL_ENABLED} advertisers={advertisers} agreements={agreements} seed={clientId ? { advertiser_id: clientId, agreement_id: null } : undefined} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await reload(); setMsg('Recurring invoice saved.'); }} onError={setErr} />}
      {editing && <RecurringScheduleDrawer emailOff={!BETA_EMAIL_ENABLED} existing={editing} advertisers={advertisers} agreements={agreements} onClose={() => setEditingId(null)} onSaved={async () => { setEditingId(null); await reload(); setMsg('Recurring invoice saved.'); }} onError={setErr} />}
    </div>
  );
}
