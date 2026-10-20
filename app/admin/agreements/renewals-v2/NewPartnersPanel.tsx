'use client';

// New-partner agreements (Beta) admin tab. Lists unsigned agreements created
// from quotes, shows where each is in the 3-screen flow, and lets you preview
// the partner page or email the link.

import { useCallback, useEffect, useMemo, useState } from 'react';

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
