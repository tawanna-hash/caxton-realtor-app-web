'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MessageLayoutPicker, { type MessageLayout } from './MessageLayoutPicker';
import { messagingPeople } from '@/lib/closing-time-people';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type Text = { id: string; personName: string; phone: string; direction: 'outbound' | 'inbound'; body: string; status: string; error: string | null; createdAt: string };
type Email = { direction?: 'outbound' | 'inbound'; id: string; personName: string; toEmail: string; subject: string; body: string; status: string; error: string | null; createdAt: string };
type Mailbox = { watching?: number; connected: string | null; readReplies: boolean; lastChecked: string | null; lastError: string | null };
type Consent = 'opted_in' | 'pending' | 'opted_out' | 'none';
type Party = { key: string; name: string; role: string; email: string; phone: string };
type Item = { id: string; at: string; kind: 'email' | 'sms'; out: boolean; title: string; body: string; status: string; error: string | null };

const btn = 'inline-flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white disabled:opacity-45';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726]';
const lab = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';
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
  const [layoutSaved, setLayoutSaved] = useState<MessageLayout | null>(null);
  const [layoutChoice, setLayoutChoice] = useState<MessageLayout | null>(null);
  const [changing, setChanging] = useState(false);
  const [recips, setRecips] = useState<string[]>([]);
  const [flt, setFlt] = useState<'all' | 'email' | 'sms' | 'replies'>('all');
  const [threadsTab, setThreadsTab] = useState<'all' | 'needs' | 'waiting'>('all');
  const [openThread, setOpenThread] = useState<string>('');

  const phonesParam = parties.map((p) => p.phone).filter(Boolean).join(',');
  useEffect(() => {
    let live = true;
    const run = () => fetch(`/api/closing-time/texts?dealId=${encodeURIComponent(scope)}&phones=${encodeURIComponent(phonesParam)}${contact ? `&name=${encodeURIComponent(contact.name)}&email=${encodeURIComponent(contact.email)}&phone=${encodeURIComponent(contact.phone)}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b) { setAllowed(b.allowed); setLocked(b.locked === true); setMailbox(b.mailbox ?? null); setLayoutSaved((b.mailbox?.layout as MessageLayout | null) ?? null); setActivity(b.activity ?? []); setTexts(b.texts ?? []); setEmails(b.emails ?? []); setConsent(b.consent ?? {}); setLoaded(true); } })
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

  const layout: MessageLayout = contact ? 'inbox' : (layoutChoice ?? layoutSaved ?? 'inbox');
  const needsChoice = !contact && loaded && !layoutSaved && !layoutChoice;
  const targets = layout === 'timeline' && !contact ? parties.filter((p) => (recips.length ? recips : party ? [party.key] : []).includes(p.key)) : party ? [party] : [];
  const sendEmail = async () => {
    const list = targets.filter((p) => p.email);
    if (!list.length) return;
    if (await post({ action: 'email', dealId: scope, subject, body, to: list.map((p) => ({ name: p.name, email: p.email })) })) { setBody(''); setSubject(''); setMsg(`Email sent to ${list.map((p) => p.name).join(', ')}.`); }
  };
  const sendText = async () => {
    const sent: string[] = []; const skipped: string[] = [];
    for (const p of targets) {
      const d = digits(p.phone); const e = d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith('1') ? `+${d}` : '';
      if (!e || consent[e] !== 'opted_in') { skipped.push(p.name); continue; }
      if (await post({ action: 'send', dealId: scope, name: p.name, phone: p.phone, body })) sent.push(p.name); else return;
    }
    if (sent.length) { setBody(''); setMsg(`Text sent to ${sent.join(', ')}.${skipped.length ? ` Skipped ${skipped.join(', ')}: no agreement to texts yet.` : ''}`); }
    else if (skipped.length) setMsg(`${skipped.join(', ')} has not agreed to texts yet.`);
  };
  const saveLayout = async (v: MessageLayout) => { setLayoutChoice(v); setChanging(false); await post({ action: 'message_layout', value: v }); };

  if (!parties.length) return <div className="ds-card px-4 py-6 text-sm text-slate-600">Add the people on this deal on the People tab to message them here.</div>;
  const items = party ? itemsFor(party) : [];
  const recipKeys = recips.length ? recips : party ? [party.key] : [];
  const last = (p: Party) => { const l = itemsFor(p).at(-1); return l ? `${l.kind === 'sms' ? 'Text' : 'Email'} · ${stamp(l.at)}` : 'No messages yet'; };

  const bubble = (i: Item, who?: string) => (
    <div key={`${i.kind}-${i.id}`} className={`max-w-[85%] rounded-xl border px-3 py-2 ${i.out ? 'ml-auto border-[#E6E5EC] bg-[#F6F3FB]' : 'border-[#E6E5EC] bg-white'}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">{who ? `${who} · ` : ''}{i.kind === 'email' ? 'Email' : 'Text'} · {stamp(i.at)}</div>
      {i.kind === 'email' && <div className="text-[13px] font-semibold text-[#1B1726]">{i.title}</div>}
      <div className="whitespace-pre-wrap text-[14px] text-[#4A4757]">{i.body}</div>
      <div className="text-[12px] font-medium text-[#7A7787]">{i.out ? (STATUS[i.status] ?? i.status) : 'Received'}{i.error ? `: ${i.error.slice(0, 120)}` : ''}</div>
    </div>
  );
  const personButton = (p: Party, extra = '') => (
    <button key={p.key} type="button" onClick={() => { setSel(p.key); setMsg(''); }} className={`${extra} !text-left transition hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${p.key === sel ? '!bg-[#EFEAF8]' : '!bg-white'}`}>
      <span className="block text-[14px] font-medium text-[#1B1726]">{p.name}</span>
      <span className="block text-[12px] font-medium text-[#7A7787]">{p.role} · {last(p)}</span>
    </button>
  );
  const header = party && (
    <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3">
      <div>
        <div className="text-[14px] font-semibold text-[#1B1726]">{party.name}</div>
        <div className="text-[12px] font-medium text-[#7A7787]">{[party.email, party.phone].filter(Boolean).join(' · ') || 'No email or phone on file. Add them on the People tab.'}</div>
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
  const composerInner = !party ? null : (
    <div className="px-4 py-4">
      <h3 className="mb-2 text-[14px] font-semibold text-[#1B1726]">{mode === 'email' ? 'New Email' : 'New Text'}</h3>
      {mailbox && mailbox.connected && !mailbox.readReplies && (
        <label className="mb-4 flex items-start gap-2 rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2 text-[12px] font-medium text-[#4A4757]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#301D5D]" checked={false} disabled={busy} onChange={() => void post({ action: 'mailbox_read', on: true })} />
          <span>Show email replies from {mailbox.connected}. Only replies to emails sent from here, or mail naming the property, from people on your deals. Once on, this is saved in Settings.</span>
        </label>
      )}
      {mailbox?.readReplies && mailbox.lastError && <p className="mb-4 text-[12px] font-medium text-[#9A3D2B]">{mailbox.lastError}</p>}
      <div className="mb-3 flex gap-5 border-b border-[#E6E5EC]">
        {(['email', 'sms'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setMsg(''); }} className={`-mb-px border-b-2 pb-2 text-[13px] font-medium !rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 hover:!bg-transparent hover:!text-[#301D5D] ${mode === m ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#7A7787]'}`}>{m === 'email' ? 'Email' : 'Text'}</button>
        ))}
      </div>
      {mode === 'email' && (
        party.email ? (
          <div className="space-y-3">
            <label className="block"><span className={lab}>Subject</span><input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></label>
            <label className="block"><span className={lab}>Message</span><textarea className={field} rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#7A7787]">Goes to {party.email}. You are copied and replies go to your email. The property address is added to the subject.</span>
              <button type="button" className={btn} disabled={busy || !subject.trim() || !body.trim()} onClick={() => void sendEmail()}>Send Email</button>
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
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#7A7787]">Sent to {party.phone}. The property address and a STOP line are added.</span>
              <button type="button" className={btn} disabled={busy || !body.trim()} onClick={() => void sendText()}>Send Text</button>
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
  const normSubject = (t: string) => t.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').replace(/\s+-\s+[^-]*$/, '').trim().toLowerCase();
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

  const chip = !contact && (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button type="button" className={btn} onClick={() => setChanging((v) => !v)} aria-expanded={changing}>
        Layout: {({ inbox: 'Inbox With Deal Rail', timeline: 'One Deal Timeline', strip: 'People Strip With Chat', threads: 'Thread List And Panel' } as const)[layout]}
      </button>
      <span className="text-[12px] font-medium text-[#7A7787]">Saved to your account. Change it any time.</span>
    </div>
  );
  const picker = (changing || needsChoice) && (
    <div className="ds-card mb-4 px-4 py-4">
      <h2 className="text-[14px] font-semibold text-[#1B1726]">{needsChoice ? 'Choose How Messages Looks' : 'Messages Layout'}</h2>
      <p className="mb-3 mt-0.5 text-[12px] font-medium text-[#7A7787]">Pick the layout you like. You can change it later from here or in Settings.</p>
      <MessageLayoutPicker value={layoutChoice ?? layoutSaved} onPick={(v) => void saveLayout(v)} disabled={busy} />
    </div>
  );

  let body_: React.ReactNode;
  if (layout === 'timeline' && !contact) {
    body_ = (
      <div className="space-y-4">
        <div className="ds-card px-4 py-4">
          <div className="mb-3 flex gap-5 border-b border-[#E6E5EC]">
            {([['all', 'All'], ['email', 'Emails'], ['sms', 'Texts'], ['replies', 'Replies']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFlt(k)} className={`-mb-px !rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 pb-2 text-[13px] font-medium hover:!bg-transparent hover:!text-[#301D5D] ${flt === k ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#7A7787]'}`}>{l}</button>
            ))}
          </div>
          {!loaded && <p className="text-xs text-slate-500">Loading messages.</p>}
          {loaded && shown.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
          {shown.map((i, n) => (
            <div key={`${i.kind}-${i.id}`}>
              {(n === 0 || dayOf(shown[n - 1].at) !== dayOf(i.at)) && <div className="my-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">{dayOf(i.at)}</div>}
              <div className="flex gap-3 border-b border-[#F1F0F5] py-2.5 last:border-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E6E5EC] text-[11px] font-semibold text-[#7059A8]">{i.kind === 'email' ? '@' : 'T'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#1B1726]">{i.out ? `You to ${i.who}` : i.who} <span className="text-[12px] font-medium text-[#7A7787]">{i.kind === 'email' ? 'email' : 'text'} · {stamp(i.at)} · {i.out ? (STATUS[i.status] ?? i.status) : 'Received'}</span></div>
                  {i.kind === 'email' && <div className="text-[13px] font-medium text-[#1B1726]">{i.title}</div>}
                  <div className="whitespace-pre-wrap break-words text-[14px] text-[#4A4757]">{i.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <div className="ds-card px-4 py-3">
            <span className={lab}>To</span>
            <div className="flex flex-wrap gap-2">
              {parties.map((p) => {
                const on = recipKeys.includes(p.key);
                return <button key={p.key} type="button" onClick={() => { setSel(p.key); setRecips((r) => { const base = r.length ? r : [sel]; return base.includes(p.key) ? base.filter((x) => x !== p.key) : [...base, p.key]; }); }} className={`!rounded-lg !border text-[13px] font-medium hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${on ? '!border-[#301D5D] !bg-[#EFEAF8] !text-[#1B1726]' : '!border-[#E6E5EC] !bg-white !text-[#4A4757]'}`}>{p.name}</button>;
              })}
            </div>
            <p className="mt-2 text-[12px] font-medium text-[#7A7787]">Each person gets their own copy. Texts go only to people who agreed to texts.</p>
          </div>
        )}
        {composerCard}
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
            <div className="flex gap-5">
              {([['all', 'All Threads'], ['needs', 'Needs Reply'], ['waiting', 'Waiting On Them']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setThreadsTab(k)} className={`!rounded-none !border-x-0 !border-t-0 !bg-transparent !px-0 text-[13px] font-medium hover:!bg-transparent hover:!text-[#301D5D] ${threadsTab === k ? '!border-[#301D5D] !text-[#301D5D]' : '!border-transparent text-[#7A7787]'}`}>{l}</button>
              ))}
            </div>
            <button type="button" className={btn} onClick={() => setOpenThread('new')}>New Message</button>
          </div>
          {visibleThreads.length === 0 && <p className="px-4 py-4 text-xs text-slate-500">{loaded ? 'No threads yet. Use New Message to start one.' : 'Loading messages.'}</p>}
          {visibleThreads.map((t) => (
            <button key={t.id} type="button" onClick={() => { setSel(t.person.key); setOpenThread(t.id); setMsg(''); }} className={`block w-full border-b border-[#E6E5EC] px-4 py-3 !text-left last:border-0 hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${openThread === t.id ? '!bg-[#EFEAF8]' : '!bg-white'}`}>
              <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block break-words text-[14px] font-semibold text-[#1B1726]">{t.title}</span><span className="block break-words text-[12px] font-medium text-[#7A7787]">{t.items[t.items.length - 1].body.slice(0, 90)}</span></span><span className="shrink-0 text-right text-[12px] font-medium text-[#7A7787]"><span className="block">{t.person.name}</span><span className="block">{t.channel} · {stamp(t.at)}</span></span></span>
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
          {current && <div className="ds-card"><div className="border-b border-[#E6E5EC] px-4 py-3"><div className="text-[14px] font-semibold text-[#1B1726]">{current.title}</div><div className="text-[12px] font-medium text-[#7A7787]">{current.person.name}</div></div>{threadBody(current.items)}</div>}
          {!current && openThread !== 'new' && <div className="ds-card px-4 py-6 text-[13px] text-[#4A4757]">Open a thread to read it and reply, or start a new message.</div>}
          {(current || openThread === 'new') && composerCard}
        </div>
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
            <div key={a.id} className="flex items-start justify-between gap-4 border-b border-[#E6E5EC] px-4 py-2.5 last:border-0">
              <span className="text-[14px] text-[#4A4757]">{a.message}</span>
              <span className="shrink-0 text-[12px] font-medium text-[#7A7787]">{stamp(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
