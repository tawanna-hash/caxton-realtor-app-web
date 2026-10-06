'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { messagingPeople } from '@/lib/closing-time-people';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';
import Tip from './Tip';

type Answer = 'yes' | 'maybe' | 'no';
type Option = { id: string; date: string; time: string };
type Invitee = { id: string; name: string; email: string; token: string; respondedAt: string | null; comment: string; votes: Record<string, Answer> };
type Poll = { id: string; title: string; location: string; durationMin: number; note: string; status: 'open' | 'closed'; finalOptionId: string | null; createdAt: string; options: Option[]; invitees: Invitee[] };
type Pick = { key: string; name: string; email: string; role: string; on: boolean };

const btn = 'inline-flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white disabled:opacity-45';
const btnPrimary = 'inline-flex items-center rounded-lg bg-[#301D5D] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#42277C] disabled:opacity-45';
const card = 'rounded-[10px] border border-[#E6E5EC] bg-white';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726]';
const lab = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';
const PURPOSES = ['Home Inspection', 'Appraisal', 'Survey', 'Repairs Walkthrough', 'Final Walkthrough', 'Closing', 'Showing', 'Client Meeting'];
const CELL: Record<Answer, { text: string; cls: string }> = {
  yes: { text: 'Works', cls: 'bg-[#E0FBE0] text-[#005A00]' },
  maybe: { text: 'Maybe', cls: 'bg-[#FEF8CC] text-[#645600]' },
  no: { text: "Can't", cls: 'bg-[#FFEAE6] text-[#661102]' },
};

