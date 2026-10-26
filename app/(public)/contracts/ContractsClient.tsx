'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PushOptInButton from '@/components/PushOptInButton';
import { calculateTrecDeadlines } from '@/lib/trec-deadlines';
import SidebarWindow from './SidebarWindow';
import { BTN, BTN_PRIMARY, BTN_SECONDARY } from './ui';

type Alerts = { emailEnabled: boolean; pushEnabled: boolean; reminderOffsets: Array<0 | 1 | 3 | 7> };
type Fields = {
  propertyAddress: string; buyerNames: string; sellerNames: string; effectiveDate: string;
  optionPeriodDays: string; additionalEarnestMoneyDays: string; financingDeadlineDays: string;
  appraisalDeadlineDays: string; titleCommitmentDays: string; surveyDays: string;
  titleObjectionDays: string; closingDate: string; salesPrice: string; earnestMoney: string;
};
type Contract = Fields & { id: string; createdAt: string; deadlines: Array<{ id: string; label: string; date: string }> };

const EMPTY: Fields = {
  propertyAddress: '', buyerNames: '', sellerNames: '', effectiveDate: '', optionPeriodDays: '',
  additionalEarnestMoneyDays: '', financingDeadlineDays: '', appraisalDeadlineDays: '',
  titleCommitmentDays: '', surveyDays: '', titleObjectionDays: '', closingDate: '', salesPrice: '', earnestMoney: '',
};

const DAY_FIELDS: Array<[keyof Fields, string]> = [
  ['optionPeriodDays', 'Option period (days)'],
  ['additionalEarnestMoneyDays', 'Additional earnest money (days)'],
  ['financingDeadlineDays', 'Financing approval (days)'],
  ['appraisalDeadlineDays', 'Appraisal (days)'],
  ['titleCommitmentDays', 'Title commitment (days)'],
  ['surveyDays', 'Survey (days)'],
  ['titleObjectionDays', 'Title objection (days)'],
];

const OFFSETS: Array<0 | 1 | 3 | 7> = [7, 3, 1, 0];
const input = 'mt-1 w-full rounded-md border border-[#D9D2E9] bg-white px-3 py-2 text-sm text-[#1B1726] focus:border-[#301D5D] focus:outline-none focus:ring-2 focus:ring-[#301D5D]/20';

