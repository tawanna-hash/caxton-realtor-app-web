'use client';

// Agreements (Beta) templates: a simple list. A template pre-fills the ad size,
// frequency and monthly rate when you create a new agreement.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { A, RowMenu, EmptyState, SearchBox } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

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

  type Row = { id: string; kind: 'builder' | 'quick'; name: string; ad_size: string | null; frequency: string | null; ad_rate_cents: number | null; updated_at: string };
  const combined = useMemo<Row[]>(() => {
    const n = q.trim().toLowerCase();
    const all: Row[] = [
      ...builderTpls.map((t) => ({ id: t.id, kind: 'builder' as const, name: t.name, ad_size: null, frequency: null, ad_rate_cents: null, updated_at: t.updated_at })),
      ...(rows ?? []).map((t) => ({ id: t.id, kind: 'quick' as const, name: t.name, ad_size: t.ad_size, frequency: t.frequency, ad_rate_cents: t.ad_rate_cents, updated_at: t.updated_at })),
    ];
    return all.filter((t) => t.name.toLowerCase().includes(n));
  }, [rows, builderTpls, q]);

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
      <div className="overflow-x-auto">
        <SortTable rows={combined} cols={[{ label: 'Template name', get: (r) => r.name }, { label: 'Ad size', get: (r) => r.ad_size }, { label: 'Frequency', get: (r) => r.frequency }, { label: 'Monthly rate', get: (r) => r.ad_rate_cents }, { label: 'Last updated', get: (r) => r.updated_at }, { label: '' }]} className={`${A.table} min-w-[720px]`}>
          {(rws) => (<>
            {rows === null && <tr><td colSpan={6} className="text-center text-[color:var(--ds-body)]">Loading…</td></tr>}
            {rows !== null && combined.length === 0 && <tr><td colSpan={6}><EmptyState title="No templates" body="Create a template, or open the builder and choose Save as template." /></td></tr>}
            {rws.map((t) => (
              <tr key={`${t.kind}-${t.id}`}>
                <td className="font-medium text-[color:var(--ds-ink)]">{t.name}</td>
                <td className="text-[color:var(--ds-ink)]">{t.ad_size ?? '—'}</td>
                <td className="text-[color:var(--ds-ink)]">{t.frequency ?? '—'}</td>
                <td className="text-[color:var(--ds-ink)]">{t.ad_rate_cents == null ? '—' : `$${(t.ad_rate_cents / 100).toLocaleString('en-US')}`}</td>
                <td className="whitespace-nowrap text-[color:var(--ds-body)]">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="whitespace-nowrap text-right"><span className="inline-flex items-center gap-2">
                  {t.kind === 'builder' && <a href={`/admin/agreements/renewals-v2/new?template=${t.id}`} className={A.small}>Use template</a>}
                  <RowMenu items={[{ label: 'Delete template', danger: true, onClick: () => (t.kind === 'builder' ? removeBuilder(t) : remove(t as unknown as Template)) }]} />
                </span></td>
              </tr>
            ))}
          </>)}
        </SortTable>
      </div>
    </div>
  );
}
