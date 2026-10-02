'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type Party = { id: string; role: string; name: string; email: string };
type FollowUp = { id: string; kind: string; toName: string; toEmail: string; subject: string; body: string; status: 'draft' | 'sent' | 'dismissed'; sentAt: string | null };
type Risk = { id: string; severity: 'high' | 'medium'; title: string; detail: string; deadlineLabel?: string };
type Step = { title: string; offsetDays: number; anchor: 'effective' | 'closing' };
type Data = { parties: Party[]; followUps: FollowUp[]; risks: Risk[]; portalToken: string | null; checklist: Step[]; customChecklist: boolean };

const ROLES: Record<string, string> = { client: 'Client', lender: 'Lender', title: 'Title company', coop_agent: 'Co-op agent', other: 'Other' };
const btn = 'inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F8F5FF] disabled:opacity-45';
const btnPrimary = 'inline-flex min-h-[36px] items-center rounded-md bg-[#301D5D] px-3 text-xs font-bold text-white transition hover:bg-[#42277c] disabled:opacity-45';
const input = 'min-h-[36px] w-full rounded-md border border-slate-300 bg-white px-2 text-sm';

function stepsToText(steps: Step[]) { return steps.map((s) => `${s.title} | ${s.offsetDays} | ${s.anchor}`).join('\n'); }
function textToSteps(text: string): Step[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [title, days, anchor] = line.split('|').map((x) => x.trim());
    return { title: title.slice(0, 280), offsetDays: Number.parseInt(days ?? '0', 10) || 0, anchor: anchor === 'closing' ? 'closing' as const : 'effective' as const };
  });
}

