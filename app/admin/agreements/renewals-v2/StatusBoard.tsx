'use client';

// Agreements (Beta) status board: every in-flight agreement in one pipeline,
// Draft, Sent, Opened, Signed, with one-click resend and, for signed
// agreements, the draft recurring-invoice schedule for review.

import { useCallback, useEffect, useMemo, useState } from 'react';

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

const STAGE_LABEL: Record<Item['stage'], string> = { draft: 'Draft', sent: 'Sent', opened: 'Opened', signed: 'Signed' };
const STAGE_STYLE: Record<Item['stage'], string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-[#EFEAFB] text-[#42277C]',
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
  const [stage, setStage] = useState<'all' | Item['stage']>('all');
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
    return (items ?? []).filter((i) => (stage === 'all' || i.stage === stage) && (!needle || (i.company_name ?? '').toLowerCase().includes(needle)));
  }, [items, q, stage]);

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
      setNotice('Draft billing schedule created. Review it in Get Paid before activating.');
      reload();
    } catch (e) {
      setNotice(`Could not create schedule: ${e instanceof Error ? e.message : 'error'}`);
    } finally { setBusy(null); }
  }

  const btn = 'rounded-full border border-[#D9D5E8] px-3 py-1 text-xs font-medium text-[#301D5D] hover:bg-[#F6F5FB] disabled:opacity-50';
  const field = 'rounded-full border border-[#D9D5E8] bg-white px-4 py-2 text-sm text-[#301D5D]';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search agreements" className={`${field} w-56`} />
        <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} aria-label="Status" className={field}>
          <option value="all">Status (All)</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="signed">Signed</option>
        </select>
      </div>
      {notice && <div className="rounded-lg border border-[#D9D5E8] bg-[#F6F5FB] px-4 py-2 text-sm text-[#301D5D]">{notice}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-[#E6E5EC] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#F6F5FB] text-xs text-[#6B6878]">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Monthly</th>
              <th className="px-3 py-2 font-medium">Billing</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EEF6]">
            {items === null && !error && <tr><td colSpan={6} className="px-3 py-10 text-center text-[#6B6878]">Loading…</td></tr>}
            {items !== null && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center">
                <div className="font-semibold text-[#301D5D]">No agreements</div>
                <div className="mt-1 text-[#6B6878]">None match your current filters.</div>
                <button className={`${btn} mt-3`} onClick={() => { setQ(''); setStage('all'); }}>Clear filters</button>
              </td></tr>
            )}
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-3">
                  <div className="font-medium text-[#1B1726]">{i.company_name ?? '—'}</div>
                  <div className="text-xs text-[#6B6878]">{i.email ?? 'No email on file'}</div>
                </td>
                <td className="px-3 py-3 text-[#4A4757]">{i.kind === 'renewal' ? 'Renewal' : 'New partner'}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[i.stage]}`}>{STAGE_LABEL[i.stage]}</span>
                  <div className="mt-1 text-xs text-[#6B6878]">{i.stage === 'signed' ? day(i.signed_at) : day(i.last_activity_at)}</div>
                </td>
                <td className="px-3 py-3 text-[#4A4757]">{money(i.rate_cents)}</td>
                <td className="px-3 py-3 text-xs text-[#4A4757]">
                  {i.stage === 'signed' && i.schedule_state ? (
                    <>
                      <div className="font-medium text-[#301D5D]">{SCHED_LABEL[i.schedule_state]}</div>
                      {i.timeline && <div>{i.timeline.count} × {money(i.timeline.amount_cents)}{i.timeline.start ? ` from ${day(`${i.timeline.start}T00:00:00`)}` : ''}</div>}
                    </>
                  ) : '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    {i.stage !== 'signed' && (
                      <button className={btn} disabled={busy !== null || !i.email} onClick={() => resend(i)}>{busy === `${i.id}:send` ? '…' : i.stage === 'draft' ? 'Send' : 'Resend'}</button>
                    )}
                    {i.stage === 'signed' && i.schedule_state === 'none' && (
                      <button className={btn} disabled={busy !== null} onClick={() => createSchedule(i)}>{busy === `${i.id}:sched` ? '…' : 'Create draft billing'}</button>
                    )}
                    {i.stage === 'signed' && i.schedule_state && i.schedule_state !== 'none' && (
                      <a className={btn} href="/admin/getpaid/reoccuringpayments">Review billing</a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
