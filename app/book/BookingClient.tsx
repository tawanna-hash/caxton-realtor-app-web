'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { T, addDays, timeLabel, tzLabel, zoned, type Lang } from '@/lib/scheduler-shared';
import type { PublicScheduler } from '@/lib/server/closing-time-schedulers';

type Slot = { start: number; time: string };
const card = 'rounded-xl border border-[#E6E5EC] bg-white';
const field = 'w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2.5 text-[14px] text-[#1B1726] focus:border-[#301D5D] focus:outline-none';

export default function BookingClient({ scheduler }: { scheduler: PublicScheduler }) {
  const cfg = scheduler.config;
  const browserLang = useSyncExternalStore(() => () => undefined, () => navigator.language || '', () => '');
  const lang: Lang = cfg.bookerLocale === 'en' || cfg.bookerLocale === 'es' ? cfg.bookerLocale : browserLang ? (browserLang.toLowerCase().startsWith('es') ? 'es' : 'en') : cfg.language;
  const t = T[lang];
  const locale = lang === 'es' ? 'es-US' : 'en-US';
  const today = zoned(new Date(), cfg.timezone).date;
  const [length, setLength] = useState(cfg.defaultLength);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [slots, setSlots] = useState<Record<string, Slot[]> | null>(null);
  const [day, setDay] = useState('');
  const [pick, setPick] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ token: string; meetingUrl: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/book/s/${scheduler.id}?length=${length}&month=${month}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { slots: {} }))
      .then((b) => { if (live) setSlots(b.slots ?? {}); })
      .catch(() => { if (live) setSlots({}); });
    return () => { live = false; };
  }, [scheduler.id, length, month]);

  const lastMonth = addDays(today, cfg.windowDays).slice(0, 7);
  const grid = useMemo(() => {
    const first = `${month}-01`;
    const dow = new Date(`${first}T12:00:00Z`).getUTCDay();
    const lead = cfg.weekStart === 'monday' ? (dow + 6) % 7 : dow;
    const cells: (string | null)[] = Array(lead).fill(null);
    for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
    return cells;
  }, [month, cfg.weekStart]);
  const heads = useMemo(() => {
    const base = cfg.weekStart === 'monday' ? '2026-01-05' : '2026-01-04';
    return Array.from({ length: 7 }, (_, i) => new Date(`${addDays(base, i)}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' }));
  }, [cfg.weekStart, locale]);
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); setSlots(null); setDay(''); setPick(null); };
  const dayLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });

  const submit = async () => {
    if (!pick) return;
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/book/s/${scheduler.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ start: pick.start, length, name, email, answers }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.ok) { setError(b.error ?? 'Could not book that time.'); setBusy(false); return; }
      if (b.redirectUrl) { window.location.href = b.redirectUrl; return; }
      setDone({ token: b.token, meetingUrl: b.meetingUrl });
    } catch { setError('Could not book that time.'); }
    setBusy(false);
  };

  const header = (
    <>
      {cfg.hasBanner && <img src={`/api/book/s/${scheduler.id}/image/banner`} alt="" className="h-36 w-full rounded-t-xl object-cover sm:h-44" />}
      <div className="flex items-center gap-3 border-b border-[#E6E5EC] px-6 py-4">
        {cfg.hasAvatar && <img src={`/api/book/s/${scheduler.id}/image/avatar`} alt="" className="h-12 w-12 rounded-full object-cover" />}
        <div className="min-w-0">
          {scheduler.agentName && <div className="text-[13px] font-medium text-[#7A7787]">{scheduler.agentName}</div>}
          <h1 className="text-[20px] font-semibold leading-tight text-[#1B1726]">{cfg.name}</h1>
          {scheduler.property && <div className="text-[13px] text-[#7A7787]">{scheduler.property}</div>}
        </div>
      </div>
    </>
  );

  if (done && pick) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-10 font-[Inter,system-ui,sans-serif] text-[14px] text-[#4A4757]">
        <div className={card}>
          {header}
          <div className="p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E0FBE0] text-[18px] text-[#005A00]" aria-hidden="true">✓</div>
            <h2 className="mt-3 text-[20px] font-semibold text-[#1B1726]">{t.booked}</h2>
            <p className="mt-1 text-[15px] font-medium text-[#1B1726]">{dayLong(day)}, {timeLabel(pick.time, cfg.timeFormat)} · {length} {t.min}</p>
            <p className="text-[13px] text-[#7A7787]">{tzLabel(cfg.timezone)}</p>
            {done.meetingUrl && <p className="mt-2 break-all"><a className="text-[#301D5D] underline" href={done.meetingUrl}>{done.meetingUrl}</a></p>}
            <p className="mt-3">{t.sentTo} {email}.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/api/book/manage/${done.token}/ics`} className="inline-flex min-h-[44px] items-center rounded-lg border border-[#E6E5EC] bg-white px-4 text-[13px] font-medium text-[#1B1726] hover:border-[#301D5D]">{t.addCal}</a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 py-8 font-[Inter,system-ui,sans-serif] text-[14px] text-[#4A4757]">
      <div className={card}>
        {header}
        <div className="grid gap-0 md:grid-cols-[260px_1fr]">
          <aside className="border-b border-[#E6E5EC] p-6 md:border-b-0 md:border-r">
            <p className="text-[14px] text-[#1B1726]">{cfg.welcome || t.welcome}</p>
            <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]">{t.duration}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {cfg.lengths.map((l) => (
                <button key={l} type="button" onClick={() => { setLength(l); setSlots(null); setPick(null); }}
                  className={`min-h-[40px] rounded-full border px-3 text-[13px] font-medium ${l === length ? 'border-[#301D5D] bg-[#F6F3FB] text-[#301D5D]' : 'border-[#E6E5EC] bg-white text-[#1B1726] hover:border-[#301D5D]'}`}>{l} {t.min}</button>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-[#7A7787]">{t.timesIn} {tzLabel(cfg.timezone)}</p>
          </aside>

          {!pick ? (
            <section className="grid gap-6 p-6 lg:grid-cols-[1fr_200px]">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-[#1B1726]">{t.selectDate}</h2>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Previous month" disabled={month <= today.slice(0, 7)} onClick={() => shift(-1)} className="h-9 w-9 rounded-full text-[18px] text-[#301D5D] hover:bg-[#F6F3FB] disabled:opacity-30">‹</button>
                    <span className="min-w-[130px] text-center text-[14px] font-medium text-[#1B1726]">{new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })}</span>
                    <button type="button" aria-label="Next month" disabled={month >= lastMonth} onClick={() => shift(1)} className="h-9 w-9 rounded-full text-[18px] text-[#301D5D] hover:bg-[#F6F3FB] disabled:opacity-30">›</button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                  {heads.map((h) => <div key={h} className="py-1 text-[11px] font-medium uppercase text-[#7A7787]">{h}</div>)}
                  {grid.map((d, i) => {
                    if (!d) return <div key={`b${i}`} />;
                    const open = Boolean(slots?.[d]?.length);
                    return (
                      <button key={d} type="button" disabled={!open} onClick={() => setDay(d)}
                        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[14px] ${d === day ? 'bg-[#301D5D] font-semibold text-white' : open ? 'bg-[#F6F3FB] font-semibold text-[#301D5D] hover:bg-[#EFEAF8]' : 'text-[#B9B7C2]'}`}>{Number(d.slice(8))}</button>
                    );
                  })}
                </div>
                {slots && !Object.keys(slots).length && <p className="mt-3 text-[13px] text-[#7A7787]">{t.noDates}</p>}
                {!slots && <p className="mt-3 text-[12px] text-[#7A7787]">…</p>}
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[#1B1726]">{day ? dayLong(day) : t.selectTime}</h2>
                <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
                  {day && (slots?.[day] ?? []).map((s) => (
                    <button key={s.start} type="button" onClick={() => setPick(s)} className="min-h-[44px] w-full rounded-lg border border-[#301D5D] bg-white text-[14px] font-semibold text-[#301D5D] hover:bg-[#301D5D] hover:text-white">{timeLabel(s.time, cfg.timeFormat)}</button>
                  ))}
                  {day && !(slots?.[day] ?? []).length && <p className="text-[13px] text-[#7A7787]">{t.noTimes}</p>}
                </div>
              </div>
            </section>
          ) : (
            <section className="p-6">
              <button type="button" onClick={() => setPick(null)} className="text-[13px] font-medium text-[#301D5D]">‹ {t.back}</button>
              <h2 className="mt-2 text-[15px] font-semibold text-[#1B1726]">{t.details}</h2>
              <p className="text-[14px] font-medium text-[#1B1726]">{dayLong(day)}, {timeLabel(pick.time, cfg.timeFormat)} · {length} {t.min}</p>
              <div className="mt-4 grid max-w-[480px] gap-3">
                <label className="block"><span className="mb-1 block text-[13px] font-medium text-[#1B1726]">{t.name} *</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
                <label className="block"><span className="mb-1 block text-[13px] font-medium text-[#1B1726]">{t.email} *</span><input type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                {cfg.questions.map((q) => (
                  <label key={q.id} className="block">
                    <span className="mb-1 block text-[13px] font-medium text-[#1B1726]">{q.label}{q.required ? ' *' : ''}</span>
                    {q.type === 'textarea'
                      ? <textarea rows={3} className={field} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                      : <input type={q.type === 'phone' ? 'tel' : 'text'} className={field} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />}
                  </label>
                ))}
                {error && <p role="alert" className="text-[13px] font-medium text-[#661102]">{error}</p>}
                <button type="button" disabled={busy || !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || cfg.questions.some((q) => q.required && !(answers[q.id] ?? '').trim())}
                  onClick={() => void submit()} className="min-h-[44px] rounded-lg bg-[#301D5D] px-5 text-[14px] font-semibold text-white hover:bg-[#42277C] disabled:opacity-45">{busy ? t.booking : t.confirm}</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
