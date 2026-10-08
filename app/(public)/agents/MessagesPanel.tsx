'use client';

import Switch from './Switch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TREC_FORM_LIBRARY } from '@/lib/trec-forms-library';
import Tip from './Tip';
import SpellHelper from './SpellHelper';
import MessageLayoutPicker, { type MessageLayout } from './MessageLayoutPicker';
import { dealFolders } from './purchase-documents';
import { messagingPeople } from '@/lib/closing-time-people';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type Text = { id: string; personName: string; phone: string; direction: 'outbound' | 'inbound'; body: string; status: string; error: string | null; createdAt: string };
type Email = { direction?: 'outbound' | 'inbound'; id: string; personName: string; toEmail: string; subject: string; body: string; status: string; error: string | null; createdAt: string };
type Mailbox = { watching?: number; connected: string | null; readReplies: boolean; lastChecked: string | null; lastError: string | null };
type Consent = 'opted_in' | 'pending' | 'opted_out' | 'none';
type Party = { key: string; name: string; role: string; email: string; phone: string };
type Item = { id: string; at: string; kind: 'email' | 'sms'; out: boolean; title: string; body: string; status: string; error: string | null };

const btn = 'inline-flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white disabled:opacity-45';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726]';
const lab = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#4A4757]';
const key = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (v: string) => v.replace(/\D/g, '');
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const STATUS: Record<string, string> = { queued: 'Sent To Carrier', sent: 'Sent', delivered: 'Delivered', received: 'Received', failed: 'Failed', delivery_failed: 'Not Delivered', sending_failed: 'Not Delivered' };

function partiesOf(deal: AgentDeal): Party[] {
  return messagingPeople(deal).map((p) => ({ key: key(p.name), name: p.name, role: p.role, email: p.email, phone: p.phone }));
}