function slotLabel(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  return `${day}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const keyOf = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
const score = (p: Poll, o: Option) => p.invitees.reduce((s, i) => s + (i.votes[o.id] === 'yes' ? 2 : i.votes[o.id] === 'maybe' ? 1 : 0), 0);

/** Scheduling polls on one deal: propose times, send each person a private link, see who can make it, pick the time. */
export default function SchedulingPollPanel({ deal }: { deal: AgentDeal }) {
  const [polls, setPolls] = useState<Poll[] | undefined>(undefined);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');

  const people = useMemo<Pick[]>(() => messagingPeople(deal).map((p) => ({ key: keyOf(p.name), name: p.name, email: p.email, role: p.role, on: false })), [deal]);
  const [title, setTitle] = useState(PURPOSES[0]);
  const [location, setLocation] = useState(deal.propertyAddress ?? '');
  const [duration, setDuration] = useState(60);
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<{ date: string; time: string }[]>([{ date: '', time: '10:00' }, { date: '', time: '14:00' }]);
  const [picks, setPicks] = useState<Pick[]>(people);
  const [extraName, setExtraName] = useState('');
  const [extraEmail, setExtraEmail] = useState('');
  const [emailInvites, setEmailInvites] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/closing-time/polls?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
      setPolls(body.polls ?? []); setError('');
    } catch { setError('Could not load scheduling polls.'); }
  }, [deal.id]);
  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/polls?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json();
        if (!live) return;
        if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
        setPolls(body.polls ?? []); setError('');
      })
      .catch(() => { if (live) setError('Could not load scheduling polls.'); });
    return () => { live = false; };
  }, [deal.id]);

  const post = async (key: string, payload: Record<string, unknown>, done?: (b: Record<string, unknown>) => string) => {
    setBusy(key); setError(''); setMsg('');
    try {
      const res = await fetch('/api/closing-time/polls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Something went wrong.'); setBusy(''); return false; }
      if (done) setMsg(done(body));
      await load();
    } catch { setError('Something went wrong.'); setBusy(''); return false; }
    setBusy('');
    return true;
  };

  const today = chicagoToday();
  const chosen = picks.filter((p) => p.on);
  const goodSlots = slots.filter((s) => s.date && s.time);
  const canCreate = title.trim() && goodSlots.length > 0 && chosen.length > 0;

  const create = async () => {
    const ok = await post('create', { action: 'create', dealId: deal.id, title: title.trim(), location: location.trim(), durationMin: duration, note: note.trim(), options: goodSlots, invitees: chosen.map((p) => ({ name: p.name, email: p.email.trim() })), email: emailInvites },
      (b) => (emailInvites ? `Poll created. ${b.emailed ?? 0} invitation${b.emailed === 1 ? '' : 's'} emailed.` : 'Poll created. Copy each link below and send it however you like.'));
    if (ok) { setCreating(false); setNote(''); setSlots([{ date: '', time: '10:00' }, { date: '', time: '14:00' }]); setPicks(people); }
  };
  const addExtra = () => {
    const name = extraName.trim(); if (!name) return;
    setPicks((list) => (list.some((p) => p.key === keyOf(name)) ? list.map((p) => (p.key === keyOf(name) ? { ...p, on: true, email: p.email || extraEmail.trim() } : p)) : [...list, { key: keyOf(name), name, email: extraEmail.trim(), role: 'Added', on: true }]));
    setExtraName(''); setExtraEmail('');
  };
  const copy = (token: string) => { void navigator.clipboard.writeText(`${window.location.origin}/schedule/${token}`); setCopied(token); setTimeout(() => setCopied(''), 1500); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold text-[#1B1726]">Scheduling Polls</h2>
          <p className="mt-1 text-[14px] text-[#4A4757]">Offer a few times, let everyone pick what works, then confirm one.</p>
        </div>
        {!creating && <button type="button" className={btnPrimary} onClick={() => { setCreating(true); setPicks(people); }}>New Poll</button>}
      </div>

      {creating && (
        <section className={`${card} p-4`}>
          <h3 className="text-[14px] font-semibold text-[#1B1726]">New Scheduling Poll</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lab}>What Are You Scheduling</span>
              <input list="poll-purposes" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} className={field} />
              <datalist id="poll-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
            <label className="block"><span className={lab}>Length</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2"><span className={lab}>Where</span>
              <input value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} className={field} placeholder="Property address, title office or video call link" />
            </label>
            <label className="block sm:col-span-2"><span className={lab}>Note (Optional)</span>
              <textarea value={note} maxLength={800} rows={2} onChange={(e) => setNote(e.target.value)} className={field} placeholder="Lockbox, parking or anything people should know" />
            </label>
          </div>

          <div className="mt-4">
            <span className={lab}>Times To Offer (Central)</span>
            <ul className="space-y-2">
              {slots.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input type="date" min={today} value={s.date} aria-label={`Date ${i + 1}`} onChange={(e) => setSlots((l) => l.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={`${field} w-auto`} />
                  <input type="time" step={900} value={s.time} aria-label={`Time ${i + 1}`} onChange={(e) => setSlots((l) => l.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className={`${field} w-auto`} />
                  {slots.length > 1 && <button type="button" className={btn} onClick={() => setSlots((l) => l.filter((_, j) => j !== i))}>Remove</button>}
                </li>
              ))}
            </ul>
            {slots.length < 20 && <button type="button" className={`${btn} mt-2`} onClick={() => setSlots((l) => [...l, { date: l.at(-1)?.date ?? '', time: l.at(-1)?.time ?? '10:00' }])}>Add Time</button>}
          </div>

          <div className="mt-4">
            <span className={lab}>Who Should Answer</span>
            <ul className="rounded-lg border border-[#E6E5EC] px-3">
              {picks.map((p) => (
                <li key={p.key} className="flex flex-wrap items-center gap-3 border-b border-[#E6E5EC] py-2 last:border-0">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" checked={p.on} onChange={(e) => setPicks((l) => l.map((x) => (x.key === p.key ? { ...x, on: e.target.checked } : x)))} />
                    <span className="min-w-0"><span className="block text-[14px] font-medium text-[#1B1726]">{p.name}</span><span className="block text-[12px] font-medium text-[#7A7787]">{p.role}</span></span>
                  </label>
                  <input type="email" value={p.email} placeholder="Email (optional)" aria-label={`${p.name} email`} onChange={(e) => setPicks((l) => l.map((x) => (x.key === p.key ? { ...x, email: e.target.value } : x)))} className={`${field} sm:w-[260px]`} />
                </li>
              ))}
              {picks.length === 0 && <li className="py-2 text-[14px] text-[#4A4757]">No one on this deal yet. Add someone below or on the People tab.</li>}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={extraName} onChange={(e) => setExtraName(e.target.value)} placeholder="Add someone else: name" aria-label="Name" className={`${field} sm:w-[220px]`} />
              <input type="email" value={extraEmail} onChange={(e) => setExtraEmail(e.target.value)} placeholder="Email" aria-label="Email" className={`${field} sm:w-[240px]`} />
              <button type="button" className={btn} disabled={!extraName.trim()} onClick={addExtra}>Add Person</button>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-[14px] text-[#1B1726]">
            <input type="checkbox" checked={emailInvites} onChange={(e) => setEmailInvites(e.target.checked)} /> Email each person their private link now
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={!canCreate || busy === 'create'} onClick={() => void create()}>{busy === 'create' ? 'Creating' : 'Create Poll'}</button>
            <button type="button" className={btn} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </section>
      )}

      {msg && <p role="status" className="text-[13px] font-medium text-[#005A00]">{msg}</p>}
      {error && <p role="alert" className="text-[13px] font-medium text-[#661102]">{error}</p>}
      {polls === undefined && !error && <p className="text-[12px] font-medium text-[#7A7787]">Loading</p>}
      {polls?.length === 0 && !creating && <section className={`${card} p-4 text-[14px] text-[#4A4757]`}>No polls on this deal yet. Start one for the inspection, walkthrough, closing or anything else that needs a time.</section>}

      {polls?.map((p) => {
        const best = p.options.reduce<Option | null>((b, o) => (score(p, o) > (b ? score(p, b) : 0) ? o : b), null);
        const final = p.options.find((o) => o.id === p.finalOptionId);
        const answered = p.invitees.filter((i) => i.respondedAt).length;
        return (
          <section key={p.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6E5EC] px-4 py-3.5">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-[#1B1726]">{p.title}</h3>
                <p className="text-[12px] font-medium text-[#7A7787]">{[final ? `Set for ${slotLabel(final.date, final.time)} CT` : p.status === 'open' ? `${answered} of ${p.invitees.length} answered` : 'Closed', p.location, `${p.durationMin} min`].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.status === 'open' && p.invitees.some((i) => i.email && !i.respondedAt) && <button type="button" className={btn} disabled={busy === `r${p.id}`} onClick={() => void post(`r${p.id}`, { action: 'remind', pollId: p.id }, (b) => `${b.emailed ?? 0} reminder${b.emailed === 1 ? '' : 's'} emailed.`)}>Remind Non-Responders</button>}
                {p.status === 'closed' && <button type="button" className={btn} disabled={busy === `o${p.id}`} onClick={() => void post(`o${p.id}`, { action: 'reopen', pollId: p.id }, () => 'Poll reopened.')}>Reopen</button>}
                <button type="button" className={btn} disabled={busy === `d${p.id}`} onClick={() => { if (window.confirm(`Delete the ${p.title} poll? Everyone's links stop working.`)) void post(`d${p.id}`, { action: 'delete', pollId: p.id }, () => 'Poll deleted.'); }}>Delete</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E6E5EC]">
                    <th className="px-4 py-2 font-medium text-[#7A7787]">Time (Central)</th>
                    {p.invitees.map((i) => <th key={i.id} className="px-2 py-2 font-medium text-[#1B1726]">{i.name.split(/\s+/)[0]}</th>)}
                    <th className="px-2 py-2 font-medium text-[#7A7787]">Works</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {p.options.map((o) => {
                    const yes = p.invitees.filter((i) => i.votes[o.id] === 'yes').length;
                    const isFinal = o.id === p.finalOptionId;
                    return (
                      <tr key={o.id} className={`border-b border-[#F1F0F5] last:border-0 ${isFinal ? 'bg-[#F6F3FB]' : ''}`}>
                        <td className="px-4 py-2 font-medium text-[#1B1726]">
                          {slotLabel(o.date, o.time)}
                          {isFinal && <span className="ml-2 rounded bg-[#301D5D] px-1.5 py-0.5 text-[11px] font-semibold text-white">Confirmed</span>}
                          {!isFinal && p.status === 'open' && best?.id === o.id && <span className="ml-2 rounded bg-[#EFEAF8] px-1.5 py-0.5 text-[11px] font-semibold text-[#301D5D]">Best Fit</span>}
                        </td>
                        {p.invitees.map((i) => {
                          const a = i.votes[o.id];
                          return <td key={i.id} className="px-2 py-2">{a ? <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${CELL[a].cls}`}>{CELL[a].text}</span> : <span className="text-[#7A7787]">-</span>}</td>;
                        })}
                        <td className="px-2 py-2 font-semibold text-[#1B1726]">{yes}/{p.invitees.length}</td>
                        <td className="px-4 py-2 text-right">
                          {p.status === 'open' && (
                            <button type="button" className={btn} disabled={busy === `f${p.id}`} onClick={() => {
                              if (!window.confirm(`Confirm ${p.title} for ${slotLabel(o.date, o.time)} CT? This closes the poll.`)) return;
                              const notify = p.invitees.some((i) => i.email) && window.confirm('Email everyone the confirmed time with a calendar link?');
                              void post(`f${p.id}`, { action: 'finalize', pollId: p.id, optionId: o.id, notify }, (b) => (notify ? `Time confirmed. ${b.emailed ?? 0} confirmation${b.emailed === 1 ? '' : 's'} emailed.` : 'Time confirmed.'));
                            }}>Pick This Time</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="border-t border-[#E6E5EC] px-4">
              {p.invitees.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F0F5] py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-[#1B1726]">{i.name}</div>
                    <div className="text-[12px] font-medium text-[#7A7787]">{[i.email || 'No email', i.respondedAt ? `Answered ${new Date(i.respondedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Waiting'].join(' · ')}</div>
                    {i.comment && <div className="mt-0.5 text-[13px] text-[#4A4757]">&ldquo;{i.comment}&rdquo;</div>}
                  </div>
                  <button type="button" className={btn} onClick={() => copy(i.token)}>{copied === i.token ? 'Copied' : 'Copy Link'}</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <Tip text="Each person gets a private link with no sign-in. They see the times and how many people can make each one, never who answered what. Answers and confirmations are written to the Audit Trail." />
    </div>
  );
}