function fmt(value: string): string {
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function digits(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d{1,3}$/.test(s) ? s : '';
}

function isoDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

function fromExtraction(w: Record<string, string>): Fields {
  return {
    propertyAddress: String(w.propertyAddress ?? '').trim(),
    buyerNames: String(w.buyerNames ?? '').trim(),
    sellerNames: String(w.sellerNames ?? '').trim(),
    effectiveDate: isoDate(w.effectiveDate),
    optionPeriodDays: digits(w.optionDays),
    additionalEarnestMoneyDays: digits(w.additionalEarnestMoneyDays),
    financingDeadlineDays: digits(w.financingDeadlineDays),
    appraisalDeadlineDays: digits(w.appraisalDeadlineDays),
    titleCommitmentDays: digits(w.titleCommitmentDays),
    surveyDays: digits(w.surveyDays),
    titleObjectionDays: digits(w.titleObjectionDays),
    closingDate: isoDate(w.closingDate),
    salesPrice: money(w.salesPrice),
    earnestMoney: money(w.earnestMoney),
  };
}

const money = (v: unknown) => String(v ?? '').replace(/[^\d.]/g, '').replace(/^(\d*\.\d*).*$/, '$1').slice(0, 20);

export default function ContractsClient({
  realtorId, initialContracts, initialAlerts, guest = false,
}: { realtorId: string; initialContracts: Contract[]; initialAlerts: Alerts; guest?: boolean }) {
  function needAccount(): boolean {
    if (!guest) return false;
    if (window.confirm('You need a free account to add contracts and get deadline alerts. Create your account now?')) {
      try { localStorage.setItem('caxton_return_to', '/contracts'); } catch {}
      window.location.href = '/dashboard?auth=signup';
    }
    return true;
  }
  const [contracts, setContracts] = useState(initialContracts);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [draft, setDraft] = useState<Fields | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'read' | 'save'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<string>('attention');
  useEffect(() => {
    const fromHash = () => { if (window.location.hash === '#add-contract') setView('add'); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const preview = useMemo(() => {
    if (!draft) return [];
    const list = calculateTrecDeadlines({
      effectiveDate: draft.effectiveDate, optionPeriodDays: draft.optionPeriodDays,
      additionalEarnestMoneyDays: draft.additionalEarnestMoneyDays, financingDeadlineDays: draft.financingDeadlineDays,
      appraisalDeadlineDays: draft.appraisalDeadlineDays, titleCommitmentDays: draft.titleCommitmentDays,
      surveyDays: draft.surveyDays, titleObjectionDays: draft.titleObjectionDays,
    }).map(({ id, label, date }) => ({ id, label, date }));
    if (draft.closingDate) list.push({ id: 'closing-date', label: 'Closing date', date: draft.closingDate });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [draft]);

  async function readFile(file: File) {
    setError(''); setNotice(''); setBusy('read'); setView('add');
    try {
      const body = new FormData();
      body.append('contract', file);
      const res = await fetch('/api/agent-command-center/extract-contract', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many uploads. Wait a minute and try again.' : 'We could not read that file. Check it is a TREC contract PDF, or enter the dates yourself.');
      const next = fromExtraction(data.extraction?.worksheet ?? {});
      setDraft(next);
      setWarnings(Array.isArray(data.extraction?.warnings) ? data.extraction.warnings.slice(0, 5) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not read that file.');
      setDraft({ ...EMPTY });
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    if (!draft) return;
    setError(''); setNotice(''); setBusy('save');
    try {
      const res = await fetch('/api/contract-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save this contract.');
      setContracts((c) => [data.contract, ...c]);
      setDraft(null); setWarnings([]); setView(data.contract.id);
      setNotice('Saved. You will get alerts before each date.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this contract.');
    } finally { setBusy(''); }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this contract and stop its alerts?')) return;
    setError('');
    const res = await fetch(`/api/contract-dates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) { setContracts((c) => c.filter((x) => x.id !== id)); setView('attention'); } else setError('Could not remove this contract.');
  }

  async function updateAlerts(patch: Partial<Alerts>) {
    setError('');
    const previous = alerts;
    setAlerts({ ...alerts, ...patch });
    const res = await fetch('/api/contract-dates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!res.ok) { setAlerts(previous); setError('Could not update alerts.'); return; }
    const data = await res.json();
    setAlerts(data.alerts);
  }

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));

  const selected = contracts.find((x) => x.id === view) ?? null;
  const items = [
    { id: 'attention', label: 'What Needs Attention' },
    { id: 'add', label: 'Add A Contract' },
    { id: 'alerts', label: 'How You Are Alerted' },
    ...contracts.map((x) => ({ id: x.id, label: x.propertyAddress, heading: 'Saved Contracts' })),
  ];

  return (
    <SidebarWindow label="Closing Time sections" items={items} selected={view} onSelect={(id) => { setView(id); setError(''); setNotice(''); }}>
      {view === 'attention' && <AttentionCard contracts={contracts} />}

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>}

      {view === 'add' && (
        <>
      {!draft && (
        <section id="add-contract" className="scroll-mt-20 rounded-lg border border-[#D9D2E9] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#301D5D]">Add a contract</h2>
          <p className="mt-1 text-sm text-[#5B5470]">PDF, PNG, JPG or WEBP, up to 15 MB. Your file is read once and is not stored.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className={`${BTN_PRIMARY} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              {busy === 'read' ? 'Reading contract...' : 'Upload contract'}
              <input ref={fileRef} type="file" onClick={(e) => { if (needAccount()) e.preventDefault(); }} accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== ''}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
            </label>
            <button type="button" className={BTN_SECONDARY} onClick={() => { if (needAccount()) return; setDraft({ ...EMPTY }); }} disabled={busy !== ''}>
              Enter dates myself
            </button>
          </div>
        </section>
      )}

      {draft && (
        <section id="add-contract" className="scroll-mt-20 rounded-lg border border-[#D9D2E9] bg-white p-5" aria-label="Confirm contract dates">
          <h2 className="text-lg font-semibold text-[#301D5D]">Confirm the dates</h2>
          <p className="mt-1 text-sm text-[#5B5470]">We filled in what we could read. Fix anything that looks wrong before saving.</p>
          {warnings.length > 0 && (
            <ul className="mt-3 list-disc rounded-md bg-amber-50 px-6 py-2 text-sm text-amber-900">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Property address<input className={input} value={draft.propertyAddress} onChange={set('propertyAddress')} maxLength={400} /></label>
            <label className="text-sm font-medium">Buyer<input className={input} value={draft.buyerNames} onChange={set('buyerNames')} maxLength={300} /></label>
            <label className="text-sm font-medium">Seller<input className={input} value={draft.sellerNames} onChange={set('sellerNames')} maxLength={300} /></label>
            <label className="text-sm font-medium">Effective date<input type="date" className={input} value={draft.effectiveDate} onChange={set('effectiveDate')} /></label>
            <label className="text-sm font-medium">Closing date<input type="date" className={input} value={draft.closingDate} onChange={set('closingDate')} /></label>
            <label className="text-sm font-medium">Sales price<input inputMode="decimal" className={input} value={draft.salesPrice} onChange={set('salesPrice')} maxLength={20} placeholder="450000" /></label>
            <label className="text-sm font-medium">Earnest money<input inputMode="decimal" className={input} value={draft.earnestMoney} onChange={set('earnestMoney')} maxLength={20} placeholder="5000" /></label>
            {DAY_FIELDS.map(([key, label]) => (
              <label key={key} className="text-sm font-medium">{label}
                <input inputMode="numeric" pattern="\d*" maxLength={3} className={input} value={draft[key]} onChange={set(key)} />
              </label>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-[#7059A8]">Dates we will alert you about</h3>
          {preview.length === 0 ? (
            <p className="mt-2 text-sm text-[#5B5470]">Enter the effective date to see your deadlines.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[#EEE9F6] rounded-md border border-[#EEE9F6]">
              {preview.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span>{d.label}</span><span className="font-semibold text-[#301D5D]">{fmt(d.date)}</span></li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={busy !== '' || !draft.effectiveDate || draft.propertyAddress.trim().length < 3}>
              {busy === 'save' ? 'Saving...' : 'Save contract'}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => { setDraft(null); setWarnings([]); setError(''); }} disabled={busy !== ''}>Cancel</button>
          </div>
        </section>
      )}

        </>
      )}

      {view === 'alerts' && (
      <section className="rounded-lg border border-[#D9D2E9] bg-white p-5" aria-label="Alert settings">
        <h2 className="text-lg font-semibold text-[#301D5D]">How you are alerted</h2>
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alerts.emailEnabled} onChange={(e) => void updateAlerts({ emailEnabled: e.target.checked })} />Email, sent to your account email at about 8 a.m. Central</label>
          <label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={alerts.pushEnabled} onChange={(e) => void updateAlerts({ pushEnabled: e.target.checked })} />Push notification on devices where you turn it on</label>
          {alerts.pushEnabled && <div><PushOptInButton realtorId={realtorId} label="Turn on push on this device" /></div>}
          <fieldset>
            <legend className="font-medium">Remind me</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {OFFSETS.map((o) => (
                <label key={o} className="flex min-h-[44px] items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={alerts.reminderOffsets.includes(o)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...alerts.reminderOffsets, o] : alerts.reminderOffsets.filter((x) => x !== o);
                      if (next.length === 0) return;
                      void updateAlerts({ reminderOffsets: OFFSETS.filter((x) => next.includes(x)) });
                    }} />
                  {o === 0 ? 'On the day' : `${o} day${o === 1 ? '' : 's'} before`}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>
      )}

      {selected && (
        <section aria-label="Contract details" className="rounded-lg border border-[#D9D2E9] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold text-[#301D5D]">{selected.propertyAddress}</h2>
              <p className="text-sm text-[#5B5470]">Effective {fmt(selected.effectiveDate)}</p>
              {(selected.buyerNames || selected.sellerNames) && (
                <p className="mt-1 text-sm text-[#5B5470]">{[selected.buyerNames && `Buyer: ${selected.buyerNames}`, selected.sellerNames && `Seller: ${selected.sellerNames}`].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <button type="button" className={`${BTN} !border-red-200 !bg-white !text-red-700 hover:!bg-red-50`} onClick={() => void remove(selected.id)}>Remove</button>
          </div>
          <ul className="mt-3 divide-y divide-[#EEE9F6] text-sm">
            {selected.deadlines.map((d) => (
              <li key={d.id} className="flex justify-between gap-3 py-2"><span>{d.label}</span><span className="font-medium">{fmt(d.date)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </SidebarWindow>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

function AttentionCard({ contracts }: { contracts: Contract[] }) {
  const today = todayIso();
  const items = contracts
    .flatMap((c) => c.deadlines.map((d) => ({ key: `${c.id}-${d.id}`, label: d.label, date: d.date, address: c.propertyAddress })))
    .filter((i) => daysUntil(i.date, today) >= -3)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const closings = contracts.map((c) => c.closingDate).filter((d) => d && daysUntil(d, today) >= 0).sort();
  const next = closings[0] ? daysUntil(closings[0], today) : null;
  return (
    <section className="rounded-lg border border-[#E6E5EC] bg-white p-4 sm:p-6" aria-label="What needs attention">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
            All Contracts &middot; {contracts.length} Saved
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-gray-900">What Needs Attention</h2>
        </div>
        <span className="bg-[#F6F3FB] px-3 py-2 text-xs font-bold text-[#301D5D]">
          {next === null ? 'No upcoming closings' : next === 0 ? 'Next Closing Today' : `Next closing \u00b7 ${next} day${next === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-600">{contracts.length === 0 ? 'No contracts yet. Upload one to see its dates here.' : 'No upcoming dates or recent overdue deadlines.'}</p>
        ) : items.map((i) => {
          const diff = daysUntil(i.date, today);
          return (
            <div key={i.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{i.label}</p>
                <p className="text-xs text-slate-500">{i.address}</p>
              </div>
              <span className={`text-xs font-bold ${diff < 0 ? 'text-[#661102]' : 'text-[#301D5D]'}`}>{diff < 0 ? 'Overdue' : diff === 0 ? 'Due Today' : fmt(i.date)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
