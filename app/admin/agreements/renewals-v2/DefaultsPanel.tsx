'use client';

// Agreements (Beta) default settings. One simple form, label left, value right.

import { useEffect, useState } from 'react';

type Defaults = {
  due_days: number;
  billing_day: 'start' | 'first' | 'fifteenth';
  proposal_expiry_days: number | null;
  intro_new: string;
  intro_renewal: string;
};

const sel = 'w-full rounded-lg border border-[#D9D5E8] bg-white px-3 py-2.5 text-sm text-[#301D5D]';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-2 sm:items-center">
      <div>
        <div className="text-sm font-medium text-[#301D5D]">{label}</div>
        {hint && <div className="text-xs text-[#6B6878]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

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
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  if (!d) return <p className="text-sm text-[#6B6878]">{msg ?? 'Loading…'}</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-[#4A4757]">Default values for new agreements sent from this beta section.</p>
        <button onClick={save} disabled={saving} className="shrink-0 rounded-full bg-[#301D5D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#42277C] disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
      {msg && <div className="rounded-lg border border-[#D9D5E8] bg-[#F6F5FB] px-4 py-2 text-sm text-[#301D5D]">{msg}</div>}
      <div className="divide-y divide-[#F0EEF6] rounded-2xl border border-[#E6E5EC] bg-white px-5">
        <Row label="Number of days until payment is due" hint="Used on the draft billing schedule created at signing.">
          <select className={sel} value={d.due_days} onChange={(e) => setD({ ...d, due_days: Number(e.target.value) })}>
            {[0, 7, 15, 30, 45, 60].map((n) => <option key={n} value={n}>{n === 0 ? 'Upon receipt' : `${n} days`}</option>)}
          </select>
        </Row>
        <Row label="Billing day for monthly services" hint="Day of the month the draft schedule invoices on.">
          <select className={sel} value={d.billing_day} onChange={(e) => setD({ ...d, billing_day: e.target.value as Defaults['billing_day'] })}>
            <option value="start">Same day as the start date</option>
            <option value="first">1st of the month</option>
            <option value="fifteenth">15th of the month</option>
          </select>
        </Row>
        <Row label="Proposal expiration in days" hint="Shown for reference. Renewal rate holds are set per send.">
          <select className={sel} value={d.proposal_expiry_days ?? ''} onChange={(e) => setD({ ...d, proposal_expiry_days: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Proposals don&apos;t expire</option>
            {[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </Row>
        <div className="py-4">
          <div className="text-sm font-medium text-[#301D5D]">New partner message</div>
          <div className="mb-2 text-xs text-[#6B6878]">Use {'{first_name}'} and {'{company}'}.</div>
          <textarea className={`${sel} min-h-24`} value={d.intro_new} onChange={(e) => setD({ ...d, intro_new: e.target.value })} />
        </div>
        <div className="py-4">
          <div className="text-sm font-medium text-[#301D5D]">Renewal message</div>
          <div className="mb-2 text-xs text-[#6B6878]">Use {'{first_name}'} and {'{company}'}.</div>
          <textarea className={`${sel} min-h-24`} value={d.intro_renewal} onChange={(e) => setD({ ...d, intro_renewal: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
