'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import { clientsOf } from './ClientPortalPanel';
import Tip from './Tip';

type Req = { id: string; label: string; note: string; personName: string; status: 'pending' | 'uploaded' | 'received' | 'cancelled'; emailed: boolean; createdAt: string; uploadedAt: string | null; receivedAt: string | null; logged: { requested: boolean; uploaded: boolean; received: boolean } };
type Upload = { id: string; docId: string; filename: string; storedIn: string; storedPath: string; storedUrl: string; archived: boolean };

const PRESETS = ["Driver's License (Front And Back)", 'Pre-Approval Letter', 'Proof Of Funds', 'Homeowners Insurance Binder', 'Other'];
const btn = 'inline-flex items-center rounded-lg border border-[#d4d8dd] bg-white px-3 py-2 text-[13px] font-medium text-[#292a2d] transition hover:border-[#005a8f] hover:bg-[#005a8f] hover:text-white disabled:opacity-45';
const field = 'w-full rounded-lg border border-[#d4d8dd] bg-white px-3 py-2 text-[14px] text-[#292a2d]';
const lab = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#51555b]';
const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const STATUS: Record<string, string> = { pending: 'Pending', uploaded: 'Needs Review', received: 'Received' };

/** Agent requests a document from a client, tracks it as pending, and marks it received after the client uploads. */
type Group = { items: readonly { id: string; label: string }[] };
const KEYWORDS: RegExp[] = [/pre-?approval/i, /proof of funds/i, /insurance/i, /driver|licen[sc]e|identification/i];
/** Checklist items that this request satisfies, matched by what the request asks for. */
function matchingDocs(label: string, groups: readonly Group[]) {
  const all = groups.flatMap((g) => g.items);
  return KEYWORDS.filter((k) => k.test(label)).flatMap((k) => all.filter((i) => k.test(i.label)));
}

/**
 * Requests are kept in the database. This copies each step (requested, uploaded, received) into the deal's Audit Trail once,
 * and checks off the matching checklist items when a request is received. headless = sync only, no card.
 */
