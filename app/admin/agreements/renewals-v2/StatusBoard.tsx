'use client';

// Agreements (Beta) status board: every in-flight agreement in one pipeline,
// Draft, Sent, Opened, Signed, with one-click resend and, for signed
// agreements, the draft recurring-invoice schedule for review.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, ColumnStyle, EditColumns, EmptyState, FilterChip, SearchBox, useColumns, type ColumnDef } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Item = {
  id: string;
  kind: 'new' | 'renewal';
  company_name: string | null;
  email: string | null;
  stage: 'draft' | 'sent' | 'opened' | 'signed';
  rate_cents: number | null;
  last_activity_at: string | null;
  signed_at: string | null;
  resend_id: string;
  schedule_state: 'none' | 'draft' | 'active' | 'ended' | null;
  schedule_id: string | null;
  timeline: { count: number; amount_cents: number; start: string | null } | null;
};

const COLS: ColumnDef[] = [
  { key: 'type', label: 'Type', index: 2 },
  { key: 'status', label: 'Status', index: 3 },
  { key: 'monthly', label: 'Monthly', index: 4 },
  { key: 'billing', label: 'Billing', index: 5 },
];

const STAGE_LABEL: Record<Item['stage'], string> = { draft: 'Draft', sent: 'Sent', opened: 'Opened', signed: 'Signed' };
const STAGE_STYLE: Record<Item['stage'], string> = {
  draft: 'bg-[color:var(--ds-page)] text-[color:var(--ds-body)]',
  sent: 'bg-[color:var(--ds-selected)] text-[color:var(--ds-primary-press)]',
  opened: 'bg-blue-50 text-blue-800',
  signed: 'bg-green-50 text-green-800',
};

const money = (c: number | null) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

const SCHED_LABEL: Record<NonNullable<Item['schedule_state']>, string> = {
  none: 'No billing schedule',
  draft: 'Draft billing schedule',
  active: 'Billing active',
  ended: 'Billing ended',
};

export default function StatusBoard() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const cols = useColumns('board', COLS);
  const [stages, setStages] = useState<Item['stage'][]>(['draft', 'sent', 'opened', 'signed']);
  const [kinds, setKinds] = useState<Item['kind'][]>(['new', 'renewal']);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/board', { credentials: 'include' })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        if (alive) { setError(null); setItems(j.items as Item[]); }
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load the board'); });
    return () => { alive = false; };
  }, [tick]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => stages.includes(i.stage) && kinds.includes(i.kind) && (!needle || (i.company_name ?? '').toLowerCase().includes(needle)));
  }, [items, q, stages, kinds]);

  async function resend(i: Item) {
    if (!window.confirm(`Email the ${i.kind === 'renewal' ? 'renewal' : 'agreement'} link to ${i.email}?`)) return;
    setBusy(`${i.id}:send`);
    setNotice(null);
    try {
      const path = i.kind === 'renewal' ? `/api/admin/renewals-v2/${i.resend_id}` : `/api/admin/new-partner-v2/${i.id}`;
      const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send' }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      setNotice(`Sent to ${j.sent_to}.`);
      reload();
    } catch (e) {
      setNotice(`Could not send: ${e instanceof Error ? e.message : 'error'}`);
    } finally { setBusy(null); }
  }

  async function createSchedule(i: Item) {
    setBusy(`${i.id}:sched`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/agreements-v2/${i.id}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create_schedule' }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      setNotice('Draft billing schedule created. Review it in Billing > Recurring invoices before activating.');
      reload();
    } catch (e) {
      setNotice(`Could not create schedule: ${e instanceof Error ? e.message : 'error'}`);
    } finally { setBusy(null); }
  }

  const btn = A.small;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search agreements" />
        <FilterChip title="Status" value={stages} onApply={setStages} options={[{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'opened', label: 'Opened' }, { value: 'signed', label: 'Signed' }]} />
        <FilterChip title="Type" value={kinds} onApply={setKinds} options={[{ value: 'new', label: 'New partner' }, { value: 'renewal', label: 'Renewal' }]} />
        <div className="ml-auto"><EditColumns cols={COLS} visible={cols.visible} onApply={cols.apply} /></div>
      </div>
      {notice && <div className={A.notice}>{notice}</div>}
      {error && <div className={A.error}>{error}</div>}
      <div className="overflow-x-auto">
        <ColumnStyle tableClass="cols-board" cols={COLS} visible={cols.visible} />
        <SortTable rows={rows} cols={[{ label: 'Client', get: (r) => r.company_name }, { label: 'Type', get: (r) => r.kind }, { label: 'Status', get: (r) => r.stage }, { label: 'Monthly', get: (r) => r.rate_cents }, { label: 'Billing', get: (r) => r.schedule_state }, { label: '' }]} className={`${A.table} cols-board min-w-[760px]`}>
{(rws) => (<>
            {items === null && !error && <tr><td colSpan={6} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {items !== null && rows.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="No agreements" body="No agreements match your current filters." action={{ label: 'Clear filters', onClick: () => { setQ(''); setStages(['draft', 'sent', 'opened', 'signed']); setKinds(['new', 'renewal']); } }} /></td></tr>
            )}
            {rws.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="font-medium text-[color:var(--ds-ink)]">{i.company_name ?? '—'}</div>
                  <div className="text-xs text-[color:var(--ds-body)]">{i.email ?? 'No email on file'}</div>
                </td>
                <td className="text-[color:var(--ds-ink)]">{i.kind === 'renewal' ? 'Renewal' : 'New partner'}</td>
                <td>
                  <span className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLE[i.stage]}`}>{STAGE_LABEL[i.stage]}</span>
                  <div className="mt-1 text-xs text-[color:var(--ds-body)]">{i.stage === 'signed' ? day(i.signed_at) : day(i.last_activity_at)}</div>
                </td>
                <td className="text-[color:var(--ds-ink)]">{money(i.rate_cents)}</td>
                <td className="text-xs text-[color:var(--ds-ink)]">
                  {i.stage === 'signed' && i.schedule_state ? (
                    <>
                      <div className="font-medium">{SCHED_LABEL[i.schedule_state]}</div>
                      {i.timeline && <div className="text-[color:var(--ds-body)]">{i.timeline.count} × {money(i.timeline.amount_cents)}{i.timeline.start ? ` from ${day(`${i.timeline.start}T00:00:00`)}` : ''}</div>}
                    </>
                  ) : '—'}
                </td>
                <td>
                  <div className="flex justify-end gap-2">
                    {i.stage !== 'signed' && (
                      <button className={btn} disabled={busy !== null || !i.email} onClick={() => resend(i)}>{busy === `${i.id}:send` ? '…' : i.stage === 'draft' ? 'Send' : 'Resend'}</button>
                    )}
                    {i.stage === 'signed' && i.schedule_state === 'none' && (
                      <button className={btn} disabled={busy !== null} onClick={() => createSchedule(i)}>{busy === `${i.id}:sched` ? '…' : 'Create draft billing'}</button>
                    )}
                    {i.stage === 'signed' && i.schedule_state && i.schedule_state !== 'none' && (
                      <a className={btn} href={`/admin/billing-hub?agreementId=${i.id}`}>Review billing</a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </>)}
</SortTable>
      </div>
    </div>
  );
}
