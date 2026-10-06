'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import Tip from './Tip';

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

type Link = { key: string; name: string; token: string };
export type Person = { key: string; name: string; email: string };
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function clientsOf(deal: AgentDeal): Person[] {
  const clientRe = /buyer|seller|client|tenant|landlord|owner/i;
  const people: Person[] = [];
  const add = (name: string, email: string) => { const key = keyOf(name); if (key && !people.some((p) => p.key === key)) people.push({ key, name: name.trim(), email }); };
  (deal.clientContacts ?? []).filter((p) => !p.role || clientRe.test(p.role)).forEach((p) => add(p.name, p.email ?? ''));
  const names = deal.agentSide === 'listing' ? deal.sellerNames : deal.buyerNames;
  (names || '').split(/\s*(?:&|,|\/|\band\b)\s*/i).forEach((n) => add(n, ''));
  return people;
}

export default function ClientPortalPanel({ deal }: { deal: AgentDeal }) {
  const [links, setLinks] = useState<Link[] | undefined>(undefined);
  const [viewData, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
      setLinks(body.portalLinks ?? []); setError('');
    } catch { setError('Could not load the client portal.'); }
  }, [deal.id]);
  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!live) return;
        if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
        setLinks(body.portalLinks ?? []); setError('');
      })
      .catch(() => { if (live) setError('Could not load the client portal.'); });
    return () => { live = false; };
  }, [deal.id, deal.updatedAt]);

  const previewToken = links?.[0]?.token ?? null;
  useEffect(() => {
    if (!previewToken) return;
    let live = true;
    fetch(`/api/deal-portal/${previewToken}/view`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => { if (live) setView(v); }).catch(() => undefined);
    return () => { live = false; };
  }, [previewToken, deal.updatedAt]);

  const act = async (person: Person, extra: Record<string, unknown>) => {
    setBusy(person.key); setError('');
    try {
      const res = await fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'portal_link', dealId: deal.id, name: person.name, ...extra }) });
      if (!res.ok) setError((await res.json()).error ?? 'Something went wrong.');
      await load();
    } catch { setError('Something went wrong.'); }
    setBusy('');
  };

  const view = previewToken ? viewData : null;
  const people = clientsOf(deal);
  const linkFor = (p: Person) => links?.find((l) => l.key === p.key);
  const urlOf = (l: Link) => `${window.location.origin}/deal-portal/${l.token}`;
  const side = deal.agentSide === 'listing' ? 'seller' : 'buyer';
  const names = view?.clientNames || (side === 'seller' ? deal.sellerNames : deal.buyerNames) || 'Your Clients';
  const done = view?.steps.filter((s) => s.state === 'done').length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Client Portal</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Each person gets their own private link. No sign-in needed.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4`}>
          <h3 className="text-[14px] font-semibold text-[#1B1726]">Preview</h3>
          <div className="mt-3 space-y-2">
            {people.map((p) => {
              const l = linkFor(p);
              return l
                ? <a key={p.key} className={`${btn} w-full justify-center`} href={urlOf(l)} target="_blank" rel="noreferrer">View As {firstName(p.name)}</a>
                : <span key={p.key} className="block rounded-lg border border-dashed border-[#E6E5EC] px-3 py-1.5 text-center text-[13px] font-medium text-[#7A7787]">View As {firstName(p.name)} (Create Link First)</span>;
            })}
            {people.length === 0 && <p className="text-[14px] text-[#4A4757]">Add the buyers or sellers on the People tab first.</p>}
          </div>
          <p className="mt-3 text-[14px] text-[#4A4757]">{names}&apos;s view of this deal: progress, deadlines, forms and uploads.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#F6F3FB] p-3"><div className="text-[24px] font-semibold text-[#1B1726]">{view ? `${done}/${view.steps.length}` : '-'}</div><div className="text-[12px] font-medium text-[#7A7787]">Milestones</div></div>
            <div className="rounded-lg bg-[#F6F3FB] p-3"><div className="text-[24px] font-semibold text-[#1B1726]">{view ? view.forms.length : '-'}</div><div className="text-[12px] font-medium text-[#7A7787]">Forms To View</div></div>
          </div>
        </section>

        <section className={`${card} p-4`}>
          <h3 className="text-[14px] font-semibold text-[#1B1726]">Share With {names}</h3>
          <p className="mt-2 text-[14px] text-[#4A4757]">Copy a personal link for each person and send it however you like: email, text or WhatsApp. Anyone with a link sees the deal, so send each link only to that person. Resetting or turning off a link stops it from working.</p>
          {links === undefined && !error && <p className="mt-3 text-[12px] font-medium text-[#7A7787]">Loading</p>}
          {links !== undefined && (
            <ul className="mt-3 rounded-lg border border-[#E6E5EC] px-3">
              {people.map((p) => {
                const l = linkFor(p);
                return (
                  <li key={p.key} className="border-b border-[#E6E5EC] py-3 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-[#1B1726]">{p.name}</div>
                        <div className="truncate text-[12px] font-medium text-[#7A7787]">{p.email || 'No email'}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!l && <button type="button" disabled={busy === p.key} className={btn} onClick={() => void act(p, {})}>Create Link</button>}
                        {l && <button type="button" className={btn} onClick={() => { void navigator.clipboard.writeText(urlOf(l)); setCopied(p.key); setTimeout(() => setCopied(''), 1500); }}>{copied === p.key ? 'Copied' : 'Copy Link'}</button>}
                        {l && <button type="button" disabled={busy === p.key} className={btn} onClick={() => { if (window.confirm(`Reset ${firstName(p.name)}'s link? The old link will stop working.`)) void act(p, { reset: true }); }}>Reset</button>}
                        {l && <button type="button" disabled={busy === p.key} className={btn} onClick={() => { if (window.confirm(`Turn off ${firstName(p.name)}'s link?`)) void act(p, { disable: true }); }}>Turn Off</button>}
                      </div>
                    </div>
                    {l && <input readOnly value={urlOf(l)} aria-label={`${p.name} link`} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4A4757]" />}
                  </li>
                );
              })}
              {people.length === 0 && <li className="py-3 text-[14px] text-[#4A4757]">No clients on this deal yet.</li>}
            </ul>
          )}
          {error && <p role="alert" className="mt-3 text-[12px] font-medium text-[#661102]">{error}</p>}
        </section>
      </div>

      <section className={card}>
        <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3.5">
          <h3 className="text-[14px] font-semibold text-[#1B1726]">What {names} See</h3>
          {view && <span className="text-[12px] font-medium text-[#7A7787]">{done}/{view.steps.length}</span>}
        </div>
        {!previewToken && <p className="p-4 text-[14px] text-[#4A4757]">Create a link to see exactly what clients see.</p>}
        {previewToken && !view && <p className="p-4 text-[12px] font-medium text-[#7A7787]">Loading</p>}
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
            <Tip text="Clients can also upload documents. Never shown: your notes, activity or internal checklists." />
          </div>
        )}
      </section>
    </div>
  );
}
