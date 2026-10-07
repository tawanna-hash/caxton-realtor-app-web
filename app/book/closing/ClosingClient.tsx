'use client';

import { useEffect, useState } from 'react';

type Pub = { role: 'title' | 'choose'; status: 'awaiting_title' | 'awaiting_choice' | 'scheduled' | 'cancelled'; property: string; agentName: string; titleName: string; slots: { index: number; label: string }[]; location: string; note: string; chosen: string | null };
const card = 'rounded-xl border border-[#E6E5EC] bg-white p-6';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] text-[#1B1726] outline-none focus:border-[#301D5D]';
const primary = 'rounded-lg border border-[#E6E5EC] bg-white px-4 py-2 text-[14px] font-medium text-[#1B1726] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';

export default function ClosingClient({ token }: { token: string }) {
  const [d, setD] = useState<Pub | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [rows, setRows] = useState([{ date: '', time: '10:00' }]);
  const [dur, setDur] = useState(60);
  const [loc, setLoc] = useState('');
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<number | null>(null);

  useEffect(() => { fetch(`/api/book/closing/${token}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || 'This link is not valid.'); else setD(j); }).catch(() => setErr('Could not load this page.')); }, [token]);

  async function send(payload: unknown, msg: (j: { label?: string }) => string) {
    setBusy(true); setErr('');
    const r = await fetch(`/api/book/closing/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) setErr(j.error || 'Something went wrong.'); else setDone(msg(j));
  }

  const wrap = (children: React.ReactNode) => <main className="mx-auto max-w-[560px] px-4 py-8 font-[Inter,system-ui,sans-serif]"><div className={card}>{children}</div></main>;
  if (err && !d) return wrap(<p className="text-[15px] text-[#4A4757]">{err}</p>);
  if (!d) return wrap(<p className="text-[15px] text-[#7A7787]">Loading</p>);
  const head = (<><div className="text-[13px] font-semibold uppercase tracking-wide text-[#7A7787]">Closing</div><h1 className="mt-1 text-[22px] font-semibold text-[#1B1726]">{d.property}</h1></>);
  if (done) return wrap(<>{head}<p className="mt-4 text-[15px] text-[#4A4757]">{done}</p></>);
  if (d.status === 'cancelled') return wrap(<>{head}<p className="mt-4 text-[15px] text-[#4A4757]">This request was cancelled.</p></>);
  if (d.status === 'scheduled') return wrap(<>{head}<p className="mt-4 text-[15px] text-[#4A4757]">The closing is scheduled for <strong>{d.chosen}</strong>.</p></>);

  if (d.role === 'title') {
    return wrap(<>{head}
      <p className="mt-3 text-[14px] text-[#4A4757]">{d.agentName} asked for the dates and times your office can host the closing. Add every option that works. Times are Central Time. The buyer or seller will choose one.</p>
      {d.status === 'awaiting_choice' && <p className="mt-3 rounded-lg bg-[#FEF8CC] px-3 py-2 text-[13px] text-[#645600]">Times were already sent. Saving again replaces the list and notifies the buyer or seller.</p>}
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="date" aria-label={`Date ${i + 1}`} className={field} value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            <input type="time" aria-label={`Time ${i + 1}`} className={field} value={r.time} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
            {rows.length > 1 && <button type="button" aria-label="Remove time" className="px-2 text-[#7A7787] hover:text-[#661102]" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <button type="button" className={primary} onClick={() => setRows([...rows, { date: '', time: '10:00' }])}>Add Another Time</button>
      </div>
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-[#7A7787]">Length In Minutes<input type="number" min={15} max={480} step={15} className={`${field} mt-1`} value={dur} onChange={(e) => setDur(Number(e.target.value))} /></label>
      <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[#7A7787]">Location<input className={`${field} mt-1`} value={loc} placeholder="Office address" onChange={(e) => setLoc(e.target.value)} /></label>
      <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-[#7A7787]">Note<textarea className={`${field} mt-1`} rows={3} value={note} placeholder="What to bring, parking, and so on" onChange={(e) => setNote(e.target.value)} /></label>
      {err && <p className="mt-3 text-[13px] text-[#661102]">{err}</p>}
      <div className="mt-4"><button type="button" className={primary} disabled={busy} onClick={() => send({ action: 'times', slots: rows.filter((r) => r.date && r.time), durationMin: dur, location: loc, note }, () => 'Thank you. The buyer or seller has been emailed these times and will choose one.')}>{busy ? 'Sending' : 'Send Available Times'}</button></div>
    </>);
  }

  return wrap(<>{head}
    <p className="mt-3 text-[14px] text-[#4A4757]">{d.titleName || 'The title company'} offered these times to close{d.location ? ` at ${d.location}` : ''}. Choose one. Everyone on the deal is emailed once you confirm.</p>
    {d.note && <p className="mt-2 text-[13px] text-[#7A7787]">{d.note}</p>}
    {d.status !== 'awaiting_choice' ? <p className="mt-4 text-[14px] text-[#4A4757]">The title company has not sent times yet.</p> : (
      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Closing times">
        {d.slots.map((s) => (
          <button key={s.index} type="button" role="radio" aria-checked={pick === s.index} onClick={() => setPick(s.index)} className={`block w-full rounded-lg border px-4 py-3 text-left text-[14px] ${pick === s.index ? 'border-[#301D5D] bg-[#EFEAF8] font-semibold text-[#301D5D]' : 'border-[#E6E5EC] bg-white text-[#1B1726] hover:bg-[#F6F3FB]'}`}>{s.label}</button>
        ))}
        {err && <p className="text-[13px] text-[#661102]">{err}</p>}
        <div className="pt-2"><button type="button" className={primary} disabled={busy || pick === null} onClick={() => send({ action: 'choose', index: pick }, (j) => `The closing is scheduled for ${j.label}. A confirmation with a calendar file was emailed to everyone.`)}>{busy ? 'Confirming' : 'Confirm Closing Time'}</button></div>
      </div>
    )}
  </>);
}