export default function ClosingTimeAssist({ deal, onApplyChecklist }: { deal: AgentDeal; onApplyChecklist: (steps: Step[]) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState({ role: 'lender', name: '', email: '' });
  const [sigDetail, setSigDetail] = useState('');
  const [editing, setEditing] = useState<Record<string, Partial<FollowUp>>>({});
  const [checklistText, setChecklistText] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); setData(null); return; }
      setData(body as Data); setError('');
    } catch { setError('Could not load coordinator tools.'); }
  }, [deal.id]);
  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!live) return;
        if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); setData(null); return; }
        setData(body as Data); setError('');
      })
      .catch(() => { if (live) setError('Could not load coordinator tools.'); });
    return () => { live = false; };
  }, [deal.id, deal.updatedAt]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? 'Something went wrong.');
      await load();
      return res.ok ? body : null;
    } finally { setBusy(false); }
  };

  const portalUrl = data?.portalToken ? `${window.location.origin}/deal-portal/${data.portalToken}` : '';
  const partyByRole = (role: string) => data?.parties.find((p) => p.role === role);
  const drafts = data?.followUps.filter((f) => f.status === 'draft') ?? [];
  const sent = data?.followUps.filter((f) => f.status === 'sent').slice(0, 5) ?? [];

  return (
    <div className="min-w-0 border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-2">
      <h3 className="text-lg font-semibold text-slate-950">Transaction Coordinator</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Risk alerts, follow-up drafts, a client progress link, and a closing checklist for this deal. Nothing is emailed to anyone until you approve that specific draft.</p>
      {error && <p className="mt-3 text-sm font-semibold text-[#9A3D2B]" role="alert">{error}</p>}
      {!data ? <p className="mt-4 text-sm text-slate-500">{error ? '' : 'Loading.'}</p> : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <section aria-label="Risks">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Risk Alerts</h4>
            {data.risks.length === 0 ? <p className="mt-2 text-sm text-slate-500">No risks flagged for this deal.</p> : (
              <ul className="mt-2 space-y-2">
                {data.risks.map((r) => (
                  <li key={r.id} className={`border px-3 py-2 text-sm ${r.severity === 'high' ? 'border-[#9A3D2B] bg-[#FFF5F2]' : 'border-[#D9D0BF] bg-[#FFFDF8]'}`}>
                    <p className="font-semibold text-slate-950">{r.severity === 'high' ? 'Urgent: ' : ''}{r.title}</p>
                    <p className="mt-0.5 text-slate-600">{r.detail}</p>
                    {r.deadlineLabel && (
                      <button type="button" disabled={busy} className={`${btn} mt-2`} onClick={() => void post({ action: 'draft_extension', dealId: deal.id, riskId: r.id, partyId: partyByRole('coop_agent')?.id })}>Draft Extension Request</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Client portal">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Client Progress Link</h4>
            <p className="mt-2 text-sm text-slate-600">A read-only page for your client with key dates, documents, and open to-dos. No sign-in needed. It never shows your notes or form data.</p>
            {!data.portalToken ? (
              <button type="button" disabled={busy} className={`${btnPrimary} mt-3`} onClick={() => void post({ action: 'portal', dealId: deal.id })}>Create Link</button>
            ) : (
              <div className="mt-3 space-y-2">
                <input readOnly value={portalUrl} className={input} aria-label="Client progress link" onFocus={(e) => e.currentTarget.select()} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={() => { void navigator.clipboard.writeText(portalUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy Link'}</button>
                  <a className={btn} href={portalUrl} target="_blank" rel="noreferrer">Preview</a>
                  <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'portal', dealId: deal.id, reset: true })}>Reset Link</button>
                  <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'portal', dealId: deal.id, disable: true })}>Turn Off</button>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Deal contacts" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Deal Contacts</h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.parties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border border-slate-200 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-semibold text-slate-900">{ROLES[p.role] ?? p.role}</span> · {p.name || 'No name'} · {p.email || 'No email'}</span>
                  <button type="button" className="text-xs font-bold text-[#9A3D2B] underline" onClick={() => void post({ action: 'remove_party', partyId: p.id })}>Remove</button>
                </li>
              ))}
            </ul>
            <form className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (!party.email.trim()) return; void post({ action: 'add_party', dealId: deal.id, ...party }).then(() => setParty({ ...party, name: '', email: '' })); }}>
              <select className={input} value={party.role} onChange={(e) => setParty({ ...party, role: e.target.value })} aria-label="Role">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input className={input} placeholder="Name" value={party.name} onChange={(e) => setParty({ ...party, name: e.target.value })} aria-label="Contact name" />
              <input className={input} type="email" placeholder="Email" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} aria-label="Contact email" />
              <button type="submit" disabled={busy} className={btnPrimary}>Add</button>
            </form>
          </section>

          <section aria-label="Follow-ups" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Follow-Up Drafts</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'draft', dealId: deal.id, kind: 'intro' })}>Draft Intro To All Parties</button>
              <button type="button" disabled={busy || !partyByRole('lender')} className={btn} onClick={() => void post({ action: 'draft', dealId: deal.id, kind: 'lender', partyId: partyByRole('lender')?.id })}>Ask Lender For Status</button>
              <button type="button" disabled={busy || !partyByRole('title')} className={btn} onClick={() => void post({ action: 'draft', dealId: deal.id, kind: 'title', partyId: partyByRole('title')?.id })}>Ask Title For Status</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className={`${input} max-w-xs`} placeholder="Document needing a signature" value={sigDetail} onChange={(e) => setSigDetail(e.target.value)} aria-label="Document needing signature" />
              {data.parties.filter((p) => p.email).map((p) => (
                <button key={p.id} type="button" disabled={busy || !sigDetail.trim()} className={btn} onClick={() => void post({ action: 'draft', dealId: deal.id, kind: 'signature', partyId: p.id, detail: sigDetail.trim() })}>Signature Reminder: {p.name || ROLES[p.role]}</button>
              ))}
            </div>
            {drafts.length === 0 ? <p className="mt-3 text-sm text-slate-500">No drafts waiting.</p> : (
              <ul className="mt-3 space-y-3">
                {drafts.map((f) => {
                  const e = editing[f.id] ?? {};
                  const val = <K extends 'toEmail' | 'subject' | 'body'>(k: K) => (e[k] ?? f[k]) as string;
                  const patch = (k: string, v: string) => setEditing({ ...editing, [f.id]: { ...e, [k]: v } });
                  return (
                    <li key={f.id} className="border border-[#D9D0BF] bg-[#FFFDF8] p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input className={input} type="email" placeholder="To (email)" value={val('toEmail')} onChange={(ev) => patch('toEmail', ev.target.value)} aria-label="Recipient email" />
                        <input className={input} value={val('subject')} onChange={(ev) => patch('subject', ev.target.value)} aria-label="Subject" />
                      </div>
                      <textarea className="mt-2 min-h-[120px] w-full rounded-md border border-slate-300 bg-white p-2 text-sm" value={val('body')} onChange={(ev) => patch('body', ev.target.value)} aria-label="Message" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} className={btnPrimary} onClick={async () => {
                          if (Object.keys(e).length) await post({ action: 'edit_draft', id: f.id, ...e });
                          await post({ action: 'approve', id: f.id });
                          setEditing({ ...editing, [f.id]: {} });
                        }}>Approve And Send</button>
                        <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'dismiss', id: f.id })}>Dismiss</button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Sent with you copied; replies come to you.</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {sent.length > 0 && <p className="mt-3 text-xs text-slate-500">Recently sent: {sent.map((f) => f.subject).join(' · ')}</p>}
          </section>

          <section aria-label="Checklist">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Closing Checklist</h4>
            <p className="mt-2 text-sm text-slate-600">{data.checklist.length} steps{data.customChecklist ? ' (your template)' : ' (starter template)'}. Applying adds each step as a dated task. It needs the effective or closing date.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => onApplyChecklist(data.checklist)}>Apply To This Deal</button>
              <button type="button" className={btn} onClick={() => { setChecklistText(stepsToText(data.checklist)); setShowChecklist(!showChecklist); }}>{showChecklist ? 'Close Editor' : 'Edit Template'}</button>
            </div>
            {showChecklist && (
              <div className="mt-3">
                <textarea className="min-h-[170px] w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} aria-label="Checklist template" />
                <p className="mt-1 text-xs text-slate-500">One step per line: title | days | effective or closing. Use a negative number for days before closing.</p>
                <button type="button" disabled={busy} className={`${btnPrimary} mt-2`} onClick={async () => { const steps = textToSteps(checklistText); if (steps.length) { await post({ action: 'save_checklist', steps }); setShowChecklist(false); } }}>Save Template</button>
              </div>
            )}
          </section>

          <section aria-label="File history">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">File History</h4>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-600">
              {[...deal.activity].reverse().slice(0, 30).map((a) => (
                <li key={a.id}><span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> {a.message}</li>
              ))}
              {deal.activity.length === 0 && <li className="text-slate-500">No activity yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
