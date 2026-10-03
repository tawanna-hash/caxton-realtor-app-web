'use client';

import { useCallback, useEffect, useState } from 'react';
import { SecureSignRequests, SecureSignSettings, type SignLayout, type SignRequestRow, type SignSettings } from './SecureSignPanel';
import SignaturePlacer, { type PlacedField } from './SignaturePlacer';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type Party = { id: string; role: string; name: string; email: string };
type FollowUp = { id: string; kind: string; toName: string; toEmail: string; subject: string; body: string; status: 'draft' | 'sent' | 'dismissed'; sentAt: string | null };
type Risk = { id: string; severity: 'high' | 'medium'; title: string; detail: string; deadlineLabel?: string };
type Step = { title: string; offsetDays: number; anchor: 'effective' | 'closing' };
type Upload = { id: string; docId: string; filename: string; sizeBytes: number; createdAt: string; reviewed: boolean };
type Sig = { id: string; toName: string; toEmail: string; document: string; status: string; remindersSent: number; createdAt: string };
type Connected = { calendar: string | null; mail: string | null; storage: { slug: string; name: string }[]; sendFromConnected: boolean };
type Envelope = { id: string; provider: string; document: string; signers: { name: string; email: string }[]; status: string; createdAt: string };
type Signing = { providers: { slug: string; name: string }[]; envelopes: Envelope[]; settings: SignSettings | null; requests: SignRequestRow[]; layouts: (SignLayout & { fields: PlacedField[] })[] };
type Data = { connected?: Connected; signing?: Signing; signatures: Sig[]; autoSignature: boolean; uploads: Upload[]; autoIntro: boolean; parties: Party[]; followUps: FollowUp[]; risks: Risk[]; portalToken: string | null; checklist: Step[]; customChecklist: boolean };

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

