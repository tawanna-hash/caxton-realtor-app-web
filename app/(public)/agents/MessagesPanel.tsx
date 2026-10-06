'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

type Text = { id: string; personName: string; phone: string; direction: 'outbound' | 'inbound'; body: string; status: string; error: string | null; createdAt: string };
type Email = { direction?: 'outbound' | 'inbound'; id: string; personName: string; toEmail: string; subject: string; body: string; status: string; error: string | null; createdAt: string };
type Mailbox = { connected: string | null; readReplies: boolean; lastChecked: string | null; lastError: string | null };
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
  const out: Party[] = [];
  const add = (name: string, role: string, email: string, phone: string) => {
    const k = key(name); if (!k) return;
    const have = out.find((p) => p.key === k);
    if (have) { have.email ||= email; have.phone ||= phone; return; }
    out.push({ key: k, name: name.trim(), role, email, phone });
  };
  (deal.clientContacts ?? []).forEach((c) => add(c.name, c.role || 'Client', c.email ?? '', c.phone ?? ''));
  const split = (v: string) => (v || '').split(/\s*(?:&|,|\/|\band\b)\s*/i);
  split(deal.buyerNames).forEach((n) => add(n, 'Buyer', '', ''));
  split(deal.sellerNames).forEach((n) => add(n, 'Seller', '', ''));
  (deal.serviceProviders ?? []).forEach((s) => add(s.name, s.category || 'Provider', s.email ?? '', s.phone ?? ''));
  return out;
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

  const phonesParam = parties.map((p) => p.phone).filter(Boolean).join(',');
  useEffect(() => {
    let live = true;
    const run = () => fetch(`/api/closing-time/texts?dealId=${encodeURIComponent(scope)}&phones=${encodeURIComponent(phonesParam)}${contact ? `&name=${encodeURIComponent(contact.name)}&email=${encodeURIComponent(contact.email)}&phone=${encodeURIComponent(contact.phone)}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b) { setAllowed(b.allowed); setLocked(b.locked === true); setMailbox(b.mailbox ?? null); setActivity(b.activity ?? []); setTexts(b.texts ?? []); setEmails(b.emails ?? []); setConsent(b.consent ?? {}); setLoaded(true); } })
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

  const sendEmail = async () => {
    if (!party?.email) return;
    if (await post({ action: 'email', dealId: scope, subject, body, to: [{ name: party.name, email: party.email }] })) { setBody(''); setSubject(''); setMsg(`Email sent to ${party.name}.`); }
  };
  const sendText = async () => {
    if (!party) return;
    if (await post({ action: 'send', dealId: scope, name: party.name, phone: party.phone, body })) { setBody(''); setMsg(`Text sent to ${party.name}.`); }
  };

  if (!parties.length) return <div className="ds-card px-4 py-6 text-sm text-slate-600">Add the people on this deal on the People tab to message them here.</div>;
  const items = party ? itemsFor(party) : [];
  const last = (p: Party) => { const l = itemsFor(p).at(-1); return l ? `${l.kind === 'sms' ? 'Text' : 'Email'} · ${stamp(l.at)}` : 'No messages yet'; };

  return (
    <div className={contact ? 'grid gap-4' : 'grid gap-4 md:grid-cols-[260px_1fr]'}>
      {!contact && <div className="ds-card">
        <h2 className="border-b border-[#E6E5EC] px-4 py-3 text-[14px] font-semibold text-[#1B1726]">People On This Deal</h2>
        {parties.map((p) => (
          <button key={p.key} type="button" onClick={() => { setSel(p.key); setMsg(''); }} className={`block w-full border-b border-[#E6E5EC] px-4 py-3 text-left last:border-0 ${p.key === sel ? 'bg-[#F6F3FB]' : 'bg-white hover:bg-[#F6F3FB]'}`}>
            <span className="block text-[14px] font-medium text-[#1B1726]">{p.name}</span>
            <span className="block text-[12px] font-medium text-[#7A7787]">{p.role} · {last(p)}</span>
          </button>
        ))}
      </div>}

      <div className="ds-card">
        {party && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3">
              <div>
                <div className="text-[14px] font-semibold text-[#1B1726]">{party.name}</div>
                <div className="text-[12px] font-medium text-[#7A7787]">{[party.email, party.phone].filter(Boolean).join(' · ') || 'No email or phone on file. Add them on the People tab.'}</div>
              </div>
            </div>
            <div className="max-h-[360px] space-y-3 overflow-auto px-4 py-4">
              {!loaded && <p className="text-xs text-slate-500">Loading messages.</p>}
              {loaded && items.length === 0 && <p className="text-xs text-slate-500">No messages with {party.name} yet.</p>}
              {items.map((i) => (
                <div key={`${i.kind}-${i.id}`} className={`max-w-[85%] rounded-xl border px-3 py-2 ${i.out ? 'ml-auto border-[#E6E5EC] bg-[#F6F3FB]' : 'border-[#E6E5EC] bg-white'}`}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">{i.kind === 'email' ? 'Email' : 'Text'} · {stamp(i.at)}</div>
                  {i.kind === 'email' && <div className="text-[13px] font-semibold text-[#1B1726]">{i.title}</div>}
                  <div className="whitespace-pre-wrap text-[14px] text-[#4A4757]">{i.body}</div>
                  <div className="text-[12px] font-medium text-[#7A7787]">{i.out ? (STATUS[i.status] ?? i.status) : 'Received'}{i.error ? `: ${i.error.slice(0, 120)}` : ''}</div>
                </div>
              ))}
            </div>
            {locked ? (
              <p className="border-t border-[#E6E5EC] px-4 py-4 text-[13px] text-[#4A4757]">This deal is closed and its record is locked. Messaging has stopped. The history above is kept for the audit record.</p>
            ) : (
            <div className="border-t border-[#E6E5EC] px-4 py-4">
              {mailbox && (
                <div className="mb-4 rounded-lg border border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2 text-[12px] font-medium text-[#4A4757]">
                  {mailbox.connected ? (
                    <>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#301D5D]" checked={mailbox.readReplies} disabled={busy} onChange={(e) => void post({ action: 'mailbox_read', on: e.target.checked })} />
                        <span>Show email replies from {mailbox.connected}. The app looks only for mail from people listed on your deals. Other mail is not read into the app or stored.</span>
                      </label>
                      {mailbox.readReplies && (
                        <div className="mt-1 flex flex-wrap items-center gap-3 pl-6">
                          <span>{mailbox.lastChecked ? `Last checked ${stamp(mailbox.lastChecked)}` : 'Not checked yet'}</span>
                          <button type="button" className="underline underline-offset-2 hover:text-[#301D5D]" disabled={busy} onClick={() => void post({ action: 'mailbox_check' })}>Check Now</button>
                          {mailbox.lastError && <span className="text-[#9A3D2B]">{mailbox.lastError}</span>}
                        </div>
                      )}
                    </>
                  ) : <span>Connect Gmail or Outlook in Integrations to see email replies here.</span>}
                </div>
              )}
              <div className="mb-3 flex gap-5 border-b border-[#E6E5EC]">
                {(['email', 'sms'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setMsg(''); }} className={`-mb-px border-b-2 pb-2 text-[13px] font-medium ${mode === m ? 'border-[#301D5D] text-[#301D5D]' : 'border-transparent text-[#7A7787]'}`}>{m === 'email' ? 'Email' : 'Text'}</button>
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
            )}
          </>
        )}
      </div>
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
