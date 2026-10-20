'use client';

// Renewals (Beta) admin workspace. Lists agreements due for renewal, shows the
// one-tap status for each, and lets you preview or send the partner link, one
// at a time or in a batch (always with a dry-run summary and a confirm step).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Candidate = {
  id: string;
  company_name: string | null;
  rep_name: string | null;
  email: string | null;
  publication: string | null;
  channel: string;
  ad_size: string | null;
  frequency: string | null;
  rate_cents: number | null;
  new_rate_cents: number | null;
  exp_date: string | null;
  days_left: number | null;
  needs_full_form: boolean;
  state: 'not_started' | 'draft' | 'sent' | 'opened' | 'signed';
  renewal_id: string | null;
  last_sent_at: string | null;
  reminders_sent: number;
};

type BatchResult = { id: string; company: string | null; status: string; to?: string | null; error?: string };

const STATE_LABEL: Record<Candidate['state'], string> = {
  not_started: 'Not started',
  draft: 'Draft',
  sent: 'Sent',
  opened: 'Opened',
  signed: 'Signed',
};

const STATE_STYLE: Record<Candidate['state'], string> = {
  not_started: 'bg-gray-100 text-gray-700',
  draft: 'bg-amber-50 text-amber-800',
  sent: 'bg-[#EFEAFB] text-[#42277C]',
  opened: 'bg-blue-50 text-blue-800',
  signed: 'bg-green-50 text-green-800',
};

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function when(iso: string | null) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DaysPill({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400">—</span>;
  const tone = days < 0 ? 'bg-red-50 text-red-700' : days <= 14 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{days < 0 ? `${-days}d ago` : `${days}d`}</span>;
}

export default function RenewalsV2Client() {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rateLock, setRateLock] = useState(true);
  const [filter, setFilter] = useState<'all' | 'not_started' | 'waiting'>('all');
  const [batch, setBatch] = useState<{ results: BatchResult[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(async () => { setTick((t) => t + 1); }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/renewals-v2?days=90', { credentials: 'include' })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        if (alive) { setError(null); setRows(j.candidates as Candidate[]); }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load renewals');
      });
    return () => { alive = false; };
  }, [tick]);

  const visible = useMemo(() => {
    const list = rows ?? [];
    if (filter === 'not_started') return list.filter((r) => r.state === 'not_started');
    if (filter === 'waiting') return list.filter((r) => r.state === 'sent' || r.state === 'opened');
    return list;
  }, [rows, filter]);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      all: list.length,
      not_started: list.filter((r) => r.state === 'not_started').length,
      waiting: list.filter((r) => r.state === 'sent' || r.state === 'opened').length,
    };
  }, [rows]);

  async function act(id: string, action: 'preview' | 'send') {
    setBusy(`${id}:${action}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/renewals-v2/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, rate_lock: rateLock }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      if (action === 'preview') {
        window.open(`${j.link}?preview=1`, '_blank', 'noopener');
      } else {
        setNotice(`Renewal link sent to ${j.sent_to}.`);
      }
      await load();
    } catch (e) {
      setNotice(`Could not ${action === 'send' ? 'send' : 'preview'}: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(null);
    }
  }

  async function runBatch(send: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(send ? 'batch:send' : 'batch:dry');
    setNotice(null);
    try {
      const res = await fetch('/api/admin/renewals-v2/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, send, rate_lock: rateLock }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      if (send) {
        const sent = (j.results as BatchResult[]).filter((r) => r.status === 'sent').length;
        setNotice(`Sent ${sent} of ${ids.length} renewal links.`);
        setBatch(null);
        setSelected(new Set());
        await load();
      } else {
        setBatch({ results: j.results as BatchResult[] });
      }
    } catch (e) {
      setNotice(`Batch failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const sendable = visible.filter((r) => r.email);
  const allSelected = sendable.length > 0 && sendable.every((r) => selected.has(r.id));
  const wouldSend = batch?.results.filter((r) => r.status === 'would_send') ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B6878]">Admin · Agreements</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#301D5D]">
            Renewals <span className="ml-1 rounded-full bg-[#EFEAFB] px-2 py-0.5 align-middle text-xs font-semibold text-[#42277C]">Beta</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#4A4757]">
            One-tap renewals: the partner confirms a pre-filled page and signs. This runs alongside the current renewal flow, which is unchanged.
          </p>
        </div>
        <Link href="/admin/agreements" className="rounded-full border border-[#D9D5E8] px-4 py-2 text-sm font-medium text-[#301D5D] hover:bg-[#F6F5FB]">
          Current agreements
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'All'], ['not_started', 'Not started'], ['waiting', 'Waiting on partner']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === key ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#D9D5E8] text-[#301D5D] hover:bg-[#F6F5FB]'}`}
          >
            {label} <span className="opacity-70">({counts[key]})</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-[#4A4757]">
          <input type="checkbox" checked={rateLock} onChange={(e) => setRateLock(e.target.checked)} />
          Include 72-hour rate lock
        </label>
      </div>

      {notice && <div className="rounded-lg border border-[#D9D5E8] bg-[#F6F5FB] px-4 py-2 text-sm text-[#301D5D]">{notice}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#D9D5E8] bg-white px-4 py-3">
          <span className="text-sm text-[#301D5D]">{selected.size} selected</span>
          <button
            onClick={() => runBatch(false)}
            disabled={busy !== null}
            className="rounded-full bg-[#301D5D] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#42277C] disabled:opacity-50"
          >
            {busy === 'batch:dry' ? 'Checking…' : 'Review before sending'}
          </button>
          <button onClick={() => { setSelected(new Set()); setBatch(null); }} className="text-sm text-[#6B6878] underline">Clear</button>
        </div>
      )}

      {batch && (
        <div className="space-y-3 rounded-lg border border-[#301D5D] bg-white p-4">
          <p className="text-sm font-semibold text-[#301D5D]">
            {wouldSend.length} renewal email{wouldSend.length === 1 ? '' : 's'} will be sent. Nothing has been sent yet.
          </p>
          <ul className="space-y-1 text-sm text-[#4A4757]">
            {batch.results.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-[#1B1726]">{r.company ?? r.id}</span>
                {r.status === 'would_send' ? ` → ${r.to}` : ` — skipped (${r.error})`}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={() => runBatch(true)}
              disabled={busy !== null || wouldSend.length === 0}
              className="rounded-full bg-[#301D5D] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#42277C] disabled:opacity-50"
            >
              {busy === 'batch:send' ? 'Sending…' : `Send ${wouldSend.length} now`}
            </button>
            <button onClick={() => setBatch(null)} className="rounded-full border border-[#D9D5E8] px-4 py-1.5 text-sm text-[#301D5D]">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#E6E5EC] bg-white">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-[#F6F5FB] text-xs uppercase tracking-wider text-[#6B6878]">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(sendable.map((r) => r.id)))}
                  aria-label="Select all with an email"
                />
              </th>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EEF6]">
            {rows === null && !error && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#6B6878]">Loading…</td></tr>
            )}
            {rows !== null && visible.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#6B6878]">No agreements due for renewal in this view.</td></tr>
            )}
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-3">
                  <input type="checkbox" disabled={!r.email} checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.company_name ?? 'agreement'}`} />
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-[#1B1726]">{r.company_name ?? '—'}</div>
                  <div className="text-xs text-[#6B6878]">{r.email ?? 'No email on file'}</div>
                </td>
                <td className="px-3 py-3 text-[#4A4757]">
                  {[r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel}
                  {r.needs_full_form && <div className="text-xs text-amber-700">Full form (not one-tap yet)</div>}
                </td>
                <td className="px-3 py-3 text-[#4A4757]">
                  {money(r.rate_cents)}
                  {r.new_rate_cents != null && r.new_rate_cents !== r.rate_cents && (
                    <div className="text-xs text-[#42277C]">renews at {money(r.new_rate_cents)}</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="text-[#4A4757]">{when(r.exp_date)}</div>
                  <DaysPill days={r.days_left} />
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  {r.last_sent_at && <div className="mt-1 text-xs text-[#6B6878]">Sent {new Date(r.last_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{r.reminders_sent ? ` · ${r.reminders_sent} reminder${r.reminders_sent === 1 ? '' : 's'}` : ''}</div>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => act(r.id, 'preview')}
                      disabled={busy !== null}
                      className="rounded-full border border-[#D9D5E8] px-3 py-1 text-xs font-medium text-[#301D5D] hover:bg-[#F6F5FB] disabled:opacity-50"
                    >
                      {busy === `${r.id}:preview` ? '…' : 'Preview'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Email the renewal link to ${r.email}?`)) void act(r.id, 'send');
                      }}
                      disabled={busy !== null || !r.email}
                      className="rounded-full bg-[#301D5D] px-3 py-1 text-xs font-medium text-white hover:bg-[#42277C] disabled:opacity-50"
                    >
                      {busy === `${r.id}:send` ? '…' : r.state === 'not_started' || r.state === 'draft' ? 'Send' : 'Resend'}
                    </button>
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