/** Messages on a deal: email and text with each person on it, kept in one thread per person and written to the Audit Trail. */
export default function MessagesPanel({ deal, contact }: { deal?: AgentDeal; contact?: { name: string; email: string; phone: string; role: string } }) {
  const scope = contact ? 'contact' : (deal?.id ?? '');
  const parties = useMemo<Party[]>(() => (contact ? [{ key: key(contact.name), name: contact.name, role: contact.role || 'Contact', email: contact.email, phone: contact.phone }] : deal ? partiesOf(deal) : []), [deal, contact]);
  const [sel, setSel] = useState<string>(parties[0]?.key ?? '');
  const [mode, setMode] = useState<'email' | 'sms'>('email');
  const [texts, setTexts] = useState<Text[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [consent, setConsent] = useState<Record<string, Consent>>({});
  const [allowed, setAllowed] = useState(true);
  const [locked, setLocked] = useState(false);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [activity, setActivity] = useState<{ id: string; message: string; createdAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const [layoutSaved, setLayoutSaved] = useState<MessageLayout | null>(() => { try { const v = typeof window !== 'undefined' ? window.localStorage.getItem('ct-msg-layout') : null; return (v as MessageLayout | null) || null; } catch { return null; } });
  const layoutFrozen = useRef(false);
  const [isPhone, setIsPhone] = useState(false);
  const [phoneThread, setPhoneThread] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setIsPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [layoutChoice, setLayoutChoice] = useState<MessageLayout | null>(null);
  const [changing, setChanging] = useState(false);
  const [recips, setRecips] = useState<string[]>([]);
  const [flt, setFlt] = useState<'all' | 'email' | 'sms' | 'replies'>('all');
  const [threadsTab, setThreadsTab] = useState<'all' | 'needs' | 'waiting'>('all');
  const [openThread, setOpenThread] = useState<string>('');
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [asks, setAsks] = useState<string[]>([]);
  const [askOther, setAskOther] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [askSearch, setAskSearch] = useState('');
  const [files, setFiles] = useState<{ filename: string; content: string; contentType: string; size: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const askGroups = useMemo(() => {
    if (!deal) return { required: [] as string[], optional: [] as string[], forms: [] as string[] };
    const docs = dealFolders(deal).flatMap((f) => f.docs);
    const added = (id: string) => Boolean(deal.documentChecks?.[`add:${id}`]);
    const req = docs.filter((d) => d.kind === 'required' || added(d.id));
    const rest = docs.filter((d) => d.kind !== 'required' && !added(d.id) && d.kind !== 'reference');
    const uniq = (l: string[]) => Array.from(new Set(l));
    return { required: uniq(req.map((d) => d.label)), optional: uniq(rest.filter((d) => !d.formFamily).map((d) => d.label)), forms: uniq(rest.filter((d) => d.formFamily).map((d) => d.label)) };
  }, [deal]);
  const phonesParam = parties.map((p) => p.phone).filter(Boolean).join(',');
  useEffect(() => {
    let live = true;
    const run = () => fetch(`/api/closing-time/texts?dealId=${encodeURIComponent(scope)}&phones=${encodeURIComponent(phonesParam)}${contact ? `&name=${encodeURIComponent(contact.name)}&email=${encodeURIComponent(contact.email)}&phone=${encodeURIComponent(contact.phone)}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b) { setAllowed(b.allowed); setLocked(b.locked === true); setMailbox(b.mailbox ?? null); if (!layoutFrozen.current) { layoutFrozen.current = true; const sv = (b.mailbox?.layout as MessageLayout | null) ?? null; if (sv) { setLayoutSaved(sv); try { window.localStorage.setItem('ct-msg-layout', sv); } catch { /* ignore */ } } } setActivity(b.activity ?? []); setTexts(b.texts ?? []); setEmails(b.emails ?? []); setConsent(b.consent ?? {}); setLoaded(true); } })
      .catch(() => undefined);
    run();
    const t = setInterval(run, 20000);
    return () => { live = false; clearInterval(t); };
  }, [scope, phonesParam, tick, contact]);

  const party = parties.find((p) => p.key === sel) ?? null;
  const e164 = party?.phone ? (digits(party.phone).length === 10 ? `+1${digits(party.phone)}` : digits(party.phone).length === 11 && digits(party.phone).startsWith('1') ? `+${digits(party.phone)}` : '') : '';
  const state: Consent = e164 ? (consent[e164] ?? 'none') : 'none';

  const itemsFor = useCallback((p: Party): Item[] => {
    const k = key(p.name);
    const e = emails.filter((x) => key(x.personName) === k).map((x): Item => ({ id: x.id, at: x.createdAt, kind: 'email', out: x.direction !== 'inbound', title: x.subject, body: x.body, status: x.status, error: x.error }));
    const t = texts.filter((x) => key(x.personName) === k).map((x): Item => ({ id: x.id, at: x.createdAt, kind: 'sms', out: x.direction === 'outbound', title: x.direction === 'outbound' ? 'Text To ' + p.name : 'Text From ' + p.name, body: x.body, status: x.status, error: x.error }));
    return [...e, ...t].sort((a, b) => a.at.localeCompare(b.at));
  }, [emails, texts]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/closing-time/texts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const b = await res.json();
      if (!res.ok || b.ok === false) { setMsg(b.error ?? 'Something went wrong.'); return false; }
      setTick((n) => n + 1);
      return true;
    } catch { setMsg('Something went wrong.'); return false; } finally { setBusy(false); }
  };

  const layout: MessageLayout = contact || isPhone ? 'inbox' : (layoutChoice ?? layoutSaved ?? 'inbox');
  const needsChoice = !contact && !isPhone && loaded && !layoutSaved && !layoutChoice;
  const spellIgnore = [deal?.propertyAddress ?? '', deal?.title ?? '', ...parties.map((p) => p.name)];
  const clearAll = () => { setBody(''); };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= 5) { setMsg('Up to 5 files.'); break; }
      if (next.some((f) => f.filename === file.name)) continue;
      if (next.reduce((n, f) => n + f.size, 0) + file.size > 3 * 1024 * 1024) { setMsg('Attachments are limited to 3 MB in total. Use the upload request for larger files.'); break; }
      const content = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
      next.push({ filename: file.name, content, contentType: file.type || 'application/octet-stream', size: file.size });
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };
  const targets = (layout === 'timeline' || layout === 'split') && !contact ? parties.filter((p) => recips.includes(p.key)) : party ? [party] : [];
  const sendEmail = async () => {
    const list = targets.filter((p) => p.email);
    if (!list.length) return;
    const ccList = cc.filter((c) => !list.some((p) => p.email.toLowerCase() === c.toLowerCase()));
    const requests = [...asks, ...(askOther.trim() ? [askOther.trim()] : [])].map((label) => ({ label }));
    if (await post({ action: 'email', dealId: scope, subject, body, to: list.map((p) => ({ name: p.name, email: p.email })), ...(ccList.length ? { cc: ccList } : {}), ...(requests.length ? { requests } : {}), ...(files.length ? { attachments: files.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType })) } : {}) })) { setBody(''); setSubject(''); setCc([]); setFiles([]); setAsks([]); setAskOther(''); setAskOpen(false); setMsg(`Email sent to ${list.map((p) => p.name).join(', ')}${requests.length ? `. ${requests.length} request${requests.length === 1 ? '' : 's'} added to the portal` : ''}.`); }
  };
  const sendText = async () => {
    const textAsks = [...asks, ...(askOther.trim() ? [askOther.trim()] : [])].map((label) => ({ label }));
    const sent: string[] = []; const skipped: string[] = [];
    for (const p of targets) {
      const d = digits(p.phone); const e = d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : '';
      if (!e || consent[e] !== 'opted_in') { skipped.push(p.name); continue; }
      if (await post({ action: 'send', dealId: scope, name: p.name, phone: p.phone, body, ...(textAsks.length ? { requests: textAsks } : {}) })) sent.push(p.name); else return;
    }
    if (sent.length) { setBody(''); setAsks([]); setAskOther(''); setAskOpen(false); setMsg(`Text sent to ${sent.join(', ')}.${skipped.length ? ` Skipped ${skipped.join(', ')}: no agreement to texts yet.` : ''}`); }
    else if (skipped.length) setMsg(`${skipped.join(', ')} has not agreed to texts yet.`);
  };
  const saveLayout = async (v: MessageLayout) => { try { window.localStorage.setItem('ct-msg-layout', v); } catch { /* ignore */ } layoutFrozen.current = true; setLayoutChoice(v); setChanging(false); await post({ action: 'message_layout', value: v }); };

  if (!parties.length) return <div className="ds-card px-4 py-6 text-sm text-slate-600">Add the people on this deal on the People tab to message them here.</div>;
  const items = party ? itemsFor(party) : [];
  const recipKeys = (layout === 'timeline' || layout === 'split') && !contact ? recips : party ? [party.key] : [];
  const last = (p: Party) => { const l = itemsFor(p).at(-1); return l ? `${l.kind === 'sms' ? 'Text' : 'Email'} · ${stamp(l.at)}` : 'No messages yet'; };

  const bubble = (i: Item, who?: string) => (
    <div key={`${i.kind}-${i.id}`} className={`max-w-[85%] rounded-xl border px-3 py-2 ${i.out ? 'ml-auto border-[#E6E5EC] bg-[#F6F3FB]' : 'border-[#E6E5EC] bg-white'}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#4A4757]">{who ? `${who} · ` : ''}{i.kind === 'email' ? 'Email' : 'Text'} · {stamp(i.at)}</div>
      {i.kind === 'email' && <div className="text-[13px] font-semibold text-[#1B1726]">{i.title}</div>}
      <div className="whitespace-pre-wrap text-[14px] text-[#4A4757]">{i.body}</div>
      <div className="text-[12px] font-medium text-[#4A4757]">{i.out ? (STATUS[i.status] ?? i.status) : 'Received'}{i.error ? `: ${i.error.slice(0, 120)}` : ''}</div>
    </div>
  );
  const pillBase = 'inline-flex max-w-full items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium';
  const namePill = (name: string, role: string, on = false) => (
    <span className={`${pillBase} ${on ? 'border-[#301D5D] bg-[#EFEAF8] text-[#1B1726]' : 'border-[#E6E5EC] bg-white text-[#1B1726]'}`}><span className="break-words">{name}</span>{role ? <span className="text-[8px] font-medium uppercase tracking-[0.06em] text-[#4A4757]">{role}</span> : null}</span>
  );
  const roleOf = (name: string) => parties.find((p) => key(p.name) === key(name))?.role ?? '';
  const personButton = (p: Party, extra = '') => (
    <button key={p.key} type="button" onClick={() => { setSel(p.key); setMsg(''); setPhoneThread(true); }} className={`${extra} !text-left transition hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${p.key === sel ? '!bg-[#EFEAF8]' : '!bg-white'}`}>
      {namePill(p.name, p.role, p.key === sel)}
      <span className="mt-1 block text-[12px] font-medium text-[#4A4757]">{last(p)}</span>
    </button>
  );
  const header = party && (
    <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3">
      <div>
        <div>{namePill(party.name, party.role, true)}</div>
        <div className="mt-1 text-[12px] font-medium text-[#4A4757]">{[party.email, party.phone].filter(Boolean).join(' · ') || 'No email or phone on file. Add them on the People tab.'}</div>
      </div>
    </div>
  );
  const threadBody = (list: Item[]) => (
    <div className="max-h-[360px] space-y-3 overflow-auto px-4 py-4">
      {!loaded && <p className="text-xs text-slate-500">Loading messages.</p>}
      {loaded && list.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
      {list.map((i) => bubble(i))}
    </div>
  );
  const lib = TREC_FORM_LIBRARY.reduce<Record<string, string[]>>((m, f) => { (m[f.category] ??= []).push(`${f.formNumber} ${f.title}`); return m; }, {});
  const askCount = asks.length + (askOther.trim() ? 1 : 0);
  const requestUI = !contact && deal && (
    <div>
      <button type="button" className={btn} onClick={() => setAskOpen((v) => !v)} aria-expanded={askOpen}>{askOpen ? 'Hide Requests' : `Request Documents Or Forms${askCount ? ` (${askCount})` : ''}`}</button>
      {askOpen && (
        <div className="mt-3 space-y-4 rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] px-4 py-3">
          <input className={field} placeholder="Search documents and forms" value={askSearch} onChange={(e) => setAskSearch(e.target.value)} />
          <div className="max-h-72 space-y-4 overflow-auto pr-1">
            {([['Required Documents', askGroups.required], ['Optional Documents', askGroups.optional], ...Object.entries(lib).map(([c, l]) => [`TREC Forms: ${c}`, l] as const)] as const).map(([title, list]) => {
              const shownList = list.filter((l) => !askSearch.trim() || l.toLowerCase().includes(askSearch.trim().toLowerCase()));
              return shownList.length > 0 && (
                <div key={title}>
                  <span className={lab}>{title}</span>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {shownList.map((l) => <label key={l} className="flex items-start gap-2 text-[13px] text-[#1B1726]"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#301D5D]" checked={asks.includes(l)} onChange={() => setAsks((a) => a.includes(l) ? a.filter((x) => x !== l) : [...a, l])} /><span>{l}</span></label>)}
                  </div>
                </div>
              );
            })}
          </div>
          <label className="block"><span className={lab}>Other (Custom Request)</span><input className={field} placeholder="For example: Signed HOA receipt" maxLength={200} value={askOther} onChange={(e) => setAskOther(e.target.value)} /></label>
          <Tip critical text="Each checked item becomes a pending request on this deal. The message lists them and links to the secure upload page. Uploads are tracked in Documents and the Audit Trail." />
        </div>
      )}
    </div>
  );
  const attachUI = (
    <div>
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
      <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Attach Files</button>
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((f) => <div key={f.filename} className="flex items-center justify-between gap-3 rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[13px] text-[#1B1726]"><span className="break-all">{f.filename} <span className="text-[12px] font-medium text-[#4A4757]">{Math.round(f.size / 1024)} KB</span></span><button type="button" className="text-[12px] font-medium text-[#4A4757] underline underline-offset-2 hover:!bg-transparent hover:!text-[#301D5D]" onClick={() => setFiles((l) => l.filter((x) => x.filename !== f.filename))}>Remove</button></div>)}
        </div>
      )}
      <Tip critical text="Up to 5 files, 3 MB in total." />
    </div>
  );
  const composerInner = !party ? null : (
    <div className="px-4 py-4">
      <h3 className="text-[14px] font-semibold text-[#1B1726]">{mode === 'email' ? 'New Email' : 'New Text'}</h3>
      <p className="mb-3 mt-0.5 break-words text-[12px] font-medium text-[#4A4757]">To: {targets.length === 0 ? 'Select a contact above' : targets.map((p) => `${p.name}${mode === 'email' ? (p.email ? ` (${p.email})` : ' (no email)') : (p.phone ? ` (${p.phone})` : ' (no phone)')}`).join(', ')}</p>
      {mailbox && mailbox.connected && !mailbox.readReplies && (
        <label className="mb-4 flex items-start gap-2 rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2 text-[12px] font-medium text-[#4A4757]">
          <Switch on={false} disabled={busy} label="Show email replies" onChange={() => void post({ action: 'mailbox_read', on: true })} />
          <span>Show email replies from {mailbox.connected}. Only replies to emails sent from here, or mail naming the property, from people on your deals. Once on, this is saved in Settings.</span>
        </label>
      )}
      {mailbox?.readReplies && mailbox.lastError && <p className="mb-4 text-[12px] font-medium text-[#661102]">{mailbox.lastError}</p>}
      <div className="mb-3 flex gap-4 border-b border-[#E6E5EC]">
        {(['email', 'sms'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setMsg(''); }} className={`-mb-px border-b-2 pb-2 text-[13px] font-medium !rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 hover:!bg-transparent hover:!text-[#301D5D] ${mode === m ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#4A4757]'}`}>{m === 'email' ? 'Email' : 'Text'}</button>
        ))}
      </div>
      {mode === 'email' && (
        party.email ? (
          <div className="space-y-3">
            <div>
                    <span className={lab}>Cc</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {parties.filter((p) => p.email && p.key !== party.key).map((p) => {
                        const on = cc.some((c) => c.toLowerCase() === p.email.toLowerCase());
                        return <button key={p.key} type="button" onClick={() => setCc((c) => on ? c.filter((x) => x.toLowerCase() !== p.email.toLowerCase()) : [...c, p.email])} className={`!rounded-full !border !px-2 !py-0.5 !text-[11px] !leading-4 font-medium hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${on ? '!border-[#301D5D] !bg-[#EFEAF8] !text-[#1B1726]' : '!border-[#E6E5EC] !bg-white !text-[#4A4757]'}`}>{p.name} <span className="text-[8px] uppercase tracking-[0.06em] text-[#4A4757]">{p.role}</span></button>;
                      })}
                      {cc.filter((c) => !parties.some((p) => p.email.toLowerCase() === c.toLowerCase())).map((c) => <button key={c} type="button" onClick={() => setCc((l) => l.filter((x) => x !== c))} className="!rounded-full !border !border-[#301D5D] !bg-[#EFEAF8] !px-3 !py-1 text-[12px] font-medium !text-[#1B1726] hover:!bg-[#EFEAF8]" title="Remove">{c} ×</button>)}
                      <input className="min-w-[180px] flex-1 rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[13px] text-[#1B1726]" placeholder="Add another email" value={ccInput} onChange={(e) => setCcInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = ccInput.trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !cc.includes(v)) { setCc((l) => [...l, v]); setCcInput(''); } } }} />
                    </div>
                    <Tip text="You are always copied. Press Enter to add an email." />
                  </div>
                  <label className="block"><span className={lab}>Subject</span>
                    <div className="flex flex-col overflow-hidden rounded-lg border border-[#E6E5EC] bg-white sm:flex-row sm:items-center">
                      {!contact && <span className="shrink-0 border-b border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2 text-[13px] font-medium text-[#4A4757] sm:border-b-0 sm:border-r">{(deal?.propertyAddress || deal?.title || '').trim()} -</span>}
                      <input className="min-w-0 flex-1 px-3 py-2 text-[14px] text-[#1B1726] outline-none" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
                    </div>
                  </label>
            <label className="block"><span className={lab}>Message</span><textarea className={field} rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <SpellHelper text={body} onChange={setBody} ignore={spellIgnore} />
            {requestUI}
            {attachUI}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tip text={`Goes to ${party.email}. You are copied and replies go to your email. The subject starts with the property address.`} />
              <span className="flex gap-2"><button type="button" className={`${btn} !px-2 !py-0.5 !text-[11px] whitespace-nowrap`} disabled={busy || !body} onClick={clearAll}>Clear</button>
              <button type="button" className={`${btn} !px-2 !py-0.5 !text-[11px] whitespace-nowrap`} disabled={busy || !targets.length || !subject.trim() || !body.trim()} onClick={() => void sendEmail()}>Send Email</button></span>
            </div>
          </div>
        ) : <p className="text-[13px] text-[#4A4757]">No email on file for {party.name}. Add one on the People tab.</p>
      )}
      {mode === 'sms' && (
        !allowed ? <p className="text-[13px] text-[#4A4757]">Texting is coming soon for your account.</p>
        : !e164 ? <p className="text-[13px] text-[#4A4757]">No valid mobile number on file for {party.name}. Add one on the People tab.</p>
        : state === 'opted_out' ? <p className="text-[13px] text-[#4A4757]">{party.name} opted out of texts. They can reply START to turn them back on.</p>
        : state === 'opted_in' ? (
          <div className="space-y-3">
            <label className="block"><span className={lab}>Text</span><textarea className={field} rows={3} maxLength={900} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <SpellHelper text={body} onChange={setBody} ignore={spellIgnore} />
            {requestUI}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tip text={`Sent to ${party.phone}. The property address and a STOP line are added.`} />
              <span className="flex gap-2"><button type="button" className={`${btn} !px-2 !py-0.5 !text-[11px] whitespace-nowrap`} disabled={busy || !body} onClick={clearAll}>Clear</button><button type="button" className={`${btn} !px-2 !py-0.5 !text-[11px] whitespace-nowrap`} disabled={busy || !targets.length || !body.trim()} onClick={() => void sendText()}>Send Text</button></span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-[#4A4757]">{state === 'pending' ? `Waiting for ${party.name} to reply YES.` : `${party.name} has not agreed to texts yet.`} Texts can only go to people who agreed.</p>
            <div className="flex flex-wrap gap-2">
              {state === 'none' && <button type="button" className={btn} disabled={busy} onClick={() => void post({ action: 'opt_in_request', dealId: scope, name: party.name, phone: party.phone })}>Send Opt-In Request</button>}
              <button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm(`Confirm that ${party.name} agreed to receive texts about this deal?`)) void post({ action: 'confirm_agreed', dealId: scope, name: party.name, phone: party.phone }); }}>Confirm They Agreed</button>
            </div>
          </div>
        )
      )}
      {msg && <p role="status" className="mt-3 text-[12px] font-medium text-[#4A4757]">{msg}</p>}
    </div>
  );
  const composerCard = (
    <div className="ds-card">
      {locked ? <p className="px-4 py-4 text-[13px] text-[#4A4757]">This deal is closed and its record is locked. Messaging has stopped. The history is kept for the audit record.</p> : composerInner}
    </div>
  );
  const threadCard = party && <div className="ds-card">{header}{threadBody(items)}</div>;

  // Timeline data: every person's messages together.
  const everything = parties.flatMap((p) => itemsFor(p).map((i) => ({ ...i, who: p.name }))).sort((a, b) => a.at.localeCompare(b.at));
  const shown = everything.filter((i) => flt === 'all' || (flt === 'email' && i.kind === 'email') || (flt === 'sms' && i.kind === 'sms') || (flt === 'replies' && !i.out));
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Threads: one per person and email subject, plus one text thread per person.
  const addr = (deal?.propertyAddress || deal?.title || '').trim().toLowerCase();
  const normSubject = (t: string) => { let v = t.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').trim().toLowerCase(); if (addr) v = v.replace(`${addr} - `, '').replace(` - ${addr}`, ''); return v; };
  type Thread = { id: string; person: Party; title: string; channel: string; items: Item[]; at: string; lastOut: boolean };
  const threads: Thread[] = [];
  for (const p of parties) {
    const map = new Map<string, Thread>();
    for (const i of itemsFor(p)) {
      const k = i.kind === 'sms' ? `${p.key}|text` : `${p.key}|${normSubject(i.title)}`;
      const t = map.get(k) ?? { id: k, person: p, title: i.kind === 'sms' ? 'Text messages' : i.title.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, ''), channel: i.kind === 'sms' ? 'Text' : 'Email', items: [], at: i.at, lastOut: i.out };
      t.items.push(i); if (i.at >= t.at) { t.at = i.at; t.lastOut = i.out; }
      map.set(k, t);
    }
    threads.push(...map.values());
  }
  threads.sort((a, b) => b.at.localeCompare(a.at));
  const visibleThreads = threads.filter((t) => threadsTab === 'all' || (threadsTab === 'needs' ? !t.lastOut : t.lastOut));
  const current = threads.find((t) => t.id === openThread) ?? null;

  const templates = [
    { label: 'Earnest Money Reminder', subject: 'Earnest money reminder', body: `Hi ${party?.name.split(' ')[0] ?? ''}, a quick reminder that earnest money is due soon. Let me know if you have any questions.` },
    { label: 'Inspection Scheduled', subject: 'Inspection scheduled', body: `Hi ${party?.name.split(' ')[0] ?? ''}, your inspection is scheduled. I will send the details shortly.` },
    { label: 'Request A Document', subject: 'Document request', body: `Hi ${party?.name.split(' ')[0] ?? ''}, could you upload the requested document to your portal when you have a moment? Thank you.` },
    { label: 'Closing Checklist', subject: 'Closing checklist', body: `Hi ${party?.name.split(' ')[0] ?? ''}, here is what we need to finish before closing. I will walk you through each step.` },
  ];

  const chip = !contact && !isPhone && (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button type="button" className={btn} onClick={() => setChanging((v) => !v)} aria-expanded={changing}>
        Layout: {({ inbox: 'Inbox With Deal Rail', timeline: 'One Deal Timeline', strip: 'People Strip With Chat', threads: 'Thread List And Panel', split: 'Compose And History Split' } as const)[layout]}
      </button>
      <Tip text="Saved to your account. Change it any time." />
    </div>
  );
  const picker = (changing || needsChoice) && (
    <div className="ds-card mb-4 px-4 py-4">
      <h2 className="text-[14px] font-semibold text-[#1B1726]">{needsChoice ? 'Choose How Messages Looks' : 'Messages Layout'}</h2>
      
      <MessageLayoutPicker value={layoutChoice ?? layoutSaved} onPick={(v) => void saveLayout(v)} disabled={busy} />
    </div>
  );

  const recipientCard = !locked && (
          <div className="ds-card px-4 py-3">
            <span className={lab}>To</span>
            <div className="flex flex-wrap gap-2">
              {parties.map((p) => {
                const on = recipKeys.includes(p.key);
                return <button key={p.key} type="button" onClick={() => { setSel(p.key); setRecips((r) => { const base = r; return base.includes(p.key) ? base.filter((x) => x !== p.key) : [...base, p.key]; }); }} className={`!rounded-full !border !px-2 !py-0.5 !text-[11px] !leading-4 font-medium hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${on ? '!border-[#301D5D] !bg-[#EFEAF8] !text-[#1B1726]' : '!border-[#E6E5EC] !bg-white !text-[#4A4757]'}`}>{p.name} <span className="text-[8px] uppercase tracking-[0.06em] text-[#4A4757]">{p.role}</span></button>;
              })}
            </div>
            <Tip critical text="Each person gets their own copy. Texts go only to people who agreed to texts." />
          </div>
  );
  let body_: React.ReactNode;
  if (layout === 'timeline' && !contact) {
    body_ = (
      <div className="space-y-4">
        <div className="ds-card px-4 py-4">
          <div className="mb-3 flex gap-4 border-b border-[#E6E5EC]">
            {([['all', 'All'], ['email', 'Emails'], ['sms', 'Texts'], ['replies', 'Replies']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFlt(k)} className={`-mb-px !rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 pb-2 text-[13px] font-medium hover:!bg-transparent hover:!text-[#301D5D] ${flt === k ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#4A4757]'}`}>{l}</button>
            ))}
          </div>
          {!loaded && <p className="text-xs text-slate-500">Loading messages.</p>}
          {loaded && shown.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
          {shown.map((i, n) => (
            <div key={`${i.kind}-${i.id}`}>
              {(n === 0 || dayOf(shown[n - 1].at) !== dayOf(i.at)) && <div className="my-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#4A4757]">{dayOf(i.at)}</div>}
              <div className="flex gap-3 border-b border-[#F6F3FB] py-3 last:border-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E6E5EC] text-[11px] font-semibold text-[#7059A8]">{i.kind === 'email' ? '@' : 'T'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#1B1726]">{i.out ? 'You to ' : ''}{namePill(i.who, roleOf(i.who))} <span className="text-[12px] font-medium text-[#4A4757]">{i.kind === 'email' ? 'email' : 'text'} · {stamp(i.at)} · {i.out ? (STATUS[i.status] ?? i.status) : 'Received'}</span></div>
                  {i.kind === 'email' && <div className="text-[13px] font-medium text-[#1B1726]">{i.title}</div>}
                  <div className="whitespace-pre-wrap break-words text-[14px] text-[#4A4757]">{i.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {recipientCard}
        {composerCard}
      </div>
    );
  } else if (layout === 'split' && !contact) {
    body_ = (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">{recipientCard}{composerCard}</div>
        <div className="ds-card self-start">
          {party && header}
          <div className="max-h-[640px] space-y-3 overflow-auto px-4 py-4">
            {!loaded && <p className="text-xs text-slate-500">Loading messages.</p>}
            {loaded && items.length === 0 && <p className="text-xs text-slate-500">No messages with {party?.name ?? 'this person'} yet.</p>}
            {[...items].reverse().map((i) => bubble(i))}
          </div>
        </div>
      </div>
    );
  } else if (layout === 'strip' && !contact) {
    body_ = (
      <div className="space-y-4">
        <div className="flex gap-3 overflow-auto pb-1">
          {parties.map((p) => personButton(p, 'min-w-[170px] shrink-0 rounded-xl border border-[#E6E5EC] px-3 py-2'))}
        </div>
        {threadCard}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => <button key={t.label} type="button" className={btn} onClick={() => { setMode('email'); setSubject(t.subject); setBody(t.body); }}>{t.label}</button>)}
          </div>
        )}
        {composerCard}
      </div>
    );
  } else if (layout === 'threads' && !contact) {
    body_ = (
      <div className="grid gap-4 md:grid-cols-[1fr_380px]">
        <div className="ds-card">
          <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3">
            <div className="flex gap-4">
              {([['all', 'All Threads'], ['needs', 'Needs Reply'], ['waiting', 'Waiting On Them']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setThreadsTab(k)} className={`!rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 text-[13px] font-medium hover:!bg-transparent hover:!text-[#301D5D] ${threadsTab === k ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#4A4757]'}`}>{l}</button>
              ))}
            </div>
            <button type="button" className={btn} onClick={() => setOpenThread('new')}>New Message</button>
          </div>
          {visibleThreads.length === 0 && <p className="px-4 py-4 text-xs text-slate-500">{loaded ? 'No threads yet. Use New Message to start one.' : 'Loading messages.'}</p>}
          {visibleThreads.map((t) => (
            <button key={t.id} type="button" onClick={() => { setSel(t.person.key); setOpenThread(t.id); setMsg(''); }} className={`block w-full border-b border-[#E6E5EC] px-4 py-3 !text-left last:border-0 hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${openThread === t.id ? '!bg-[#EFEAF8]' : '!bg-white'}`}>
              <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block break-words text-[14px] font-semibold text-[#1B1726]">{t.title}</span><span className="block break-words text-[12px] font-medium text-[#4A4757]">{t.items[t.items.length - 1].body.slice(0, 90)}</span></span><span className="shrink-0 text-right text-[12px] font-medium text-[#4A4757]"><span className="block">{namePill(t.person.name, t.person.role)}</span><span className="block">{t.channel} · {stamp(t.at)}</span></span></span>
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {openThread === 'new' && (
            <div className="ds-card px-4 py-3">
              <span className={lab}>To</span>
              <select className={field} value={sel} onChange={(e) => setSel(e.target.value)}>{parties.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.role})</option>)}</select>
            </div>
          )}
          {current && <div className="ds-card"><div className="border-b border-[#E6E5EC] px-4 py-3"><div className="text-[14px] font-semibold text-[#1B1726]">{current.title}</div><div className="mt-1">{namePill(current.person.name, current.person.role)}</div></div>{threadBody(current.items)}</div>}
          {!current && openThread !== 'new' && <div className="ds-card px-4 py-6 text-[13px] text-[#4A4757]">Open a thread to read it and reply, or start a new message.</div>}
          {(current || openThread === 'new') && composerCard}
        </div>
      </div>
    );
  } else if (isPhone && !contact) {
    body_ = phoneThread ? (
      <div className="space-y-3">
        <button type="button" className={`${btn} !px-3 !py-2 !text-[14px]`} onClick={() => setPhoneThread(false)}>{'\u2039'} People</button>
        {threadCard}
        {composerCard}
      </div>
    ) : (
      <div className="ds-card">
        <h2 className="border-b border-[#E6E5EC] px-4 py-3 text-[16px] font-semibold text-[#1B1726]">People On This Deal</h2>
        {parties.map((p) => personButton(p, 'block w-full border-b border-[#E6E5EC] px-4 py-4 last:border-0'))}
      </div>
    );
  } else {
    body_ = (
      <div className={contact ? 'grid gap-4' : 'grid gap-4 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_220px]'}>
        {!contact && (
          <div className="ds-card">
            <h2 className="border-b border-[#E6E5EC] px-4 py-3 text-[14px] font-semibold text-[#1B1726]">People On This Deal</h2>
            {parties.map((p) => personButton(p, 'block w-full border-b border-[#E6E5EC] px-4 py-3 last:border-0'))}
          </div>
        )}
        <div className="space-y-4">{threadCard}{composerCard}</div>
        {!contact && party && (
          <div className="ds-card self-start px-4 py-4 max-xl:hidden">
            <div className="mb-3"><span className={lab}>Closing</span><span className="text-[14px] font-medium text-[#1B1726]">{deal?.closingDate ? new Date(`${deal.closingDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</span></div>
            <div className="mb-3"><span className={lab}>Role</span><span className="text-[14px] font-medium text-[#1B1726]">{party.role}</span></div>
            <div className="mb-3"><span className={lab}>Texts</span><span className="text-[14px] font-medium text-[#1B1726]">{state === 'opted_in' ? 'Agreed' : state === 'pending' ? 'Waiting For Reply' : state === 'opted_out' ? 'Opted Out' : 'Not Asked'}</span></div>
            <div><span className={lab}>Messages</span><span className="text-[14px] font-medium text-[#1B1726]">{items.length}</span></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {chip}
      {picker}
      {!needsChoice && body_}
      {contact && (
        <div className="ds-card">
          <h2 className="border-b border-[#E6E5EC] px-4 py-3 text-[14px] font-semibold text-[#1B1726]">Activity Log</h2>
          {activity.length === 0 && <p className="px-4 py-4 text-xs text-slate-500">Texts, emails, replies and consent changes with {contact.name} are listed here.</p>}
          {activity.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 border-b border-[#E6E5EC] px-4 py-3 last:border-0">
              <span className="text-[14px] text-[#4A4757]">{a.message}</span>
              <span className="shrink-0 text-[12px] font-medium text-[#4A4757]">{stamp(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
