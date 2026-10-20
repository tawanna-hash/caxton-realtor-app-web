'use client';

// New-partner agreements (Beta) admin tab. Lists unsigned agreements created
// from quotes, shows where each is in the 3-screen flow, and lets you preview
// the partner page or email the link.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Template } from './TemplatesPanel';

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
};

const STATE_LABEL: Record<Candidate['state'], string> = {
  not_started: 'Not sent',
  live_sent: 'Sent (current flow)',
  sent: 'Sent',
  opened: 'Opened',
};
const STATE_STYLE: Record<Candidate['state'], string> = {
  not_started: 'bg-gray-100 text-gray-700',
  live_sent: 'bg-amber-50 text-amber-800',
  sent: 'bg-[#EFEAFB] text-[#42277C]',
  opened: 'bg-blue-50 text-blue-800',
};

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function NewPartnersPanel() {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [nf, setNf] = useState({ template: '', company: '', contact: '', email: '', publication: 'austin', start: '' });
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

  useEffect(() => {
    if (!creating) return;
    fetch('/api/admin/agreements-v2/templates', { credentials: 'include' }).then((r) => r.json()).then((j) => setTemplates((j.templates ?? []) as Template[])).catch(() => setTemplates([]));
  }, [creating]);

  async function createAgreement() {
    setNotice(null);
    const t = templates.find((x) => x.id === nf.template);
    if (!nf.company.trim() || !nf.contact.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nf.email)) return setNotice('Enter the company, contact name and a valid email.');
    if (!t || !t.ad_size || !t.ad_rate_cents || !nf.start) return setNotice('Pick a template with an ad size and rate, and a start date.');
    const months = Math.max(1, parseInt(String(t.frequency ?? '1'), 10) || 1);
    const s = new Date(`${nf.start}T00:00:00Z`);
    const end = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, 0)).toISOString().slice(0, 10);
    const res = await fetch('/api/admin/agreements', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'draft', type: 'print_ad', publication: nf.publication, company_name: nf.company.trim(), rep_name: nf.contact.trim(), advertiser_email: nf.email.trim(), billing_email: nf.email.trim(), ad_size: t.ad_size, frequency: t.frequency, ad_rate_cents: t.ad_rate_cents, amount_cents: t.ad_rate_cents * months, start_date: nf.start, end_date: end }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setNotice(j.error ?? 'Could not create the agreement.');
    setNf({ template: '', company: '', contact: '', email: '', publication: nf.publication, start: '' });
    setCreating(false);
    setNotice('Draft agreement created. Preview it, then send.');
    reload();
  }

  const list = useMemo(() => rows ?? [], [rows]);

  async function act(id: string, action: 'preview' | 'send') {
    setBusy(`${id}:${action}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/new-partner-v2/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`);
      if (action === 'preview') window.open(`${j.link}?preview=1`, '_blank', 'noopener');
      else setNotice(`Agreement link sent to ${j.sent_to}.`);
      reload();
    } catch (e) {
      setNotice(`Could not ${action === 'send' ? 'send' : 'preview'}: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-[#4A4757]">
        New partners review, pay and sign on one short page. Build the quote the usual way, then send the link from here. Card payments and multi-product orders continue on the existing full form.
      </p>
      <div className="flex justify-end">
        <button onClick={() => setCreating((c) => !c)} className="rounded-full bg-[#301D5D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#42277C]">Create agreement</button>
      </div>
      {creating && (
        <div className="grid gap-3 rounded-2xl border border-[#E6E5EC] bg-white p-4 sm:grid-cols-3">
          <select aria-label="Template" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.template} onChange={(e) => setNf({ ...nf, template: e.target.value })}>
            <option value="">Choose a template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select aria-label="Market" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.publication} onChange={(e) => setNf({ ...nf, publication: e.target.value })}>
            <option value="austin">RealtyLine (Austin)</option>
            <option value="san_antonio">Newsline (San Antonio)</option>
          </select>
          <input aria-label="Start date" type="date" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.start} onChange={(e) => setNf({ ...nf, start: e.target.value })} />
          <input aria-label="Company" placeholder="Company" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.company} onChange={(e) => setNf({ ...nf, company: e.target.value })} />
          <input aria-label="Contact name" placeholder="Contact name" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.contact} onChange={(e) => setNf({ ...nf, contact: e.target.value })} />
          <input aria-label="Email" placeholder="Email" type="email" className="rounded-lg border border-[#D9D5E8] px-3 py-2 text-sm" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
          <div className="sm:col-span-3"><button onClick={createAgreement} className="rounded-full bg-[#301D5D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#42277C]">Save draft</button></div>
        </div>
      )}
      {notice && <div className="rounded-lg border border-[#D9D5E8] bg-[#F6F5FB] px-4 py-2 text-sm text-[#301D5D]">{notice}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-[#E6E5EC] bg-white">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="bg-[#F6F5FB] text-xs uppercase tracking-wider text-[#6B6878]">
            <tr>
              <th className="px-3 py-2">Partner</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EEF6]">
            {rows === null && !error && <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6B6878]">Loading…</td></tr>}
            {rows !== null && list.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6B6878]">No unsigned agreements waiting.</td></tr>}
            {list.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-3">
                  <div className="font-medium text-[#1B1726]">{r.company_name ?? '—'}</div>
                  <div className="text-xs text-[#6B6878]">{r.email ?? 'No email on file'}</div>
                </td>
                <td className="px-3 py-3 text-[#4A4757]">
                  {[r.ad_size, r.frequency].filter(Boolean).join(' · ') || r.channel}
                  {r.needs_full_form && <div className="text-xs text-amber-700">Full form (not one-page yet)</div>}
                </td>
                <td className="px-3 py-3 text-[#4A4757]">{money(r.total_cents)}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                  {r.last_sent_at && <div className="mt-1 text-xs text-[#6B6878]">Sent {new Date(r.last_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => act(r.id, 'preview')} disabled={busy !== null} className="rounded-full border border-[#D9D5E8] px-3 py-1 text-xs font-medium text-[#301D5D] hover:bg-[#F6F5FB] disabled:opacity-50">
                      {busy === `${r.id}:preview` ? '…' : 'Preview'}
                    </button>
                    <button
                      onClick={() => { if (window.confirm(`Email the agreement link to ${r.email}?`)) void act(r.id, 'send'); }}
                      disabled={busy !== null || !r.email}
                      className="rounded-full bg-[#301D5D] px-3 py-1 text-xs font-medium text-white hover:bg-[#42277C] disabled:opacity-50"
                    >
                      {busy === `${r.id}:send` ? '…' : r.state === 'sent' || r.state === 'opened' ? 'Resend' : 'Send'}
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