export default function ClosingTimeAssist({ deal, onApplyChecklist, onMarkReceived }: { deal: AgentDeal; onApplyChecklist: (steps: Step[]) => void; onMarkReceived: (docId: string, fileName: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState({ role: 'lender', name: '', email: '' });
  const [sigDetail, setSigDetail] = useState('');
  const [editing, setEditing] = useState<Record<string, Partial<FollowUp>>>({});
  const [checklistText, setChecklistText] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extDays, setExtDays] = useState(3);
  const [newClosing, setNewClosing] = useState('');
  const [notice, setNotice] = useState('');

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
      await load();
      if (!res.ok) setError(body.error ?? 'Something went wrong.');
      return res.ok ? body : null;
    } finally { setBusy(false); }
  };

  const syncCal = async () => {
    setNotice('');
    const r = await post({ action: 'calendar_sync', dealId: deal.id });
    if (r?.result) setNotice(`Calendar updated: ${r.result.added} added, ${r.result.updated} changed, ${r.result.unchanged} already there.`);
  };
  const saveFile = async (id: string, storage: string) => {
    setNotice('');
    const r = await post({ action: 'save_upload', dealId: deal.id, id, storage });
    if (r?.message) setNotice(r.message);
  };

  const [sigProvider, setSigProvider] = useState('');
  const [sigDoc, setSigDoc] = useState('');
  const [sigFile, setSigFile] = useState<{ name: string; b64: string } | null>(null);
  const [sigTo, setSigTo] = useState<string[]>([]);
  const [sigSubject, setSigSubject] = useState('');
  const [sigPlacement, setSigPlacement] = useState<'page' | 'inline'>('page');
  const [sigFields, setSigFields] = useState<PlacedField[]>([]);
  const [sigExpire, setSigExpire] = useState('');
  const [sigRemind, setSigRemind] = useState('');
  const [sigLayout, setSigLayout] = useState('');
  const [placer, setPlacer] = useState<Uint8Array | null>(null);
  const pickFile = (file: File | undefined) => {
    setSigFile(null);
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('That file is over 3 MB. Choose a smaller PDF.'); return; }
    const reader = new FileReader();
    reader.onload = () => { const r = String(reader.result); setSigFile({ name: file.name, b64: r.slice(r.indexOf(',') + 1) }); setSigDoc('file'); };
    reader.readAsDataURL(file);
  };
  const sendSignature = async () => {
    setNotice('');
    const provider = sigProvider || data?.signing?.providers[0]?.slug || '';
    const signerParties = (data?.parties ?? []).filter((p) => p.email && sigTo.includes(p.id));
    const signers = signerParties.map((p) => ({ name: p.name || p.email, email: p.email }));
    const doc = sigDoc === 'file' && sigFile ? { fileName: sigFile.name, fileB64: sigFile.b64 } : sigDoc ? { uploadId: sigDoc } : null;
    if (!provider || !doc || signers.length === 0) { setError('Choose a document and at least one person to sign.'); return; }
    const inline = provider === 'builtin' && sigPlacement === 'inline';
    const r = await post({ action: 'send_signature', dealId: deal.id, provider, subject: sigSubject || undefined, signers, ...doc, ...(provider === 'builtin' ? { placement: sigPlacement, fields: inline ? sigFields : undefined, expireDays: sigExpire ? Number(sigExpire) : undefined, remindEvery: sigRemind ? Number(sigRemind) : undefined } : {}) });
    if (r?.message) { setNotice(r.message); setSigTo([]); setSigFields([]); }
  };
  const openPlacer = async () => {
    setError('');
    try {
      let bytes: ArrayBuffer | null = null;
      if (sigDoc === 'file' && sigFile) bytes = Uint8Array.from(atob(sigFile.b64), (c) => c.charCodeAt(0)).buffer;
      else if (sigDoc) { const res = await fetch(`/api/closing-time/assist/upload/${sigDoc}`, { credentials: 'include' }); if (res.ok) bytes = await res.arrayBuffer(); }
      if (!bytes) { setError('Choose a PDF first.'); return; }
      setSigFields([]); setPlacer(new Uint8Array(bytes));
    } catch { setError('That file could not be opened.'); }
  };
  const refreshSig = async (id: string) => {
    setNotice('');
    const r = await post({ action: 'refresh_signature', id });
    if (r?.status) setNotice(`Status: ${r.status}.`);
  };

  const portalUrl = data?.portalToken ? `${window.location.origin}/deal-portal/${data.portalToken}` : '';
  const partyByRole = (role: string) => data?.parties.find((p) => p.role === role);
  const drafts = data?.followUps.filter((f) => f.status === 'draft') ?? [];
  const sent = data?.followUps.filter((f) => f.status === 'sent').slice(0, 5) ?? [];

  return (
    <div data-section-key="assist" className="min-w-0 scroll-mt-24 border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-2">
      <h3 className="text-lg font-semibold text-slate-950">Deal Settings</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Risk alerts, follow-up drafts, a client progress link, and a closing checklist for this deal. Nothing is emailed to anyone until you approve that specific draft.</p>
      {error && <p className="mt-3 text-sm font-semibold text-[#9A3D2B]" role="alert">{error}</p>}
      {!data ? <p className="mt-4 text-sm text-slate-500">{error ? '' : 'Loading.'}</p> : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <section aria-label="Risks">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Risk Alerts</h4>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">Extension length
              <input type="number" min={1} max={30} value={extDays} onChange={(e) => setExtDays(Math.min(30, Math.max(1, Number(e.target.value) || 3)))} className="min-h-[32px] w-16 rounded-md border border-slate-300 px-2 text-sm" aria-label="Extension days" /> days
            </label>
            {data.risks.length === 0 ? <p className="mt-2 text-sm text-slate-500">No risks flagged for this deal.</p> : (
              <ul className="mt-2 space-y-2">
                {data.risks.map((r) => (
                  <li key={r.id} className={`border px-3 py-2 text-sm ${r.severity === 'high' ? 'border-[#9A3D2B] bg-[#FFF5F2]' : 'border-[#D9D0BF] bg-[#FFFDF8]'}`}>
                    <p className="font-semibold text-slate-950">{r.severity === 'high' ? 'Urgent: ' : ''}{r.title}</p>
                    <p className="mt-0.5 text-slate-600">{r.detail}</p>
                    {r.deadlineLabel && (
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'draft_extension', dealId: deal.id, riskId: r.id, partyId: partyByRole('coop_agent')?.id })}>Draft Extension Request</button>
                        <a className={btn} href={`/api/closing-time/assist/amendment?dealId=${encodeURIComponent(deal.id)}&riskId=${encodeURIComponent(r.id)}&days=${extDays}`}>Prefilled Amendment (PDF)</a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Amendment">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Amendment (TREC 39-11)</h4>
            <p className="mt-2 text-sm text-slate-600">Pre-fills the official amendment with this property and one change. Signatures and the acceptance date stay blank. Review it, add any option fee or terms yourself, and send it for signatures. Check the new date against the contract.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="date" className={`${input} max-w-[170px]`} value={newClosing} onChange={(e) => setNewClosing(e.target.value)} aria-label="New closing date" />
              <a className={`${btn} ${newClosing ? '' : 'pointer-events-none opacity-45'}`} href={`/api/closing-time/assist/amendment?dealId=${encodeURIComponent(deal.id)}&type=closing&newDate=${newClosing}`}>Closing Date Amendment (PDF)</a>
            </div>
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
                <span key={p.id} className="inline-flex gap-1">
                  <button type="button" disabled={busy || !sigDetail.trim()} className={btn} onClick={() => void post({ action: 'draft', dealId: deal.id, kind: 'signature', partyId: p.id, detail: sigDetail.trim() })}>Draft Reminder: {p.name || ROLES[p.role]}</button>
                  <button type="button" disabled={busy || !sigDetail.trim()} className={btn} onClick={() => void post({ action: 'track_signature', dealId: deal.id, partyId: p.id, document: sigDetail.trim() })}>Track Signature</button>
                </span>
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

          <section aria-label="Connected tools" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Connected Tools</h4>
            {!data.connected || (!data.connected.calendar && !data.connected.mail && data.connected.storage.length === 0) ? (
              <p className="mt-2 text-sm text-slate-500">Connect your calendar, email or document storage on the Integrations page to use them here.</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                {data.connected.calendar && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 px-3 py-2">
                    <span>Put this deal&apos;s deadlines on your {data.connected.calendar}. Changed dates update the same events.</span>
                    <button type="button" disabled={busy} className={btnPrimary} onClick={() => void syncCal()}>Add To Calendar</button>
                  </div>
                )}
                {data.connected.mail && (
                  <label className="flex items-start gap-2 border border-slate-200 px-3 py-2">
                    <input type="checkbox" className="mt-1" checked={data.connected.sendFromConnected} disabled={busy} onChange={(e) => void post({ action: 'send_from_connected', on: e.target.checked })} />
                    <span>Send approved follow-ups from my own {data.connected.mail} address. If it fails, the message goes out through Realty News Now with you copied.</span>
                  </label>
                )}
                {notice && <p role="status" className="font-semibold text-[#301D5D]">{notice}</p>}
              </div>
            )}
          </section>

          {placer && <SignaturePlacer data={placer} signers={(data.parties ?? []).filter((p) => p.email && sigTo.includes(p.id)).map((p) => p.name || p.email)} fields={sigFields} onChange={setSigFields} onClose={() => setPlacer(null)} />}
          <section aria-label="Send for signature" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Send For Signature</h4>
            {!data.signing || data.signing.providers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Send documents for signature from this deal.</p>
            ) : (
              <div className="mt-2 space-y-3 border border-slate-200 p-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Signing app</span>
                    <select className={input} value={sigProvider || data.signing.providers[0].slug} onChange={(e) => setSigProvider(e.target.value)}>{data.signing.providers.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
                  <label className="block"><span className="text-xs font-semibold text-slate-600">Document</span>
                    <select className={input} value={sigDoc} onChange={(e) => setSigDoc(e.target.value)}>
                      <option value="">Choose a document</option>
                      {sigFile && <option value="file">{sigFile.name}</option>}
                      {data.uploads.map((u) => <option key={u.id} value={u.id}>{u.filename}</option>)}
                    </select></label>
                </div>
                <label className="block"><span className="text-xs font-semibold text-slate-600">Or choose a PDF from your computer (3 MB max)</span>
                  <input type="file" accept="application/pdf,.pdf" className="mt-1 block text-xs" onChange={(e) => pickFile(e.target.files?.[0])} /></label>
                <fieldset><legend className="text-xs font-semibold text-slate-600">Who signs</legend>
                  {data.parties.filter((p) => p.email).length === 0 ? <p className="mt-1 text-slate-500">Add a deal contact with an email above first.</p> : (
                    <div className="mt-1 flex flex-wrap gap-3">{data.parties.filter((p) => p.email).map((p) => (
                      <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={sigTo.includes(p.id)} onChange={(e) => setSigTo(e.target.checked ? [...sigTo, p.id] : sigTo.filter((x) => x !== p.id))} /> {p.name || p.email} <span className="text-xs text-slate-500">{ROLES[p.role] ?? p.role}</span></label>
                    ))}</div>
                  )}
                </fieldset>
                {(sigProvider || data.signing.providers[0].slug) === 'builtin' && (
                  <fieldset className="space-y-1"><legend className="text-xs font-semibold text-slate-600">Where signatures go</legend>
                    <label className="flex items-center gap-2"><input type="radio" name="sigplace" checked={sigPlacement === 'page'} onChange={() => setSigPlacement('page')} /> Add a signature page at the end</label>
                    <label className="flex items-center gap-2"><input type="radio" name="sigplace" checked={sigPlacement === 'inline'} onChange={() => setSigPlacement('inline')} /> Place signature fields inside the contract</label>
                    {sigPlacement === 'inline' && data.signing.layouts.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2"><select className={`${input} max-w-xs`} aria-label="Saved layout" value={sigLayout} onChange={(e) => { setSigLayout(e.target.value); const l = data.signing?.layouts.find((x) => x.id === e.target.value); if (l) setSigFields(l.fields); }}><option value="">Use a saved layout</option>{data.signing.layouts.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.roles} signer{l.roles === 1 ? '' : 's'})</option>)}</select>
                        {sigLayout && <button type="button" className={btn} onClick={() => void post({ action: 'delete_sign_layout', id: sigLayout }).then(() => setSigLayout(''))}>Delete Layout</button>}</div>)}
                    {sigPlacement === 'inline' && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || !sigDoc || sigTo.length === 0} className={btn} onClick={() => void openPlacer()}>Place Fields</button><span className="text-xs text-slate-500">{sigFields.length} placed</span>{sigFields.length > 0 && <button type="button" disabled={busy} className={btn} onClick={() => { const n = window.prompt('Name this layout so you can reuse it'); if (n) void post({ action: 'save_sign_layout', name: n, fields: sigFields }); }}>Save As Layout</button>}</div>}
                  </fieldset>
                )}
                {(sigProvider || data.signing.providers[0].slug) === 'builtin' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Expires after (days, blank = default {data.signing.settings?.expireDays ?? 30})</span><input type="number" min={1} max={365} className={input} value={sigExpire} onChange={(e) => setSigExpire(e.target.value)} /></label>
                    <label className="block"><span className="text-xs font-semibold text-slate-600">Remind every (days, 0 = off, blank = default {data.signing.settings?.remindEvery ?? 3})</span><input type="number" min={0} max={60} className={input} value={sigRemind} onChange={(e) => setSigRemind(e.target.value)} /></label>
                  </div>
                )}
                <label className="block"><span className="text-xs font-semibold text-slate-600">Email subject (optional)</span>
                  <input className={input} value={sigSubject} maxLength={200} onChange={(e) => setSigSubject(e.target.value)} /></label>
                <p className="text-xs text-slate-500">Nothing is sent until you press the button.</p>
                <button type="button" disabled={busy} className={btnPrimary} onClick={() => void sendSignature()}>Send For Signature</button>
              </div>
            )}
            {data.signing && data.signing.envelopes.filter((e) => e.provider !== 'Closing Time SecureSign').length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 text-sm">
                {data.signing.envelopes.filter((e) => e.provider !== 'Closing Time SecureSign').map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0"><span className="font-semibold">{e.document}</span> <span className="text-xs text-slate-500">via {e.provider} to {e.signers.map((x) => x.name).join(', ')}</span></span>
                    <span className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize">{e.status === 'sent' ? 'Awaiting signatures' : e.status}</span>
                      {e.status === 'sent' && <button type="button" disabled={busy} className={btn} onClick={() => void refreshSig(e.id)}>Refresh Status</button>}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.signing?.settings && <SecureSignSettings key={JSON.stringify(data.signing.settings)} settings={data.signing.settings} post={post} busy={busy} />}
            {data.signing && <SecureSignRequests requests={data.signing.requests} post={post} busy={busy} />}
          </section>

          <section aria-label="Client uploads" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Client Uploads</h4>
            {data.uploads.length === 0 ? <p className="mt-2 text-sm text-slate-500">Files your client uploads through the progress link appear here. You get an email each time.</p> : (
              <ul className="mt-2 space-y-2">
                {data.uploads.map((u) => {
                  const doc = deal.documents.find((d) => d.id === u.docId);
                  return (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate"><span className="font-semibold text-slate-900">{doc?.label ?? 'Document'}</span> · {u.filename} · {Math.max(1, Math.round(u.sizeBytes / 1024))} KB{u.reviewed ? '' : ' · new'}</span>
                      <span className="flex gap-2">
                        <a className={btn} href={`/api/closing-time/assist/upload/${u.id}`}>Download</a>
                        {data.connected?.storage.map((st) => <button key={st.slug} type="button" disabled={busy} className={btn} onClick={() => void saveFile(u.id, st.slug)}>Save to {st.name}</button>)}
                        {!u.reviewed && <button type="button" disabled={busy} className={btnPrimary} onClick={() => { onMarkReceived(u.docId, u.filename); void post({ action: 'upload_reviewed', id: u.id }); }}>Mark Received</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Signature tracking" className="lg:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Signatures Being Tracked</h4>
            {data.signatures.length === 0 ? <p className="mt-2 text-sm text-slate-500">Type a document name above and press Track Signature next to the person who owes it.</p> : (
              <ul className="mt-2 space-y-2">
                {data.signatures.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 px-3 py-2 text-sm">
                    <span><span className="font-semibold text-slate-900">{g.document}</span> · {g.toName || g.toEmail} · {g.status === 'open' ? `${g.remindersSent} of 3 reminders sent` : g.status === 'escalated' ? 'Needs your follow-up' : g.status === 'signed' ? 'Signed' : g.status}</span>
                    {(g.status === 'open' || g.status === 'escalated') && <button type="button" disabled={busy} className={btnPrimary} onClick={() => void post({ action: 'signature_signed', id: g.id })}>Mark Signed</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Automation">
            <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={data.autoSignature} disabled={busy} onChange={(e) => void post({ action: 'auto_signature', on: e.target.checked })} />
              <span>Automatically remind people to sign tracked documents: gentle at 2 and 4 days, firmer at 6 days or when closing is within 3 days. You are copied. After 3 reminders you get an email to follow up yourself. Off by default.</span>
            </label>
            <h4 className="text-sm font-bold uppercase tracking-wide text-[#7059A8]">Automation</h4>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={data.autoIntro} disabled={busy} onChange={(e) => void post({ action: 'auto_intro', on: e.target.checked })} />
              <span>Automatically send the standard introduction to each lender, title, and co-op agent contact once a deal has an effective date. You are copied. Nothing about price or terms is ever sent automatically. Off by default, applies to all your deals.</span>
            </label>
            <a className={`${btn} mt-3`} href={`/api/closing-time/assist/export?dealId=${encodeURIComponent(deal.id)}`}>Export File History (CSV)</a>
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
