'use client';

import { useState } from 'react';

export type SignSettings = { expireDays: number; remindEvery: number; maxReminders: number; draw: boolean; type: boolean; upload: boolean; notice: string; redirectUrl: string; attach: boolean; emailRequester: boolean; accent: string; brandName: string };
export type SignRequestRow = { id: string; document: string; status: string; createdAt: string; signed: number; total: number };
export type SignLayout = { id: string; name: string; roles: number };
type Post = (payload: Record<string, unknown>) => Promise<{ message?: string } | null>;

const btn = 'inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F8F5FF] disabled:opacity-45';
const btnPrimary = 'inline-flex min-h-[36px] items-center rounded-md bg-[#301D5D] px-3 text-xs font-bold text-white transition hover:bg-[#42277c] disabled:opacity-45';
const input = 'min-h-[36px] w-full rounded-md border border-slate-300 bg-white px-2 text-sm';
const label = 'text-xs font-semibold text-slate-600';

export function SecureSignSettings({ settings, post, busy }: { settings: SignSettings; post: Post; busy: boolean }) {
  const [s, setS] = useState(settings);
  const [open, setOpen] = useState(false);
  const num = (k: 'expireDays' | 'remindEvery' | 'maxReminders') => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const check = (k: 'draw' | 'type' | 'upload' | 'attach' | 'emailRequester', text: string) => (
    <label className="flex items-center gap-2"><input type="checkbox" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} /> {text}</label>
  );
  return (
    <div className="mt-3 border border-slate-200 p-3 text-sm">
      <button type="button" className={btn} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} SecureSign Settings</button>
      {open && (
        <div className="mt-3 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block"><span className={label}>Links expire after (days)</span><input type="number" min={1} max={365} className={input} value={s.expireDays} onChange={num('expireDays')} /></label>
            <label className="block"><span className={label}>Remind every (days, 0 = off)</span><input type="number" min={0} max={60} className={input} value={s.remindEvery} onChange={num('remindEvery')} /></label>
            <label className="block"><span className={label}>Max reminders</span><input type="number" min={0} max={10} className={input} value={s.maxReminders} onChange={num('maxReminders')} /></label>
          </div>
          <fieldset><legend className={label}>Signature methods signers may use</legend>
            <div className="mt-1 flex flex-wrap gap-4">{check('draw', 'Draw')}{check('type', 'Type')}{check('upload', 'Upload Image')}</div></fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block"><span className={label}>Brand name (defaults to your brokerage from Custom Designer)</span><input className={input} maxLength={80} value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} /></label>
            <label className="block"><span className={label}>Accent color</span><span className="flex gap-2"><input type="color" aria-label="Accent color" className="h-9 w-12" value={s.accent} onChange={(e) => setS({ ...s, accent: e.target.value })} /><input className={input} value={s.accent} maxLength={7} onChange={(e) => setS({ ...s, accent: e.target.value })} /></span></label>
          </div>
          <p className="text-xs text-slate-500">Your logo comes from your agent details in Custom Designer.</p>
          <label className="block"><span className={label}>Notice shown above the document (for example a brokerage disclaimer)</span><input className={input} maxLength={400} value={s.notice} onChange={(e) => setS({ ...s, notice: e.target.value })} /></label>
          <label className="block"><span className={label}>After signing, send signers to (https address, optional)</span><input className={input} maxLength={500} placeholder="https://" value={s.redirectUrl} onChange={(e) => setS({ ...s, redirectUrl: e.target.value })} /></label>
          <div className="space-y-1">{check('attach', 'Attach the completed PDF to the completion email')}{check('emailRequester', 'Email me when a request completes or is declined')}</div>
          <button type="button" disabled={busy} className={btnPrimary} onClick={() => void post({ action: 'save_sign_settings', settings: s })}>Save Settings</button>
        </div>
      )}
    </div>
  );
}

const FILTERS = [['open', 'Open'], ['completed', 'Completed'], ['closed', 'Closed'], ['all', 'All']] as const;
export function SecureSignRequests({ requests, post, busy }: { requests: SignRequestRow[]; post: Post; busy: boolean }) {
  const [tab, setTab] = useState<(typeof FILTERS)[number][0]>('open');
  const shown = requests.filter((r) => tab === 'all' || (tab === 'open' && r.status === 'sent') || (tab === 'completed' && r.status === 'completed') || (tab === 'closed' && ['declined', 'cancelled', 'expired'].includes(r.status)));
  const count = (k: string) => requests.filter((r) => k === 'all' || (k === 'open' && r.status === 'sent') || (k === 'completed' && r.status === 'completed') || (k === 'closed' && ['declined', 'cancelled', 'expired'].includes(r.status))).length;
  if (requests.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">SecureSign requests</p>
      <div className="mt-1 flex flex-wrap gap-2" role="tablist">{FILTERS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${btn} ${tab === k ? 'border-[#301D5D] bg-[#F8F5FF]' : ''}`} onClick={() => setTab(k)}>{t} {count(k)}</button>)}</div>
      {shown.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing here.</p> : (
        <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 text-sm">{shown.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0"><span className="font-semibold">{r.document}</span> <span className="text-xs text-slate-500">{r.signed} of {r.total} signed · {new Date(r.createdAt).toLocaleDateString('en-US')}</span></span>
            <span className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize">{r.status === 'sent' ? 'Awaiting signatures' : r.status}</span>
              {r.status === 'sent' && <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Cancel this signature request? Signers will no longer be able to sign.')) void post({ action: 'cancel_signature', id: r.id }); }}>Cancel</button>}</span>
          </li>))}</ul>
      )}
    </div>
  );
}
