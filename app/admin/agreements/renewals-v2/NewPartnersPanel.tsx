'use client';

// New-partner agreements (Beta) admin tab. Lists unsigned agreements created
// from quotes, shows where each is in the 3-screen flow, and lets you preview
// the partner page or email the link. "Create agreement" opens a modal laid out
// like Anchor's "Bill client" dialog.

import { useCallback, useEffect, useMemo, useState } from 'react';
import BillingTimeline, { type TimelineView } from '@/components/anchor/TimelineView';
import { A, RowMenu, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Candidate = {
  id: string;
  company_name: string | null;
  rep_name: string | null;
  email: string | null;
  status: string;
  channel: string;
  ad_size: string | null;
  frequency: string | null;
  rate_cents: number | null;
  total_cents: number | null;
  needs_full_form: boolean;
  state: 'not_started' | 'live_sent' | 'sent' | 'opened';
  last_sent_at: string | null;
  check_request?: 'requested' | 'approved' | null;
};

const STATE_LABEL: Record<Candidate['state'], string> = { not_started: 'Not sent', live_sent: 'Sent (current flow)', sent: 'Sent', opened: 'Opened' };
const STATE_STYLE: Record<Candidate['state'], string> = {
  not_started: 'bg-[color:var(--ds-page)] text-[color:var(--ds-body)]',
  live_sent: 'bg-amber-50 text-amber-800',
  sent: 'bg-[color:var(--ds-selected)] text-[color:var(--ds-primary-press)]',
  opened: 'bg-blue-50 text-blue-800',
};

const money = (c: number | null) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

function Floating({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute -top-2 left-3 z-10 bg-white px-1 text-[11px] text-[color:var(--ds-body)]">{label}</span>
      {children}
    </div>
  );
}

export default function NewPartnersPanel() {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ ad_size: '', months: '1', rate: '', company: '', contact: '', email: '', publication: 'austin', start: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/new-partner-v2', { credentials: 'include' })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`);
        if (alive) { setError(null); setRows(j.candidates as Candidate[]); }
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load agreements'); });
    return () => { alive = false; };
  }, [tick]);

  async function createAgreement() {
    setFormError(null);
    const rateCents = Math.round(parseFloat(nf.rate) * 100);
    if (!nf.ad_size.trim()) return setFormError('Enter the ad size.');
    if (!(rateCents > 0)) return setFormError('Enter a valid monthly rate.');
    if (!nf.company.trim() || !nf.contact.trim()) return setFormError('Enter the company and contact name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nf.email)) return setFormError('Enter a valid email address.');
    if (!nf.start) return setFormError('Choose a start date.');
    const months = Math.max(1, parseInt(nf.months || '1', 10) || 1);
    const s = new Date(`${nf.start}T00:00:00Z`);
    const end = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, 0)).toISOString().slice(0, 10);
    const res = await fetch('/api/admin/agreements', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'draft', type: 'print_ad', publication: nf.publication, company_name: nf.company.trim(), rep_name: nf.contact.trim(), advertiser_email: nf.email.trim(), billing_email: nf.email.trim(), ad_size: nf.ad_size.trim(), frequency: String(months), ad_rate_cents: rateCents, amount_cents: rateCents * months, start_date: nf.start, end_date: end }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setFormError(j.error ?? 'Could not create the agreement.');
    setNf({ ad_size: '', months: '1', rate: '', company: '', contact: '', email: '', publication: nf.publication, start: '' });
    setCreating(false);
    setNotice('Draft agreement created. Preview it, then send.');
    reload();
  }

  const list = useMemo(() => (rows ?? []).filter((r) => (r.company_name ?? '').toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  const [tl, setTl] = useState<{ row: Candidate; check: TimelineView; card: TimelineView; mode: 'view' | 'send' } | null>(null);

  async function openTimeline(row: Candidate, mode: 'view' | 'send') {
    setBusy(`${row.id}:timeline`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/agreements-v2/${row.id}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'timeline' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      setTl({ row, check: j.check, card: j.card, mode });
    } catch (e) {
      setNotice(`Could not load the billing timeline: ${e instanceof Error ? e.message : 'error'}`);
    } finally { setBusy(null); }
  }

  async function act(id: string, action: 'preview' | 'send' | 'approve_check') {
    setBusy(`${id}:${action}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/new-partner-v2/${id}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      if (action === 'preview') window.open(`${j.link}?preview=1`, '_blank', 'noopener');
      else if (action === 'approve_check') setNotice('Check payment approved. The partner can now choose to pay by check.');
      else setNotice(`Agreement link sent to ${j.sent_to}.`);
      reload();
    } catch (e) {
      setNotice(`Could not ${action === 'send' ? 'send' : 'preview'}: ${e instanceof Error ? e.message : 'error'}`);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={q} onChange={setQ} label="Search new partners" />
        <div className="flex items-center gap-3">
          <a href="/admin/agreements/renewals-v2?new=1" className={A.primary}>Create agreement</a>
        </div>
      </div>
      {notice && <div className={A.notice}>{notice}</div>}
      {error && <div className={A.error}>{error}</div>}
      <div className="overflow-x-auto">
        <SortTable rows={list} cols={[{ label: 'Partner', get: (r) => r.company_name }, { label: 'Order', get: (r) => [r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel }, { label: 'Total', get: (r) => r.total_cents }, { label: 'Status', get: (r) => r.state }, { label: '' }]} className={`${A.table} min-w-[820px]`}>
{(rws) => (<>
            {rows === null && !error && <tr><td colSpan={5} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {rows !== null && list.length === 0 && <tr><td colSpan={5}><EmptyState title="No agreements" body="No unsigned agreements are waiting." /></td></tr>}
            {rws.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="font-medium text-[color:var(--ds-ink)]">{r.company_name ?? '—'}</div>
                  <div className="text-xs text-[color:var(--ds-body)]">{r.email ?? 'No email on file'}</div>
                </td>
                <td className="text-[color:var(--ds-ink)]">
                  {[r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel}
                  {r.needs_full_form && <div className="text-xs text-amber-700">Opens the full form</div>}
                </td>
                <td className="text-[color:var(--ds-ink)]">{money(r.total_cents)}</td>
                <td>
                  <span className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  {r.check_request === 'requested' && <div className="mt-1 text-xs text-amber-700">Asked to pay by check</div>}
                  {r.check_request === 'approved' && <div className="mt-1 text-xs text-green-700">Check approved</div>}
                  {r.last_sent_at && <div className="mt-1 text-xs text-[color:var(--ds-body)]">{new Date(r.last_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    {r.check_request === 'requested' ? (
                      <button onClick={() => act(r.id, 'approve_check')} disabled={busy !== null} className={A.small}>{busy === `${r.id}:approve_check` ? '…' : 'Approve check'}</button>
                    ) : (
                      <button onClick={() => void openTimeline(r, 'send')} disabled={busy !== null || !r.email} className={A.small}>
                        {busy === `${r.id}:send` ? '…' : r.state === 'sent' || r.state === 'opened' ? 'Resend' : 'Send'}
                      </button>
                    )}
                    <RowMenu items={[
                      ...(r.check_request === 'requested' ? [{ label: r.state === 'sent' || r.state === 'opened' ? 'Resend' : 'Send', onClick: () => void openTimeline(r, 'send'), disabled: busy !== null || !r.email }] : []),
                      { label: 'Copy preview link', onClick: () => void act(r.id, 'preview'), disabled: busy !== null },
                      { label: 'View billing timeline', onClick: () => void openTimeline(r, 'view'), disabled: busy !== null },
                    ]} />
                  </div>
                </td>
              </tr>
            ))}
          </>)}
</SortTable>
      </div>

      {tl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Billing timeline">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[10px] bg-white shadow-xl">
            <div className="relative bg-[color:var(--ds-selected)] px-6 py-5 text-center">
              <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Billing timeline</h2>
              <p className="text-sm text-[color:var(--ds-body)]">{tl.row.company_name ?? 'Partner'}</p>
              <button type="button" aria-label="Close" onClick={() => setTl(null)} className="absolute right-4 top-4 text-xl leading-none text-[color:var(--ds-ink)]">×</button>
            </div>
            <div className="space-y-6 px-6 py-6">
              {tl.check && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-ink)]">If the partner pays by check</h3>
                  <BillingTimeline timeline={tl.check} />
                </section>
              )}
              <section>
                <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-ink)]">If the partner pays by card</h3>
                <BillingTimeline timeline={tl.card} />
              </section>
              {tl.mode === 'send' && <p className="text-sm text-[color:var(--ds-body)]">The partner sees this timeline on the agreement page. Nothing is sent until you confirm.</p>}
              <div className="flex justify-end gap-3">
                <button type="button" className={A.outline} onClick={() => setTl(null)}>{tl.mode === 'send' ? 'Cancel' : 'Close'}</button>
                {tl.mode === 'send' && (
                  <button type="button" className={A.primary} onClick={() => { const id = tl.row.id; setTl(null); void act(id, 'send'); }}>Send to {tl.row.email}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Create agreement">
          <div className="w-full max-w-md overflow-hidden rounded-[10px] bg-white shadow-xl">
            <div className="relative bg-[color:var(--ds-selected)] px-6 py-5 text-center">
              <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Create agreement</h2>
              <button type="button" aria-label="Close" onClick={() => setCreating(false)} className="absolute right-4 top-4 text-xl leading-none text-[color:var(--ds-ink)]">×</button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <Floating label="Ad size"><input className={A.input} placeholder="1/4 page" value={nf.ad_size} onChange={(e) => setNf({ ...nf, ad_size: e.target.value })} /></Floating>
              <div className="grid grid-cols-2 gap-4">
                <Floating label="Months"><input className={A.input} inputMode="numeric" value={nf.months} onChange={(e) => setNf({ ...nf, months: e.target.value })} /></Floating>
                <Floating label="Monthly rate ($)"><input className={A.input} inputMode="decimal" value={nf.rate} onChange={(e) => setNf({ ...nf, rate: e.target.value })} /></Floating>
              </div>
              <Floating label="Market">
                <select className={A.input} value={nf.publication} onChange={(e) => setNf({ ...nf, publication: e.target.value })}>
                  <option value="austin">RealtyLine (Austin)</option>
                  <option value="san_antonio">Newsline (San Antonio)</option>
                </select>
              </Floating>
              <Floating label="Company"><input className={A.input} value={nf.company} onChange={(e) => setNf({ ...nf, company: e.target.value })} /></Floating>
              <Floating label="Contact name"><input className={A.input} value={nf.contact} onChange={(e) => setNf({ ...nf, contact: e.target.value })} /></Floating>
              <Floating label="Email"><input className={A.input} type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Floating>
              <Floating label="Start date"><input aria-label="Start date" type="date" value={nf.start} onChange={(e) => setNf({ ...nf, start: e.target.value })} /></Floating>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <div className="flex justify-center gap-3 pt-1">
                <button type="button" onClick={() => setCreating(false)} className={A.outline}>Cancel</button>
                <button type="button" onClick={createAgreement} className={A.primary}>Continue</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
