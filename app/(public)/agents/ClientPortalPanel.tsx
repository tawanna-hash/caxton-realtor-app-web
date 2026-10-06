'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type View = {
  clientNames: string; clientSide: 'buyer' | 'seller'; daysToClosing: number | null;
  steps: { label: string; date: string; note: string; state: 'done' | 'current' | 'upcoming' }[];
  timeline: { id: string; label: string; date: string; done: boolean; note: string }[];
  forms: { family: string; label: string }[];
};

const btn = 'inline-flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white disabled:opacity-45';
const card = 'rounded-[10px] border border-[#E6E5EC] bg-white';
const lab = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

export default function ClientPortalPanel({ deal }: { deal: AgentDeal }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
      setToken(body.portalToken ?? null); setError('');
    } catch { setError('Could not load the client portal.'); }
  }, [deal.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!token) { setView(null); return; }
    let live = true;
    fetch(`/api/deal-portal/${token}/view`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => { if (live) setView(v); }).catch(() => undefined);
    return () => { live = false; };
  }, [token, deal.updatedAt]);

  const act = async (extra: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'portal', dealId: deal.id, ...extra }) });
      if (!res.ok) setError((await res.json()).error ?? 'Something went wrong.');
      await load();
    } catch { setError('Something went wrong.'); }
    setBusy(false);
  };

  const url = token ? `${window.location.origin}/deal-portal/${token}` : '';
  const side = deal.agentSide === 'listing' ? 'seller' : 'buyer';
  const names = view?.clientNames || (side === 'seller' ? deal.sellerNames : deal.buyerNames) || 'Your Clients';
  const contacts = deal.clientContacts ?? [];
  const done = view?.steps.filter((s) => s.state === 'done').length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Client Portal</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">One private link for everyone on this deal. No sign-in needed.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h3 className="text-[14px] font-semibold text-[#1B1726]">Preview</h3>
          <div className="mt-3">
            {token ? <a className={`${btn} w-full justify-center`} href={url} target="_blank" rel="noreferrer">View As Client</a> : <p className="text-[14px] text-[#4A4757]">Create the link to preview the client view.</p>}
          </div>
          <p className="mt-3 text-[14px] text-[#4A4757]">{names}&apos;s view of this deal: progress, deadlines, forms and uploads.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#F6F3FB] p-3"><div className="text-[24px] font-semibold text-[#1B1726]">{view ? `${done}/${view.steps.length}` : '-'}</div><div className="text-[12px] font-medium text-[#7A7787]">Milestones</div></div>
            <div className="rounded-lg bg-[#F6F3FB] p-3"><div className="text-[24px] font-semibold text-[#1B1726]">{view ? view.forms.length : '-'}</div><div className="text-[12px] font-medium text-[#7A7787]">Forms To View</div></div>
          </div>
        </section>

        <section className={`${card} p-4`}>
          <h3 className="text-[14px] font-semibold text-[#1B1726]">Share With {names}</h3>
          <p className="mt-2 text-[14px] text-[#4A4757]">Copy the link and send it however you like: email, text or WhatsApp. Everyone on the deal uses the same link, and nothing needs a password. Clients see only what is listed below.</p>
          {token === undefined && !error && <p className="mt-3 text-[12px] font-medium text-[#7A7787]">Loading</p>}
          {token === null && <div className="mt-3"><button type="button" disabled={busy} className={btn} onClick={() => void act({})}>Create Link</button></div>}
          {token && (
            <div className="mt-3 space-y-3">
              {contacts.length > 0 && (
                <ul className="rounded-lg border border-[#E6E5EC] px-3">
                  {contacts.map((c) => (
                    <li key={c.id} className="border-b border-[#E6E5EC] py-2 last:border-0">
                      <div className="text-[14px] font-medium text-[#1B1726]">{c.name}</div>
                      <div className="text-[12px] font-medium text-[#7A7787]">{c.email || 'No email'}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input readOnly value={url} aria-label="Client portal link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726]" />
                <button type="button" className={btn} onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Reset the link? The old link will stop working.')) void act({ reset: true }); }}>Reset Link</button>
                <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Turn off the link? Clients will no longer be able to open it.')) void act({ disable: true }); }}>Turn Off</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-[12px] font-medium text-[#9A3D2B]">{error}</p>}
        </section>
      </div>

      <section className={card}>
        <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3.5">
          <h3 className="text-[14px] font-semibold text-[#1B1726]">What {names} See</h3>
          {view && <span className="text-[12px] font-medium text-[#7A7787]">{done}/{view.steps.length}</span>}
        </div>
        {!token && <p className="p-4 text-[14px] text-[#4A4757]">Create the link to see exactly what clients see.</p>}
        {token && !view && <p className="p-4 text-[12px] font-medium text-[#7A7787]">Loading</p>}
        {view && (
          <div className="p-4">
            <ol>
              {view.steps.map((s, i) => (
                <li key={s.label} className="relative pb-5 pl-8 last:pb-0">
                  {i < view.steps.length - 1 && <span className="absolute bottom-0 left-[7px] top-5 w-[2px] bg-[#E6E5EC]" aria-hidden="true" />}
                  <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] text-white" style={{ borderColor: s.state === 'upcoming' ? '#E6E5EC' : '#301D5D', background: s.state === 'done' ? '#301D5D' : '#fff' }} aria-hidden="true">{s.state === 'done' ? '✓' : ''}</span>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[14px] ${s.state === 'upcoming' ? 'font-medium text-[#7A7787]' : 'font-semibold text-[#1B1726]'}`}>{s.label}</span>
                    {s.date && <span className="text-[12px] font-medium text-[#7A7787]">{s.state === 'done' ? 'Done' : 'Expected'} {fmt(s.date)}</span>}
                  </div>
                  {s.note && <p className="text-[12px] font-medium text-[#7A7787]">{s.note}</p>}
                </li>
              ))}
            </ol>
            {view.forms.length > 0 && (
              <div className="mt-5 border-t border-[#E6E5EC] pt-4">
                <div className={lab}>Forms Clients Can View</div>
                <ul className="mt-2 text-[14px] font-medium text-[#1B1726]">{view.forms.map((f) => <li key={f.family} className="py-0.5">{f.label}</li>)}</ul>
              </div>
            )}
            <p className="mt-4 text-[12px] font-medium text-[#7A7787]">Clients can also upload documents. Never shown: your notes, activity or internal checklists.</p>
          </div>
        )}
      </section>
    </div>
  );
}
