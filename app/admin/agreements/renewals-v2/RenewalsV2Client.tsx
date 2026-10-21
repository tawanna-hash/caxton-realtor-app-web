'use client';

// Renewals (Beta) admin workspace. Lists agreements due for renewal, shows the
// one-tap status for each, and lets you preview or send the partner link, one
// at a time or in a batch (always with a dry-run summary and a confirm step).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, RowMenu, ColumnStyle, EditColumns, EmptyState, FilterChip, useColumns, type ColumnDef } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

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
  not_started: 'bg-[color:var(--ds-page)] text-[color:var(--ds-body)]',
  draft: 'bg-amber-50 text-amber-800',
  sent: 'bg-[color:var(--ds-selected)] text-[color:var(--ds-primary-press)]',
  opened: 'bg-blue-50 text-blue-800',
  signed: 'bg-green-50 text-green-800',
};

const COLS: ColumnDef[] = [
  { key: 'ad', label: 'Ad', index: 3 },
  { key: 'rate', label: 'Rate', index: 4 },
  { key: 'expires', label: 'Expires', index: 5 },
  { key: 'status', label: 'Status', index: 6 },
];

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function when(iso: string | null) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DaysPill({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-500">—</span>;
  const tone = days < 0 ? 'bg-red-50 text-red-700' : days <= 14 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{days < 0 ? `${-days}d ago` : `${days}d`}</span>;
}

export default function RenewalsV2Client() {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cols = useColumns('renewals', COLS);
  const [rateLock, setRateLock] = useState(true);
  const [states, setStates] = useState<Candidate['state'][]>(['not_started', 'draft', 'sent', 'opened', 'signed']);
  const [month, setMonth] = useState('');
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

  const visible = useMemo(() => (rows ?? []).filter((r) => states.includes(r.state)), [rows, states]);

  // Months that have renewals due, for the monthly batch picker.
  const months = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      if (!r.exp_date) continue;
      const k = r.exp_date.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort(([x], [y]) => x.localeCompare(y));
  }, [rows]);

  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function selectMonth(k: string) {
    setMonth(k);
    setBatch(null);
    const ids = (rows ?? [])
      .filter((r) => r.exp_date?.startsWith(k) && r.email && !r.needs_full_form && (r.state === 'not_started' || r.state === 'draft'))
      .map((r) => r.id);
    setSelected(new Set(ids));
    setNotice(ids.length ? `${ids.length} renewal${ids.length === 1 ? '' : 's'} expiring in ${monthLabel(k)} selected. Review before sending.` : `Nothing left to send for ${monthLabel(k)}.`);
  }

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChip title="Status" value={states} onApply={setStates} options={[
          { value: 'not_started', label: 'Not started' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' },
          { value: 'opened', label: 'Opened' }, { value: 'signed', label: 'Signed' },
        ]} />
        <select
          aria-label="Monthly batch"
          value={month}
          onChange={(e) => (e.target.value ? selectMonth(e.target.value) : (setMonth(''), setSelected(new Set()), setBatch(null)))}
          className="anchor-chip rounded-full border border-[color:var(--ds-ink)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]"
        >
          <option value="">Monthly batch</option>
          {months.map(([k, n]) => <option key={k} value={k}>{monthLabel(k)} ({n})</option>)}
        </select>
        <div className="ml-auto flex items-center gap-4">
        <EditColumns cols={COLS} visible={cols.visible} onApply={cols.apply} />
        <label className="flex items-center gap-2 text-sm text-[color:var(--ds-ink)]">
          <input type="checkbox" className="accent-[color:var(--ds-primary)]" checked={rateLock} onChange={(e) => setRateLock(e.target.checked)} />
          Include 72-hour rate lock
        </label>
        </div>
      </div>

      {notice && <div className={A.notice}>{notice}</div>}
      {error && <div className={A.error}>{error}</div>}

      {selected.size > 0 && (
        <div className={`${A.card} flex flex-wrap items-center gap-3 px-4 py-3`}>
          <span className="text-sm text-[color:var(--ds-ink)]">{selected.size} selected</span>
          <button onClick={() => runBatch(false)} disabled={busy !== null} className={A.primary}>
            {busy === 'batch:dry' ? 'Checking…' : 'Review before sending'}
          </button>
          <button onClick={() => { setSelected(new Set()); setBatch(null); setMonth(''); }} className="text-sm text-[color:var(--ds-primary)] underline">Clear</button>
        </div>
      )}

      {batch && (
        <div className={`${A.card} space-y-3 border border-[color:var(--ds-primary)] p-5`}>
          <p className="text-sm font-semibold text-[color:var(--ds-ink)]">
            {wouldSend.length} renewal email{wouldSend.length === 1 ? '' : 's'} will be sent. Nothing has been sent yet.
          </p>
          <ul className="space-y-1 text-sm text-[color:var(--ds-body)]">
            {batch.results.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-[color:var(--ds-ink)]">{r.company ?? r.id}</span>
                {r.status === 'would_send' ? ` → ${r.to}` : ` — skipped (${r.error})`}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => setBatch(null)} className={A.outline}>Cancel</button>
            <button onClick={() => runBatch(true)} disabled={busy !== null || wouldSend.length === 0} className={A.primary}>
              {busy === 'batch:send' ? 'Sending…' : `Send ${wouldSend.length} now`}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <ColumnStyle tableClass="cols-renewals" cols={COLS} visible={cols.visible} />
        <SortTable rows={visible} cols={[{ label: (<input type="checkbox" className="accent-[color:var(--ds-primary)]" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(sendable.map((r) => r.id)))} aria-label="Select all with an email" />) }, { label: 'Partner', get: (r) => r.company_name }, { label: 'Ad', get: (r) => [r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel }, { label: 'Rate', get: (r) => r.rate_cents }, { label: 'Expires', get: (r) => r.exp_date }, { label: 'Status', get: (r) => r.state }, { label: '' }]} className={`${A.table} cols-renewals min-w-[900px]`}>
{(rws) => (<>
            {rows === null && !error && <tr><td colSpan={7} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {rows !== null && visible.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No renewals" body="No agreements due for renewal match your filters." action={{ label: 'Clear filters', onClick: () => setStates(['not_started', 'draft', 'sent', 'opened', 'signed']) }} /></td></tr>
            )}
            {rws.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" className="accent-[color:var(--ds-primary)]" disabled={!r.email} checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.company_name ?? 'agreement'}`} /></td>
                <td>
                  <div className="font-medium text-[color:var(--ds-ink)]">{r.company_name ?? '—'}</div>
                  <div className="text-xs text-[color:var(--ds-body)]">{r.email ?? 'No email on file'}</div>
                </td>
                <td className="text-[color:var(--ds-ink)]">
                  {[r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel}
                  {r.needs_full_form && <div className="text-xs text-amber-700">Opens the full form</div>}
                </td>
                <td className="text-[color:var(--ds-ink)]">
                  {money(r.rate_cents)}
                  {r.new_rate_cents != null && r.new_rate_cents !== r.rate_cents && <div className="text-xs text-[color:var(--ds-primary-press)]">renews at {money(r.new_rate_cents)}</div>}
                </td>
                <td>
                  <div className="text-[color:var(--ds-ink)]">{when(r.exp_date)}</div>
                  <DaysPill days={r.days_left} />
                </td>
                <td>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  {r.last_sent_at && <div className="mt-1 text-xs text-[color:var(--ds-body)]">Sent {new Date(r.last_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{r.reminders_sent ? ` · ${r.reminders_sent} reminder${r.reminders_sent === 1 ? '' : 's'}` : ''}</div>}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { if (window.confirm(`Email the renewal link to ${r.email}?`)) void act(r.id, 'send'); }}
                      disabled={busy !== null || !r.email}
                      className={A.small}
                    >
                      {busy === `${r.id}:send` ? '…' : r.state === 'not_started' || r.state === 'draft' ? 'Send' : 'Resend'}
                    </button>
                    <RowMenu items={[{ label: 'Copy preview link', onClick: () => void act(r.id, 'preview'), disabled: busy !== null }]} />
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
