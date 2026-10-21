'use client';

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';
import type { BusinessDetails } from '@/lib/server/business-settings';

const STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const SECTION = 'rounded-[14px] bg-white p-5 max-w-[640px]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs text-[color:var(--ds-body)]">{label}</span>{children}</label>;
}
function Head({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-4 border-b border-[color:var(--ds-line)] pb-3"><h2 className="text-lg font-medium text-[color:var(--ds-ink)]">{title}</h2>{sub && <p className="text-sm text-[color:var(--ds-body)]">{sub}</p>}</div>;
}

export default function BusinessDetailsForm() {
  const [d, setD] = useState<BusinessDetails | null>(null);
  const [saved, setSaved] = useState<BusinessDetails | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/admin/business-details', { cache: 'no-store' }).then((r) => r.json()).then((j) => { setD(j.details); setSaved(j.details); }).catch(() => setErr('Could not load business details.'));
  }, []);

  if (!d || !saved) return <div className="space-y-5"><h1 className={A.title}>Business details</h1>{err ? <p className={A.error}>{err}</p> : <p className={A.subtitle}>Loading…</p>}</div>;

  const set = <K extends keyof BusinessDetails>(k: K, v: BusinessDetails[K]) => setD({ ...d, [k]: v });
  async function save(section: string, keys: Array<keyof BusinessDetails>) {
    setBusy(section); setMsg(''); setErr('');
    const body: Record<string, unknown> = {};
    for (const k of keys) body[k] = d![k];
    const r = await fetch('/api/admin/business-details', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setErr(j.error || 'Save failed.'); return; }
    setSaved(j.details); setMsg('Changes saved.');
  }
  const dirty = (keys: Array<keyof BusinessDetails>) => keys.some((k) => JSON.stringify(d[k]) !== JSON.stringify(saved[k]));
  const detailKeys: Array<keyof BusinessDetails> = ['name', 'description', 'address', 'address2', 'city', 'state', 'postal'];
  const brandKeys: Array<keyof BusinessDetails> = ['logo', 'colors'];
  const billKeys: Array<keyof BusinessDetails> = ['group_identical_services', 'show_service_description', 'show_service_period', 'invoice_prefix'];

  function onLogo(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setErr('Logo must be a PNG or JPEG.'); return; }
    if (f.size > 2_000_000) { setErr('Logo must be under 2 MB.'); return; }
    const fr = new FileReader();
    fr.onload = () => { setErr(''); set('logo', String(fr.result)); };
    fr.readAsDataURL(f);
  }

  return (
    <div className="space-y-5">
      <h1 className={A.title}>Business details</h1>
      {msg && <p className={A.notice}>{msg}</p>}
      {err && <p className={A.error}>{err}</p>}

      <section className={SECTION}>
        <Head title="Details" />
        <div className="space-y-3">
          <Field label="Business name"><input className={A.input} value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Business description"><input className={A.input} value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Business address"><input className={A.input} value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <input className={A.input} placeholder="Address 2 (optional)" aria-label="Address 2" value={d.address2} onChange={(e) => set('address2', e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><input className={A.input} value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="State"><select className={A.input} value={d.state} onChange={(e) => set('state', e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Postal code"><input className={A.input} value={d.postal} onChange={(e) => set('postal', e.target.value)} /></Field>
          </div>
          <button className={A.primary} disabled={busy === 'details' || !dirty(detailKeys)} onClick={() => save('details', detailKeys)}>Save changes</button>
        </div>
      </section>

      <section className={SECTION}>
        <Head title="Brand settings" sub="Customize your agreements' appearance" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="flex h-24 w-40 items-center justify-center rounded-[10px] bg-[color:var(--ds-page)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.logo ? <img src={d.logo} alt="Business logo" className="max-h-20 max-w-36 object-contain" /> : <span className="text-xs text-[color:var(--ds-body)]">No logo</span>}
            </div>
            <label className={`${A.small} mt-2 cursor-pointer`}>Upload logo<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} /></label>
            {d.logo && <button className="ml-3 text-xs text-[color:var(--ds-body)] underline" onClick={() => set('logo', '')}>Remove</button>}
            <p className="mt-4 text-sm text-[color:var(--ds-body)]">Pick your brand colors</p>
            <div className="mt-2 flex gap-3">
              {d.colors.map((c, i) => (
                <label key={i} className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-[color:var(--ds-line)]" style={{ background: c }}>
                  <input type="color" aria-label={`Brand color ${i + 1}`} value={c} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => set('colors', d.colors.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-[10px] border border-dashed border-[color:var(--ds-line)] p-3" style={{ background: d.colors[1] }}>
            <div className="rounded-[8px] bg-white p-3">
              {d.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.logo} alt="" className="mb-2 h-6 object-contain" />}
              <div className="mb-2 h-0.5 w-16" style={{ background: d.colors[0] }} />
              {[0, 1, 2].map((i) => <div key={i} className="mb-1.5 flex justify-between rounded bg-[color:var(--ds-page)] px-2 py-1.5 text-[10px]"><span>Line item</span><span>$</span></div>)}
              <div className="mt-2 ml-auto h-4 w-16 rounded-full" style={{ background: d.colors[0] }} />
            </div>
          </div>
        </div>
        <button className={`${A.primary} mt-4`} disabled={busy === 'brand' || !dirty(brandKeys)} onClick={() => save('brand', brandKeys)}>Save changes</button>
      </section>

      <section className={SECTION}>
        <Head title="Tax information" sub="Used to issue tax forms for payouts received through the payment processor." />
        <p className="text-sm text-[color:var(--ds-body)]">Tax identity is collected and verified by Stripe when payouts are set up. It is not stored in this app.</p>
      </section>

      <section className={SECTION}>
        <Head title="Billing settings" />
        <div className="space-y-3">
          {([['group_identical_services', 'Group identical services into a single line item on invoices'], ['show_service_description', 'Show service description on invoice line items'], ['show_service_period', 'Show service period on invoice line items']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm text-[color:var(--ds-ink)]"><input type="checkbox" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>
          ))}
          <div className="w-48"><Field label="Invoices prefix"><input className={A.input} value={d.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} /></Field></div>
          <p className="text-xs text-[color:var(--ds-body)]">Saved for the Anchor-style billing flow. Invoices already created, and the existing invoice numbering, are not changed by these settings yet.</p>
          <button className={A.primary} disabled={busy === 'billing' || !dirty(billKeys)} onClick={() => save('billing', billKeys)}>Save changes</button>
        </div>
      </section>

      <section className={SECTION}>
        <Head title="Bank account information" sub="Payouts are deposited to the bank account connected in Stripe." />
        <a href="/admin/payouts-beta" className={A.primary}>View payouts</a>
      </section>
    </div>
  );
}
