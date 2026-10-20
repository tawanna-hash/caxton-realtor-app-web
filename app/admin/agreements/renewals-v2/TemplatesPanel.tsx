'use client';

// Agreements (Beta) templates: a simple list. A template pre-fills the ad size,
// frequency and monthly rate when you create a new agreement.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, EmptyState, SearchBox } from '@/components/anchor/ui';

export type Template = { id: string; name: string; ad_size: string | null; frequency: string | null; ad_rate_cents: number | null; updated_at: string };

const field = A.input;

type BuilderTemplate = { id: string; name: string; updated_at: string };

export default function TemplatesPanel() {
  const [builderTpls, setBuilderTpls] = useState<BuilderTemplate[]>([]);
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

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/builder', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive) setBuilderTpls((j.templates ?? []) as BuilderTemplate[]); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tick]);

  async function removeBuilder(t: BuilderTemplate) {
    if (!window.confirm(`Delete the template "${t.name}"?`)) return;
    await fetch('/api/admin/agreements-v2/builder', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: t.id }) });
    reload();
  }

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={q} onChange={setQ} label="Search templates" />
        <button onClick={() => setOpen((o) => !o)} className={A.primary}>Create template</button>
      </div>
      {msg && <div className={A.notice}>{msg}</div>}
      {open && (
        <div className={`${A.card} grid gap-3 p-4 sm:grid-cols-4`}>
          <input className={field} placeholder="Template name" aria-label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={field} placeholder="Ad size (1/4 page)" aria-label="Ad size" value={form.ad_size} onChange={(e) => setForm({ ...form, ad_size: e.target.value })} />
          <input className={field} placeholder="Frequency (3x)" aria-label="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
          <input className={field} placeholder="Monthly rate ($)" aria-label="Monthly rate" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          <div className="sm:col-span-4 flex gap-3">
            <button onClick={() => setOpen(false)} className={A.outline}>Cancel</button>
            <button onClick={create} className={A.primary}>Save template</button>
          </div>
        </div>
      )}
      <div>
        <h2 className="mb-1 text-base font-semibold text-[color:var(--ds-ink)]">Agreement templates</h2>
        <p className="mb-2 text-xs text-[color:var(--ds-body)]">Saved from the agreement builder with Save as template. They keep the services, message, note and reference fields.</p>
        {builderTpls.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())).length === 0 ? (
          <p className="text-sm text-[color:var(--ds-body)]">None yet. Open the builder and choose Save as template.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={A.table}>
              <thead><tr><th>Template name</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {builderTpls.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())).map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-[color:var(--ds-ink)]">{t.name}</td>
                    <td className="whitespace-nowrap text-[color:var(--ds-body)]">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="whitespace-nowrap text-right"><a href={`/admin/agreements/renewals-v2/new?template=${t.id}`} className={`${A.small} mr-2`}>Use template</a><button onClick={() => removeBuilder(t)} className={A.small}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h2 className="mb-1 mt-6 text-base font-semibold text-[color:var(--ds-ink)]">Quick templates</h2>
      </div>
      <div className="overflow-x-auto">
        <table className={A.table}>
          <thead><tr><th>Template name</th><th>Ad size</th><th>Frequency</th><th>Monthly rate</th><th /></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {rows !== null && list.length === 0 && <tr><td colSpan={5}><EmptyState title="No templates" body="Create a template to prefill new agreements." /></td></tr>}
            {list.map((t) => (
              <tr key={t.id}>
                <td className="font-medium text-[color:var(--ds-ink)]">{t.name}</td>
                <td className="text-[color:var(--ds-ink)]">{t.ad_size ?? '—'}</td>
                <td className="text-[color:var(--ds-ink)]">{t.frequency ?? '—'}</td>
                <td className="text-[color:var(--ds-ink)]">{t.ad_rate_cents == null ? '—' : `$${(t.ad_rate_cents / 100).toLocaleString('en-US')}`}</td>
                <td className="text-right"><button onClick={() => remove(t)} className={A.small}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
