'use client';

// Agreements (Beta) default settings, laid out like Anchor's "Proposals default
// configuration": title and Save changes on one row, one white card, sections,
// label left and control right.

import { useEffect, useState } from 'react';
import { A, SettingRow } from '@/components/anchor/ui';

type Defaults = {
  due_days: number;
  billing_day: 'start' | number;
  proposal_expiry_days: number | null;
  intro_new: string;
  intro_renewal: string;
};

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export default function DefaultsPanel() {
  const [d, setD] = useState<Defaults | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/defaults', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive) setD(j.defaults as Defaults); })
      .catch(() => { if (alive) setMsg('Could not load defaults.'); });
    return () => { alive = false; };
  }, []);

  async function save() {
    if (!d) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/agreements-v2/defaults', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      setD(j.defaults as Defaults);
      setMsg('Changes saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  if (!d) return <p className="text-sm text-[color:var(--ds-body)]">{msg ?? 'Loading…'}</p>;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--ds-ink)]">Proposals default configuration</h2>
          <p className="text-sm text-[color:var(--ds-body)]">Set the default values of new proposals you create</p>
        </div>
        <button onClick={save} disabled={saving} className={A.primary}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
      {msg && <div className={A.notice}>{msg}</div>}
      <div className={`${A.card} p-6`}>
        <h3 className="mb-1 text-sm font-semibold text-[color:var(--ds-ink)]">General settings</h3>
        <div className="divide-y divide-[color:var(--ds-line)]">
          <SettingRow label="Number of days until payment is due">
            <select className={A.input} value={d.due_days} onChange={(e) => setD({ ...d, due_days: Number(e.target.value) })}>
              {[0, 7, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n === 0 ? 'On receipt of invoice' : `${n} days`}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="Proposal expiration in days">
            <select className={A.input} value={d.proposal_expiry_days ?? ''} onChange={(e) => setD({ ...d, proposal_expiry_days: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Proposals don&apos;t expire</option>
              {[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </SettingRow>
        </div>
        <h3 className="mb-1 mt-6 text-sm font-semibold text-[color:var(--ds-ink)]">Automatic billing settings</h3>
        <div className="divide-y divide-[color:var(--ds-line)]">
          <SettingRow label="Billing day for monthly services">
            <select className={A.input} value={String(d.billing_day)} onChange={(e) => setD({ ...d, billing_day: e.target.value === 'start' ? 'start' : Number(e.target.value) })}>
              <option value="start">Same day as the start date</option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{ordinal(n)} of the month</option>)}
            </select>
          </SettingRow>
        </div>
        <h3 className="mb-3 mt-6 text-sm font-semibold text-[color:var(--ds-ink)]">Introductory message templates</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-body)]" htmlFor="intro-new">New partner message. Use {'{first_name}'} and {'{company}'}.</label>
            <textarea id="intro-new" className={`${A.input} min-h-28`} value={d.intro_new} onChange={(e) => setD({ ...d, intro_new: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-body)]" htmlFor="intro-renewal">Renewal message. Use {'{first_name}'} and {'{company}'}.</label>
            <textarea id="intro-renewal" className={`${A.input} min-h-28`} value={d.intro_renewal} onChange={(e) => setD({ ...d, intro_renewal: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}
