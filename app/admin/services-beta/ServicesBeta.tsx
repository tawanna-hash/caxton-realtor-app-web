'use client';

// Services (Beta), matched to Anchor's Services page: title with count,
// Import services / Export CSV / New service, search, sortable list
// (Service name, Rate, Billing occurrence, Billing trigger), bulk actions,
// per-row menu, and a full-screen Create / Edit Service form.

import { useMemo, useRef, useState } from 'react';
import { A, EmptyState, RowMenu, SearchBox } from '@/components/anchor/ui';
import { SortTh } from '../agreements/clients/StatusFilter';
import { useJson } from '../agreements/clients/data';
import { SERVICE_OCCURRENCE_LABELS, SERVICE_PRICING_LABELS, type ProductService, type ServiceOccurrence, type ServicePricing } from '@/lib/products-services';

const none = [] as ProductService[];
const usd = (c: number | null | undefined) => (c == null ? '' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`);
function rate(p: ProductService) {
  if (p.price_cents == null) return '—';
  if (p.pricing_type === 'range') return `${usd(p.price_cents)} – ${usd(p.price_max_cents ?? p.price_cents)}`;
  return `${usd(p.price_cents)}${p.pricing_type === 'hourly' ? ' / hour' : p.pricing_type === 'unit' ? ' / unit' : ''}`;
}
const trigger = (p: ProductService) => (p.billing_trigger === 'automatic' ? 'Automatic' : 'Manual');
const OCC = Object.entries(SERVICE_OCCURRENCE_LABELS) as Array<[ServiceOccurrence, string]>;
const PRC = Object.entries(SERVICE_PRICING_LABELS) as Array<[ServicePricing, string]>;

type Draft = {
  id?: string; name: string; sales_description: string; service_terms: string; billing_occurrence: ServiceOccurrence; pricing_type: ServicePricing;
  price: string; price_max: string; discount: string; discount_unit: 'percent' | 'amount'; billing_trigger: 'automatic' | 'manual'; reference_fields: string[];
  category: string; market: string; is_active: boolean; bundle_items: string[];
};
const blank: Draft = { name: '', sales_description: '', service_terms: '', billing_occurrence: 'one_time', pricing_type: 'fixed', price: '', price_max: '', discount: '', discount_unit: 'percent', billing_trigger: 'automatic', reference_fields: [], category: '', market: '', is_active: true, bundle_items: [] };
const toDraft = (p: ProductService): Draft => ({ id: p.id, name: p.name, sales_description: p.sales_description ?? '', service_terms: p.service_terms ?? '', billing_occurrence: p.billing_occurrence, pricing_type: p.pricing_type, price: p.price_cents == null ? '' : (p.price_cents / 100).toString(), price_max: p.price_max_cents == null ? '' : (p.price_max_cents / 100).toString(), discount: p.discount_value == null ? '' : String(p.discount_value), discount_unit: p.discount_unit, billing_trigger: p.billing_trigger, reference_fields: p.reference_fields ?? [], category: p.category ?? '', market: p.market ?? '', is_active: p.is_active, bundle_items: p.bundle_items ?? [] });
const cents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));
const bodyOf = (d: Draft) => ({ name: d.name.trim(), sales_description: d.sales_description || null, service_terms: d.service_terms || null, billing_occurrence: d.billing_occurrence, pricing_type: d.pricing_type, price_cents: cents(d.price), price_max_cents: d.pricing_type === 'range' ? cents(d.price_max) : null, discount_value: d.discount.trim() === '' ? null : Number(d.discount), discount_unit: d.discount_unit, billing_trigger: d.billing_trigger, reference_fields: d.reference_fields.filter(Boolean), category: d.category || null, market: d.market || null, is_active: d.is_active, bundle_items: d.bundle_items });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="relative block">
      <span className="absolute -top-2 left-5 z-10 bg-white px-1 text-[11px] text-[color:var(--ds-body)]">{label}</span>
      {children}
    </label>
  );
}
const ctl = 'w-full rounded-full border border-[color:var(--ds-ink)]/60 bg-transparent px-5 py-3 text-sm text-[color:var(--ds-ink)] focus:border-[color:var(--ds-primary)] focus:outline-none';

function ServiceForm({ initial, onCancel, onSaved, bundle, services }: { initial: Draft; onCancel: () => void; onSaved: (msg: string) => void; bundle: boolean; services: ProductService[] }) {
  const noun = bundle ? 'Bundle' : 'Service';
  const [picker, setPicker] = useState(false); const [pq, setPq] = useState(''); const [pick, setPick] = useState<string[]>([]);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!d.name.trim()) { setErr(`${noun} name is required.`); return; }
    setBusy(true); setErr(null);
    const r = await fetch(d.id ? `/api/admin/products-services/${d.id}` : '/api/admin/products-services', { method: d.id ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...bodyOf(d), item_type: bundle ? 'bundle' : 'service' }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? `Could not save the ${noun.toLowerCase()}.`); return; }
    onSaved(d.id ? `${noun} saved.` : `${noun} created.`);
  }
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white" role="dialog" aria-label={`${d.id ? 'Edit' : 'Create'} ${noun}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--ds-line)] bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Close" onClick={onCancel} style={{ border: 0, background: 'transparent' }} className="text-xl text-[color:var(--ds-ink)]">×</button>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">{d.id ? 'Edit' : 'Create'} {noun}</h2>
        </div>
        <div className="flex gap-2"><button type="button" className={A.outline} onClick={onCancel}>Cancel</button><button type="button" className={A.primary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
      {err && <div className={`${A.error} mx-5 mt-4`}>{err}</div>}
      <div className="grid gap-8 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Field label={`${noun} name`}><input className={ctl} value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <div><div className="mb-1 text-xs text-[color:var(--ds-body)]">{noun} description</div><textarea rows={8} className="w-full border border-[color:var(--ds-line)] p-3 text-sm" placeholder="Describe service (Optional)" value={d.sales_description} onChange={(e) => set('sales_description', e.target.value)} /></div>
          {!bundle && <div><div className="mb-1 text-xs text-[color:var(--ds-body)]">Service terms</div><textarea rows={8} className="w-full border border-[color:var(--ds-line)] p-3 text-sm" placeholder="Write here..." value={d.service_terms} onChange={(e) => set('service_terms', e.target.value)} /></div>}
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing occurrence"><select className={ctl} value={d.billing_occurrence} onChange={(e) => set('billing_occurrence', e.target.value as ServiceOccurrence)}>{OCC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Pricing"><select className={ctl} value={d.pricing_type} onChange={(e) => set('pricing_type', e.target.value as ServicePricing)}>{PRC.filter(([v]) => !bundle || v !== 'range').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={d.pricing_type === 'range' ? 'Price from' : 'Price'}><input inputMode="decimal" className={ctl} placeholder="$" value={d.price} onChange={(e) => set('price', e.target.value)} /></Field>
            {d.pricing_type === 'range'
              ? <Field label="Price to"><input inputMode="decimal" className={ctl} placeholder="$" value={d.price_max} onChange={(e) => set('price_max', e.target.value)} /></Field>
              : <Field label="Discount"><span className="flex gap-2"><input inputMode="decimal" className={ctl} value={d.discount} onChange={(e) => set('discount', e.target.value)} /><select aria-label="Discount unit" className={`${ctl} w-[84px]`} value={d.discount_unit} onChange={(e) => set('discount_unit', e.target.value as 'percent' | 'amount')}><option value="percent">%</option><option value="amount">$</option></select></span></Field>}
          </div>
          <Field label="Billing trigger">
            <select className={ctl} value={d.billing_trigger} onChange={(e) => set('billing_trigger', e.target.value as 'automatic' | 'manual')}>
              <option value="automatic">Automatic, on agreement acceptance</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <p className="text-xs text-[color:var(--ds-body)]">{d.billing_trigger === 'automatic' ? 'The service will be charged on agreement acceptance without requiring action.' : 'You will be required to trigger the invoice.'}</p>
          {bundle && (
            <div className="relative">
              <div className="mb-2 text-sm font-semibold text-[color:var(--ds-ink)]">Included services</div>
              {d.bundle_items.map((id) => { const sv = services.find((x) => x.id === id); return (
                <div key={id} className="mb-2 flex items-center justify-between gap-2 rounded-full border border-[color:var(--ds-line)] px-4 py-2 text-sm"><span>{sv ? `${sv.name} · ${sv.price_cents != null ? `$${(sv.price_cents / 100).toLocaleString('en-US')}` : '—'}` : 'Removed service'}</span><button type="button" aria-label="Remove" onClick={() => set('bundle_items', d.bundle_items.filter((x) => x !== id))} style={{ border: 0, background: 'transparent' }}>×</button></div>
              ); })}
              <button type="button" onClick={() => { setPick(d.bundle_items); setPicker(true); }} style={{ border: 0, background: 'transparent' }} className="text-sm text-[color:var(--ds-primary)]">＋ Add services</button>
              {picker && (
                <div role="dialog" aria-label="Add services" className="absolute left-0 z-20 mt-2 w-full rounded-[14px] border border-[color:var(--ds-line)] bg-white p-4 shadow-lg">
                  <div className="mb-2 flex items-center justify-between text-sm text-[color:var(--ds-body)]">Add services<button type="button" aria-label="Close" onClick={() => setPicker(false)} style={{ border: 0, background: 'transparent' }}>×</button></div>
                  <input aria-label="Search services" placeholder="Search services" className={`${ctl} mb-2`} value={pq} onChange={(e) => setPq(e.target.value)} />
                  <div className="max-h-64 overflow-y-auto">
                    {services.filter((x) => x.item_type !== 'bundle' && x.name.toLowerCase().includes(pq.toLowerCase())).map((x) => (
                      <label key={x.id} className="flex items-start gap-3 py-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[color:var(--ds-primary)]" checked={pick.includes(x.id)} onChange={() => setPick((c) => (c.includes(x.id) ? c.filter((y) => y !== x.id) : [...c, x.id]))} /><span><span className="block text-[color:var(--ds-ink)]">{x.name}</span><span className="text-xs text-[color:var(--ds-body)]">{rate(x)}</span></span></label>
                    ))}
                  </div>
                  <button type="button" className={`${A.primary} mt-3 w-full`} onClick={() => { set('bundle_items', pick); setPicker(false); }}>Apply</button>
                </div>
              )}
            </div>
          )}
          <div className="border-t border-[color:var(--ds-line)] pt-4">
            <div className="mb-2 text-sm font-semibold text-[color:var(--ds-ink)]">Reference fields</div>
            {d.reference_fields.map((f, i) => (
              <div key={i} className="mb-2 flex gap-2"><input aria-label={`Reference field ${i + 1}`} className={ctl} value={f} onChange={(e) => set('reference_fields', d.reference_fields.map((x, j) => (j === i ? e.target.value : x)))} /><button type="button" className={A.small} onClick={() => set('reference_fields', d.reference_fields.filter((_, j) => j !== i))}>Remove</button></div>
            ))}
            <button type="button" onClick={() => set('reference_fields', [...d.reference_fields, ''])} style={{ border: 0, background: 'transparent' }} className="text-sm text-[color:var(--ds-primary)]">⊕ Add reference field</button>
          </div>
          {!bundle && <div className="space-y-3 border-t border-[color:var(--ds-line)] pt-4">
            <div className="text-sm font-semibold text-[color:var(--ds-ink)]">Catalog details</div>
            <Field label="Category"><input className={ctl} value={d.category} onChange={(e) => set('category', e.target.value)} /></Field>
            <Field label="Market"><select className={ctl} value={d.market} onChange={(e) => set('market', e.target.value)}><option value="">All markets</option><option value="austin">Austin</option><option value="san_antonio">San Antonio</option><option value="both">Austin and San Antonio</option></select></Field>
            <label className="flex items-center gap-2 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" checked={d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-[color:var(--ds-primary)]" /> Active</label>
          </div>}
        </div>
      </div>
    </div>
  );
}

export default function ServicesBeta({ mode = 'service' }: { mode?: 'service' | 'bundle' }) {
  const isBundle = mode === 'bundle';
  const noun = isBundle ? 'Bundle' : 'Service';
  const [version, setVersion] = useState(0);
  const list = useJson(`/api/admin/products-services?v=${version}`, (j) => (j.products ?? []) as ProductService[], none);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: 'name' | 'rate' | 'occ' | 'trig'; dir: 1 | -1 }>({ k: 'name', dir: 1 });
  const [sel, setSel] = useState<string[]>([]);
  const [form, setForm] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = list.data.filter((p) => (isBundle ? p.item_type === 'bundle' : p.item_type !== 'bundle') && (!n || p.name.toLowerCase().includes(n)));
    const key = (p: ProductService): string | number => sort.k === 'name' ? p.name.toLowerCase() : sort.k === 'rate' ? (p.price_cents ?? -1) : sort.k === 'occ' ? SERVICE_OCCURRENCE_LABELS[p.billing_occurrence] ?? '' : trigger(p);
    return out.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sort.dir);
  }, [list.data, q, sort, isBundle]);
  const th = (k: typeof sort.k, label: string) => <SortTh label={label} dir={sort.k === k ? (sort.dir === 1 ? 'asc' : 'desc') : undefined} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} />;
  const chosen = rows.filter((r) => sel.includes(r.id));
  const allSel = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const refresh = (msg: string) => { setNotice(msg); setForm(null); setSel([]); setVersion((v) => v + 1); };

  function exportCsv(items: ProductService[]) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Service name', 'Description', 'Billing occurrence', 'Pricing', 'Price', 'Price to', 'Discount', 'Discount unit', 'Billing trigger'];
    const lines = [head.map(esc).join(',')].concat(items.map((p) => [p.name, p.sales_description, SERVICE_OCCURRENCE_LABELS[p.billing_occurrence], SERVICE_PRICING_LABELS[p.pricing_type], p.price_cents != null ? p.price_cents / 100 : '', p.price_max_cents != null ? p.price_max_cents / 100 : '', p.discount_value ?? '', p.discount_unit === 'amount' ? '$' : '%', trigger(p)].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = isBundle ? 'bundles.csv' : 'services.csv'; a.click(); URL.revokeObjectURL(url);
  }
  function parseCsv(t: string) {
    const rowsOut: string[][] = []; let cur: string[] = [], f = '', qd = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (qd) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') qd = false; else f += c; }
      else if (c === '"') qd = true; else if (c === ',') { cur.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; cur.push(f); f = ''; if (cur.some((x) => x.trim())) rowsOut.push(cur); cur = []; }
      else f += c;
    }
    cur.push(f); if (cur.some((x) => x.trim())) rowsOut.push(cur);
    return rowsOut;
  }
  async function importCsv(f: File) {
    const data = parseCsv(await f.text()); const head = (data.shift() ?? []).map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const iN = col(['service name', 'name']), iD = col(['description']), iO = col(['billing occurrence']), iP = col(['pricing']), iPr = col(['price', 'rate']), iT = col(['billing trigger']);
    if (iN < 0) { setNotice('The file needs a "Service name" column.'); return; }
    const occ = (v: string) => OCC.find(([, l]) => l.toLowerCase() === v.trim().toLowerCase())?.[0] ?? 'one_time';
    const prc = (v: string) => PRC.find(([, l]) => l.toLowerCase() === v.trim().toLowerCase())?.[0] ?? 'fixed';
    let ok = 0, fail = 0;
    for (const r of data) {
      const name = (r[iN] ?? '').trim(); if (!name) continue;
      const price = iPr >= 0 ? Number((r[iPr] ?? '').replace(/[^0-9.]/g, '')) : NaN;
      const res = await fetch('/api/admin/products-services', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_type: isBundle ? 'bundle' : 'service', name, sales_description: iD >= 0 ? r[iD] || null : null, billing_occurrence: iO >= 0 ? occ(r[iO] ?? '') : 'one_time', pricing_type: iP >= 0 ? prc(r[iP] ?? '') : 'fixed', price_cents: Number.isFinite(price) ? Math.round(price * 100) : null, billing_trigger: iT >= 0 && /auto/i.test(r[iT] ?? '') ? 'automatic' : 'manual' }) });
      if (res.ok) ok++; else fail++;
    }
    refresh(`Imported ${ok} service${ok === 1 ? '' : 's'}${fail ? `; ${fail} skipped (already exist or invalid)` : ''}.`);
  }
  async function remove(items: ProductService[]) {
    if (!window.confirm(`Delete ${items.length} service${items.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const res = await Promise.all(items.map((p) => fetch(`/api/admin/products-services/${p.id}`, { method: 'DELETE', credentials: 'include' })));
    refresh(res.every((r) => r.ok) ? 'Deleted.' : 'Some services could not be deleted.');
  }
  async function duplicate(p: ProductService) {
    const d = toDraft(p); const r = await fetch('/api/admin/products-services', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...bodyOf({ ...d, name: `${p.name} (copy)` }), item_type: isBundle ? 'bundle' : 'service' }) });
    refresh(r.ok ? 'Duplicated.' : 'Could not duplicate the service.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={A.title}>{isBundle ? 'Bundles' : 'Services'} ({rows.length})</h1>
          <p className={`${A.subtitle} mt-1 max-w-xl`}>{isBundle ? 'Group multiple services into a single-priced bundle to offer clients in agreements.' : 'Create and manage the services you provide to clients. You may customize the services per client when generating each new agreement.'}</p>
        </div>
        <div className="flex gap-3">
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
          <button type="button" className={A.outline} onClick={() => file.current?.click()}>Import {isBundle ? 'bundles' : 'services'}</button>
          <button type="button" className={A.outline} onClick={() => exportCsv(rows)}>Export CSV</button>
          <button type="button" className={A.primary} onClick={() => setForm(blank)}>＋ {isBundle ? 'Create Bundle' : 'New service'}</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} label="Search services" />
        <div className="ml-auto">
          <RowMenu label="Bulk actions" items={[{ label: `Export selected (${chosen.length})`, disabled: chosen.length === 0, onClick: () => exportCsv(chosen) }, { label: `Delete selected (${chosen.length})`, danger: true, disabled: chosen.length === 0, onClick: () => remove(chosen) }]} />
        </div>
      </div>
      {notice && <div className={A.notice}>{notice}</div>}
      <div className="overflow-x-auto">
        <table className={`${A.table} min-w-[760px]`}>
          <thead><tr>
            <th className="w-10"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : rows.map((r) => r.id))} className="h-4 w-4 accent-[color:var(--ds-primary)]" /></th>
            {th('name', 'Service name')}{th('rate', 'Rate')}{isBundle && <th className="text-xs font-medium text-[color:var(--ds-body)]">Services</th>}{th('occ', 'Billing occurrence')}{th('trig', 'Billing trigger')}<th />
          </tr></thead>
          <tbody>
            {!list.loading && rows.length === 0 && <tr><td colSpan={isBundle ? 7 : 6}><EmptyState title={isBundle ? 'Elevate your offering with bundles' : 'No services'} body={isBundle ? 'Group multiple services into a single-priced bundle.' : 'Create your first service to use it in agreements and agreements.'} action={{ label: isBundle ? 'Create Bundle' : 'New service', onClick: () => setForm(blank) }} /></td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.includes(p.id)} onChange={() => setSel((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} className="h-4 w-4 accent-[color:var(--ds-primary)]" /></td>
                <td><button type="button" onClick={() => setForm(toDraft(p))} style={{ border: 0, background: 'transparent', padding: 0 }} className="text-left font-semibold text-[color:var(--ds-ink)]">{p.name}{p.is_active ? '' : ' (inactive)'}</button></td>
                <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{rate(p)}</td>
                {isBundle && <td className="text-[color:var(--ds-ink)]">{(p.bundle_items ?? []).length}</td>}
                <td className="text-[color:var(--ds-ink)]">{SERVICE_OCCURRENCE_LABELS[p.billing_occurrence] ?? '—'}</td>
                <td className="text-[color:var(--ds-ink)]">{trigger(p)}</td>
                <td className="text-right"><RowMenu items={[{ label: `Edit ${noun.toLowerCase()}`, onClick: () => setForm(toDraft(p)) }, { label: `Duplicate ${noun.toLowerCase()}`, onClick: () => duplicate(p) }, { label: `Delete ${noun.toLowerCase()}`, danger: true, onClick: () => remove([p]) }]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && <ServiceForm initial={form} onCancel={() => setForm(null)} onSaved={refresh} bundle={isBundle} services={list.data} />}
    </div>
  );
}
