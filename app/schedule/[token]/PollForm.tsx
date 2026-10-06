'use client';

import { useState } from 'react';

type Answer = 'yes' | 'maybe' | 'no';
type Option = { id: string; label: string; yes: number; maybe: number };
const ANSWERS: { id: Answer; label: string; on: string }[] = [
  { id: 'yes', label: 'Works', on: 'border-[#005A00] bg-[#E0FBE0] text-[#005A00]' },
  { id: 'maybe', label: 'Maybe', on: 'border-[#645600] bg-[#FEF8CC] text-[#645600]' },
  { id: 'no', label: "Can't", on: 'border-[#661102] bg-[#FFEAE6] text-[#661102]' },
];

export default function PollForm({ token, firstName, options, initialVotes, initialComment, responded, invited }: {
  token: string; firstName: string; options: Option[]; initialVotes: Record<string, Answer>; initialComment: string; responded: boolean; invited: number;
}) {
  const [votes, setVotes] = useState<Record<string, Answer>>(initialVotes);
  const [comment, setComment] = useState(initialComment);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const missing = options.filter((o) => !votes[o.id]).length;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/schedule/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ votes, comment }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? 'Could not save your answers.'); else setDone(true);
    } catch { setError('Could not save your answers.'); }
    setBusy(false);
  };

  if (done) {
    return (
      <section className="rounded-[10px] border border-[#301D5D] bg-[#F6F3FB] p-4">
        <div className="text-[16px] font-semibold text-[#1B1726]">Thanks{firstName ? `, ${firstName}` : ''}. Your answers are saved.</div>
        <p className="mt-1">Your agent will confirm the final time. You can come back to this link to change your answers until then.</p>
        <button type="button" className="mt-3 rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] hover:border-[#301D5D]" onClick={() => setDone(false)}>Change Answers</button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-[14px]">{firstName ? `${firstName}, which` : 'Which'} of these times work for you?{responded ? ' You answered already; change anything and save again.' : ''}</p>
      <ul className="rounded-[10px] border border-[#E6E5EC]">
        {options.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3 last:border-0">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[#1B1726]">{o.label}</div>
              {invited > 1 && <div className="text-[12px] font-medium text-[#7A7787]">{o.yes} of {invited} can make it{o.maybe ? `, ${o.maybe} maybe` : ''}</div>}
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label={o.label}>
              {ANSWERS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={votes[o.id] === a.id}
                  className={`min-h-[44px] rounded-lg border px-3 text-[13px] font-medium transition ${votes[o.id] === a.id ? a.on : 'border-[#E6E5EC] bg-white text-[#1B1726] hover:border-[#301D5D]'}`}
                  onClick={() => setVotes((v) => ({ ...v, [o.id]: a.id }))}>{a.label}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">Note For Your Agent (Optional)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-[#E6E5EC] px-3 py-2 text-[14px] text-[#1B1726]" placeholder="Other times that work, access details, anything else" />
      </label>
      {error && <p role="alert" className="text-[12px] font-medium text-[#661102]">{error}</p>}
      <button type="button" disabled={busy || missing > 0} onClick={() => void submit()} className="min-h-[44px] rounded-lg bg-[#301D5D] px-5 text-[14px] font-semibold text-white hover:bg-[#42277C] disabled:opacity-45">
        {busy ? 'Saving' : missing > 0 ? `Answer ${missing} More` : 'Save My Answers'}
      </button>
    </section>
  );
}
