'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, SearchBox } from '@/components/anchor/ui';
import { CreateProposal, EmptyPanel, PageHeader, relTime } from '../shared';
import SortTable from '@/components/anchor/SortTable';

type Item = { id: string; kind: 'new' | 'renewal'; company_name: string | null; email: string | null; stage: 'draft' | 'sent' | 'opened' | 'signed'; rate_cents: number | null; last_activity_at: string | null; resend_id: string };
const money = (c: number | null) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

export default function SentClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/board', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`); if (alive) setItems((j.items as Item[]).filter((i) => i.stage === 'sent' || i.stage === 'opened')); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load agreements.'); });
    return () => { alive = false; };
  }, [tick]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items ?? []).filter((i) => !n || (i.company_name ?? '').toLowerCase().includes(n));
  }, [items, q]);

  async function resend(i: Item) {
    if (!window.confirm(`Email the ${i.kind === 'renewal' ? 'renewal' : 'agreement'} link to ${i.email}?`)) return;
    setBusy(i.id); setNotice(null);
    try {
      const path = i.kind === 'renewal' ? `/api/admin/renewals-v2/${i.resend_id}` : `/api/admin/new-partner-v2/${i.id}`;
      const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send' }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      setNotice(`Sent to ${j.sent_to}.`); reload();
    } catch (e) { setNotice(`Could not send: ${e instanceof Error ? e.message : 'error'}`); } finally { setBusy(null); }
  }

  const empty = items !== null && items.length === 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Sent agreements">{!empty && <CreateProposal />}</PageHeader>
      {notice && <div className={A.notice}>{notice}</div>}
      {error && <div className={A.error}>{error}</div>}
      {items === null && !error && <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>}
      {empty && <EmptyPanel tag="Agreements" title="Create agreements in a matter of minutes" body="Our agreements are designed for a fast setup with smart fields, a service library, and default settings." />}
      {items !== null && items.length > 0 && (
        <>
          <SearchBox value={q} onChange={setQ} label="Search sent agreements" />
          <div className="overflow-x-auto">
            <SortTable rows={rows} cols={[{ label: 'Client name', get: (r) => r.company_name }, { label: 'Type', get: (r) => r.kind }, { label: 'Status', get: (r) => r.stage }, { label: 'Monthly', get: (r) => r.rate_cents }, { label: 'Last activity', get: (r) => r.last_activity_at }, { label: '' }]} className={`${A.table} min-w-[640px]`}>
{(rws) => (<>
                {rws.map((i) => (
                  <tr key={i.id}>
                    <td><div className="font-medium text-[color:var(--ds-ink)]">{i.company_name ?? '—'}</div><div className="text-xs text-[color:var(--ds-body)]">{i.email ?? 'No email on file'}</div></td>
                    <td>{i.kind === 'renewal' ? 'Renewal' : 'New partner'}</td>
                    <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i.stage === 'opened' ? 'bg-blue-50 text-blue-800' : 'bg-[color:var(--ds-selected)] text-[color:var(--ds-primary-press)]'}`}>{i.stage === 'opened' ? 'Opened' : 'Awaiting approval'}</span></td>
                    <td>{money(i.rate_cents)}</td>
                    <td className="whitespace-nowrap text-[color:var(--ds-body)]">{i.last_activity_at ? relTime(i.last_activity_at) : '—'}</td>
                    <td className="text-right"><button type="button" className={A.small} disabled={busy !== null || !i.email} onClick={() => resend(i)}>{busy === i.id ? '…' : 'Resend'}</button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[color:var(--ds-body)]">No agreements match your search.</td></tr>}
              </>)}
</SortTable>
          </div>
        </>
      )}
    </div>
  );
}
