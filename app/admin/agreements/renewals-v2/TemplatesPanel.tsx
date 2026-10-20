'use client';

// Agreements (Beta) templates: a simple list. A template pre-fills the ad size,
// frequency and monthly rate when you create a new agreement.

import { useCallback, useEffect, useMemo, useState } from 'react';

export type Template = { id: string; name: string; ad_size: string | null; frequency: string | null; ad_rate_cents: number | null; updated_at: string };

const field = 'rounded-lg border border-[#D9D5E8] bg-white px-3 py-2 text-sm text-[#301D5D]';

export default function TemplatesPanel() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', ad_size: '', frequency: '', rate: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/templates', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive) setRows((j.templates ?? []) as Template[]); })
      .catch(() => { if (alive) setMsg('Could not load templates.'); });
    return () => { alive = false; };
  }, [tick]);

  const list = useMemo(() => (rows ?? []).filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  async function create() {
    setMsg(null);
    const rate = form.rate.trim() ? Math.round(parseFloat(form.rate) * 100) : null;
    if (!form.name.trim()) return setMsg('Give the template a name.');
    if (rate !== null && !(rate > 0)) return setMsg('Enter a valid monthly rate.');
    const res = await fetch('/api/admin/agreements-v2/templates', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: form.name, ad_size: form.ad_size, frequency: form.frequency, ad_rate_cents: rate }) });
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error ?? 'Could not save.');
    setForm({ name: '', ad_size: '', frequency: '', rate: '' });
    setOpen(false);
    reload();
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete the template "${t.name}"?`)) return;
    await fetch(`/api/admin/agreements-v2/templates/${t.id}`, { method: 'DELETE', credentials: 'include' });
    reload();
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search templates" className={`${field} w-56 rounded-full`} />
        <button onClick={() => setOpen((o) => !o)} className="rounded-full bg-[#301D5D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#42277C]">Create template</button>
      </div>
      {msg && <div className="rounded-lg border border-[#D9D5E8] bg-[#F6F5FB] px-4 py-2 text-sm text-[#301D5D]">{msg}</div>}
      {open && (
        <div className="grid gap-3 rounded-2xl border border-[#E6E5EC] bg-white p-4 sm:grid-cols-4">
          <input className={field} placeholder="Template name" aria-label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={field} placeholder="Ad size (1/4 page)" aria-label="Ad size" value={form.ad_size} onChange={(e) => setForm({ ...form, ad_size: e.target.value })} />
          <input className={field} placeholder="Frequency (3x)" aria-label="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          <input className={field} placeholder="Monthly rate ($)" aria-label="Monthly rate" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          <div className="sm:col-span-4"><button onClick={create} className="rounded-full bg-[#301D5D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#42277C]">Save template</button></div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-[#E6E5EC] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F6F5FB] text-xs text-[#6B6878]"><tr><th className="px-3 py-2 font-medium">Template name</th><th className="px-3 py-2 font-medium">Ad size</th><th className="px-3 py-2 font-medium">Frequency</th><th className="px-3 py-2 font-medium">Monthly rate</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-[#F0EEF6]">
            {rows === null && <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6B6878]">Loading…</td></tr>}
            {rows !== null && list.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-[#6B6878]">No templates yet.</td></tr>}
            {list.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-3 font-medium text-[#1B1726]">{t.name}</td>
                <td className="px-3 py-3 text-[#4A4757]">{t.ad_size ?? '—'}</td>
                <td className="px-3 py-3 text-[#4A4757]">{t.frequency ?? '—'}</td>
                <td className="px-3 py-3 text-[#4A4757]">{t.ad_rate_cents == null ? '—' : `$${(t.ad_rate_cents / 100).toLocaleString('en-US')}`}</td>
                <td className="px-3 py-3 text-right"><button onClick={() => remove(t)} className="rounded-full border border-[#D9D5E8] px-3 py-1 text-xs font-medium text-[#301D5D] hover:bg-[#F6F5FB]">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