export default function DocumentRequestsCard({ deal, locked, documentGroups, onUpdate, headless }: { deal: AgentDeal; locked: boolean; documentGroups: readonly Group[]; onUpdate: <K extends keyof AgentDeal>(key: K, value: AgentDeal[K]) => void; headless?: boolean }) {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [events, setEvents] = useState<{ id: string; message: string; createdAt: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [who, setWho] = useState('all');
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);

  const people = clientsOf(deal);
  const latest = useRef(deal);
  const pendingChecks = useRef<Record<string, boolean>>({});

  // Step two of the sync: runs after the activity update has rendered, so the checklist update does not overwrite it.
  useEffect(() => {
    latest.current = deal;
    const pending = pendingChecks.current;
    if (Object.keys(pending).length && !locked) {
      pendingChecks.current = {};
      onUpdate('documentChecks', { ...deal.documentChecks, ...pending });
    }
  }, [deal, locked, onUpdate]);

  useEffect(() => {
    if (!reqs || locked) return;
    const d = latest.current;
    const doneEvents: string[] = [];
    const have = new Set(d.activity.map((a) => a.id));
    const add: { id: string; message: string; createdAt: string }[] = [];
    const marks: { id: string; event: 'requested' | 'uploaded' | 'received' }[] = [];
    const checks: Record<string, boolean> = {};
    for (const r of [...reqs].reverse()) {
      const who = r.personName ? ` from ${r.personName}` : '';
      const ev = (event: 'requested' | 'uploaded' | 'received', message: string, at: string | null) => {
        if (!at || r.logged[event]) return;
        const id = `docreq-${r.id}-${event}`;
        if (!have.has(id)) add.push({ id, message: message.slice(0, 600), createdAt: at });
        marks.push({ id: r.id, event });
      };
      ev('requested', `Requested ${r.label}${who}`, r.createdAt);
      ev('uploaded', `${r.personName || 'Client'} uploaded ${r.label}`, r.uploadedAt);
      if (r.status === 'received' && !r.logged.received) {
        const docs = matchingDocs(r.label, documentGroups);
        docs.forEach((i) => { checks[i.id] = true; });
        checks[`req:${r.id}`] = true;
        ev('received', `Marked received: ${r.label}${who}${docs.length ? `. Checklist checked: ${docs.map((i) => i.label).join(', ')}` : ''}`, r.receivedAt);
      }
    }
    for (const e of events) {
      const id = `evt-${e.id}`;
      if (!have.has(id)) add.push({ id, message: e.message, createdAt: e.createdAt });
      doneEvents.push(e.id);
    }
    if (!marks.length && !doneEvents.length) return;
    pendingChecks.current = checks;
    if (add.length) onUpdate('activity', [...d.activity, ...add].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-300));
    else onUpdate('documentChecks', { ...d.documentChecks, ...checks });
    if (doneEvents.length) void fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'events_audited', ids: doneEvents }) });
    for (const m of marks) void fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_logged', ...m }) });
  }, [reqs, events, locked, documentGroups, onUpdate]);

  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live) { setReqs(b ? (b.docRequests as Req[]) : []); setUploads(b ? (b.uploads as Upload[]) : []); setEvents(b ? ((b.auditEvents ?? []) as { id: string; message: string; createdAt: string }[]) : []); } })
      .catch(() => { if (live) setReqs([]); });
    return () => { live = false; };
  }, [deal.id, deal.updatedAt, tick]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) { setMessage(body.error ?? 'Something went wrong.'); return null; }
      setTick((n) => n + 1);
      return body;
    } catch { setMessage('Something went wrong.'); return null; } finally { setBusy(false); }
  }, []);

  const send = async () => {
    const label = preset === 'Other' ? custom.trim() : preset;
    if (!label) { setMessage('Enter what you need.'); return; }
    const chosen = who === 'all' ? people : people.filter((p) => p.key === who);
    if (!chosen.length) { setMessage('Add the client on the People tab first.'); return; }
    const r = await post({ action: 'request_document', dealId: deal.id, label, note, email, people: chosen.map((p) => ({ name: p.name, email: p.email })) });
    if (r) {
      setMessage(`Request recorded for ${chosen.map((p) => p.name).join(' and ')}.${email ? ` ${r.emailed} email${r.emailed === 1 ? '' : 's'} sent.` : ''}`);
      setOpen(false); setNote(''); setCustom('');
    }
  };

  if (!reqs || headless) return null;
  const pending = reqs.filter((r) => r.status === 'pending' || r.status === 'uploaded').length;
  return (
    <div className="ds-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4 text-[#2f7aa7]" aria-hidden="true" />Client Document Requests</span>
        <span className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">{pending} Open</span>
          {!locked && <button type="button" className={btn} onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Request Document'}</button>}
        </span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-[#d4d8dd] px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={lab}>Document</span>
              <select className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p}>{p}</option>)}</select>
            </label>
            <label><span className={lab}>Send To</span>
              <select className={field} value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">Everyone On The Deal (Separate Request Each)</option>
                {people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </label>
          </div>
          {preset === 'Other' && <label className="block"><span className={lab}>What Do You Need</span><input className={field} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={200} /></label>}
          <label className="block"><span className={lab}>Note To Client (Optional)</span><input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="For example: a clear photo of both sides" /></label>
          <label className="flex items-center gap-2 text-[14px] text-[#51555b]"><input type="checkbox" className="h-4 w-4 accent-[#005a8f]" checked={email} onChange={(e) => setEmail(e.target.checked)} />Email the request with their private portal link (only people with an email on file)</label>
          <button type="button" disabled={busy} className={btn} onClick={() => void send()}>Send Request</button>
        </div>
      )}
      {message && <p className="border-t border-[#d4d8dd] px-4 py-2 text-xs font-medium text-slate-600" role="status">{message}</p>}
      {reqs.length === 0 && !open && <Tip text="Ask a client for a document, like a driver's license, and track it here until you mark it received." />}
      {reqs.map((r) => {
        const files = uploads.filter((u) => u.docId === `req:${r.id}` && !u.archived);
        return (
          <div key={r.id} className="ds-list-row !items-start">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#005a8f]" aria-label={`Mark ${r.label} received`} checked={r.status === 'received'} disabled={locked || busy || r.status !== 'uploaded'} title={r.status === 'pending' ? 'Available after the client uploads' : undefined} onChange={() => void post({ action: 'request_received', id: r.id })} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-800">{r.label}{r.personName ? ` · ${r.personName}` : ''}</span>
              <span className="block text-xs text-slate-500">
                Requested {when(r.createdAt)}{r.emailed ? ' · Emailed' : ''}{r.uploadedAt ? ` · Uploaded ${when(r.uploadedAt)}` : ''}{r.receivedAt ? ` · Received ${when(r.receivedAt)}` : ` · ${STATUS[r.status]}`}
              </span>
              {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
              {files.map((u) => (
                <span key={u.id} className="block text-xs text-slate-600">
                  {u.filename} · {u.storedIn ? (u.storedUrl ? <a className="font-medium text-[#005a8f] underline underline-offset-2" href={u.storedUrl} target="_blank" rel="noreferrer">{u.storedPath || 'Open'}</a> : u.storedPath) : <a className="font-medium text-[#005a8f] underline underline-offset-2" href={`/api/closing-time/assist/upload/${u.id}`}>Held In Closing Time</a>}
                </span>
              ))}
            </span>
            {!locked && (
              <span className="flex shrink-0 gap-2">
                {r.status === 'uploaded' && <button type="button" disabled={busy} className={btn} onClick={() => void post({ action: 'request_received', id: r.id })}>Mark Received</button>}
                {(r.status === 'pending' || r.status === 'uploaded') && <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Cancel this request?')) void post({ action: 'request_cancel', id: r.id }); }}>Cancel</button>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
