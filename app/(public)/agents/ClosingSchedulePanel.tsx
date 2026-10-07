'use client';

import { useEffect, useState } from 'react';

type Person = { name: string; email: string; role: string };
type Req = { id: string; status: 'awaiting_title' | 'awaiting_choice' | 'scheduled' | 'cancelled'; titleName: string; titleEmail: string; choosers: Person[]; slots: { startUtc: string }[]; location: string; chosenStart: string | null; createdAt: string };
type Ctx = { property: string; title: { name: string; email: string } | null; choosers: Person[]; recipients: Person[]; otherSide: Person[]; requests: Req[] };
const card = 'rounded-2xl border border-[#E6E5EC] bg-white';
const pill = 'rounded-full border border-[#E6E5EC] bg-white px-4 py-2 text-[13px] font-medium text-[#1B1726] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726] outline-none focus:border-[#301D5D]';
const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
const STATUS: Record<Req['status'], string> = { awaiting_title: 'Waiting For Title Company', awaiting_choice: 'Waiting For Buyer Or Seller', scheduled: 'Scheduled', cancelled: 'Cancelled' };

/** Closing scheduler: title company enters times, buyer or seller picks, everyone is emailed the confirmed time. */
export default function ClosingSchedulePanel({ dealId }: { dealId: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [ch, setCh] = useState<string[]>([]);
  const [rc, setRc] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/closing-time/closing-schedule?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store' })
      .then(async (r) => { const b = await r.json(); if (!live) return; if (!r.ok) setError(b.error ?? 'Not available yet.'); else { setCtx(b); setError(''); } })
      .catch(() => { if (live) setError('Could not load closing scheduling.'); });
    return () => { live = false; };
  }, [dealId, tick]);

  const post = async (payload: Record<string, unknown>, ok: string) => {
    setBusy(true); setError(''); setMsg('');
    const r = await fetch('/api/closing-time/closing-schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {}; setBusy(false);
    if (!r?.ok) { setError((b as { error?: string }).error ?? 'Something went wrong.'); return false; }
    setMsg(ok); setTick((t) => t + 1); return true;
  };

  if (!ctx) return error ? <p className="text-[13px] text-[#661102]">{error}</p> : null;
  const current = ctx.requests.find((r) => r.status === 'awaiting_title' || r.status === 'awaiting_choice') ?? ctx.requests.find((r) => r.status === 'scheduled');
  const start = () => { setTName(ctx.title?.name ?? ''); setTEmail(ctx.title?.email ?? ''); setCh(ctx.choosers.map((p) => p.email)); setRc(ctx.recipients.map((p) => p.email)); setOpen(true); };
  const toggle = (list: string[], set: (v: string[]) => void, e: string) => set(list.includes(e) ? list.filter((x) => x !== e) : [...list, e]);
  const people = (list: Person[], sel: string[], set: (v: string[]) => void) => list.length === 0 ? <p className="text-[13px] text-[#4A4757]">No one with an email yet. Add emails on the People tab.</p> : (
    <ul className="divide-y divide-[#F0EFF4] rounded-xl border border-[#E6E5EC]">
      {list.map((p) => (
        <li key={p.email}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#FAF9FC]"><input type="checkbox" className="h-4 w-4 accent-[#301D5D]" checked={sel.includes(p.email)} onChange={() => toggle(sel, set, p.email)} />
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-[#1B1726]">{p.name}{p.role && <span className="ml-2 text-[12px] font-normal text-[#4A4757]">{p.role}</span>}</span><span className="block truncate text-[12px] text-[#4A4757]">{p.email}</span></span></label></li>
      ))}
    </ul>
  );

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F6F3FB] px-4 py-4">
        <div>
          <h3 className="text-[16px] font-semibold text-[#1B1726]">Schedule The Closing</h3>
          <p className="text-[13px] text-[#4A4757]">The title company sets the available times, the buyer or seller picks one, and everyone is emailed.</p>
        </div>
        {!open && (!current || current.status === 'scheduled') && <button type="button" className={pill} onClick={start}>{current ? 'Reschedule' : 'Start'}</button>}
      </div>
      <div className="space-y-3 p-4">
        {(error || msg) && <p className={`text-[13px] ${error ? 'text-[#661102]' : 'text-[#005A00]'}`} role="status">{error || msg}</p>}
        {current && !open && (
          <div className="rounded-xl border border-[#E6E5EC] bg-[#F6F3FB] px-4 py-3 text-[14px] text-[#4A4757]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#1B1726]">{STATUS[current.status]}</span>
              {current.status !== 'scheduled' && <button type="button" className={pill} disabled={busy} onClick={() => post({ action: 'cancel', id: current.id }, 'Request cancelled.')}>Cancel Request</button>}
            </div>
            <p className="mt-1">Title company: {current.titleName || current.titleEmail} ({current.titleEmail})</p>
            <p>Buyer or seller to choose: {current.choosers.map((c) => c.name || c.email).join(', ')}</p>
            {current.status === 'awaiting_choice' && <p>Times offered: {current.slots.map((s) => when(s.startUtc)).join('; ')}</p>}
            {current.status === 'scheduled' && current.chosenStart && <p className="mt-1 font-semibold text-[#005A00]">Closing: {when(current.chosenStart)}{current.location ? `, ${current.location}` : ''}</p>}
          </div>
        )}
        {!current && !open && <p className="text-[14px] text-[#4A4757]">No closing request yet. Start one to email the title company for available times.</p>}
        {open && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#4A4757]">Title Company Contact<input className={`${field} mt-1`} value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Name or company" /></label>
              <label className="text-[11px] font-medium uppercase tracking-wide text-[#4A4757]">Title Company Email<input className={`${field} mt-1`} type="email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} placeholder="closer@titleco.com" /></label>
            </div>
            <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#4A4757]">Who Chooses The Time</div>{people(ctx.choosers, ch, setCh)}</div>
            <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#4A4757]">Who Gets The Confirmation</div>{people(ctx.recipients, rc, setRc)}
              {ctx.otherSide.length > 0 && <p className="mt-1 text-[12px] text-[#4A4757]">The other side&apos;s principals ({ctx.otherSide.map((p) => p.name).join(', ')}) are not emailed.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={pill} disabled={busy} onClick={async () => { if (await post({ action: 'create', dealId, titleName: tName, titleEmail: tEmail, choosers: ctx.choosers.filter((p) => ch.includes(p.email)), recipients: ctx.recipients.filter((p) => rc.includes(p.email)) }, 'Title company emailed.')) setOpen(false); }}>{busy ? 'Sending' : 'Email Title Company'}</button>
              <button type="button" className={pill} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
