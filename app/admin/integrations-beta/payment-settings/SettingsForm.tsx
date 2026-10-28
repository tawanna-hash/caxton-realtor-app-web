'use client';

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';
import type { PaymentSettings } from '@/lib/server/payment-settings';

type Form = {
  card_percent: string; ach_percent: string; ach_cap: string; bnpl_percent: string; bnpl_fixed: string;
  c: PaymentSettings['checkout'];
};

const toForm = (s: PaymentSettings): Form => ({
  card_percent: String(s.fees.card.percent),
  ach_percent: String(s.fees.ach.percent),
  ach_cap: (s.fees.ach.cap_cents / 100).toFixed(2),
  bnpl_percent: String(s.fees.bnpl.percent),
  bnpl_fixed: (s.fees.bnpl.fixed_cents / 100).toFixed(2),
  c: s.checkout,
});

export default function SettingsForm() {
  const [f, setF] = useState<Form | null>(null);
  const [defaults, setDefaults] = useState<PaymentSettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/payment-settings')
      .then((r) => r.json())
      .then((d: { settings?: PaymentSettings; defaults?: PaymentSettings; error?: string }) => {
        if (d.settings) { setF(toForm(d.settings)); setDefaults(d.defaults ?? null); }
        else setMsg({ ok: false, text: d.error ?? 'Could not load settings.' });
      })
      .catch(() => setMsg({ ok: false, text: 'Could not load settings.' }));
  }, []);

  if (!f) return <div className="p-6 text-sm">{msg ? msg.text : 'Loading'}</div>;

  const setC = <K extends keyof Form['c']>(k: K, v: Form['c'][K]) => setF({ ...f, c: { ...f.c, [k]: v } });

  async function save() {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    const payload = {
      fees: {
        card: { percent: Number(f.card_percent) },
        ach: { percent: Number(f.ach_percent), cap_cents: Math.round(Number(f.ach_cap) * 100) },
        bnpl: { percent: Number(f.bnpl_percent), fixed_cents: Math.round(Number(f.bnpl_fixed) * 100) },
      },
      checkout: f.c,
    };
    try {
      const r = await fetch('/api/admin/payment-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = (await r.json()) as { settings?: PaymentSettings; error?: string };
      if (d.settings) { setF(toForm(d.settings)); setMsg({ ok: true, text: 'Saved. New checkouts use these settings.' }); }
      else setMsg({ ok: false, text: d.error ?? 'Save failed.' });
    } finally { setBusy(false); }
  }

  const num = ({ label, k, hint }: { label: string; k: 'card_percent' | 'ach_percent' | 'ach_cap' | 'bnpl_percent' | 'bnpl_fixed'; hint?: string }) => (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input className={A.input} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-[color:var(--ds-body)]">{hint}</p>}
    </div>
  );
  const check = ({ label, k }: { label: string; k: 'collect_phone' | 'collect_names' | 'require_terms' | 'allow_promotion_codes' | 'automatic_tax' | 'save_payment_method' }) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={f.c[k]} onChange={(e) => setC(k, e.target.checked)} /> {label}
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className={A.title}>Payment settings</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">
          Processing fees and Stripe Checkout options. Changes apply to new checkouts, invoices, statements and agreement quotes. Update the agreement terms (section 9) separately if you change fees.
        </p>
      </div>
      {msg && <div className={msg.ok ? A.notice : A.error}>{msg.text}</div>}

      <section className="space-y-3 rounded-[10px] bg-white p-4">
        <h2 className="text-base font-semibold">Processing fees</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {num({ label: 'Card fee (%)', k: 'card_percent' })}
          <div />
          {num({ label: 'ACH fee (%)', k: 'ach_percent' })}
          {num({ label: 'ACH fee cap ($)', k: 'ach_cap', hint: 'The ACH fee is the lesser of the percentage and this cap.' })}
          {num({ label: 'Buy now pay later fee (%)', k: 'bnpl_percent' })}
          {num({ label: 'Buy now pay later fixed fee ($)', k: 'bnpl_fixed' })}
        </div>
        {defaults && <p className="text-xs text-[color:var(--ds-body)]">Defaults: card {defaults.fees.card.percent}%, ACH {defaults.fees.ach.percent}% capped at ${(defaults.fees.ach.cap_cents / 100).toFixed(2)}, buy now pay later {defaults.fees.bnpl.percent}% + ${(defaults.fees.bnpl.fixed_cents / 100).toFixed(2)}.</p>}
      </section>

      <section className="space-y-3 rounded-[10px] bg-white p-4">
        <h2 className="text-base font-semibold">Stripe Checkout</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {check({ label: 'Collect phone number', k: 'collect_phone' })}
          {check({ label: 'Collect customer and business name', k: 'collect_names' })}
          {check({ label: 'Require terms of service', k: 'require_terms' })}
          {check({ label: 'Allow promotion codes', k: 'allow_promotion_codes' })}
          {check({ label: 'Automatic tax', k: 'automatic_tax' })}
          {check({ label: 'Save payment method for next time', k: 'save_payment_method' })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Billing address</label>
            <select className={A.input} value={f.c.billing_address_collection} onChange={(e) => setC('billing_address_collection', e.target.value as Form['c']['billing_address_collection'])}>
              <option value="auto">Only when needed</option>
              <option value="required">Always collect</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Button text</label>
            <select className={A.input} value={f.c.submit_type} onChange={(e) => setC('submit_type', e.target.value as Form['c']['submit_type'])}>
              <option value="auto">Pay (default)</option>
              <option value="pay">Pay</option>
              <option value="book">Book</option>
              <option value="donate">Donate</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-[10px] bg-white p-4">
        <h2 className="text-base font-semibold">Branding</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Button color</label>
            <input className={A.input} value={f.c.button_color} onChange={(e) => setC('button_color', e.target.value)} placeholder="#6205ad" />
          </div>
          <div>
            <label className="block text-sm font-medium">Background color</label>
            <input className={A.input} value={f.c.background_color} onChange={(e) => setC('background_color', e.target.value)} placeholder="#ffffff" />
          </div>
          <div>
            <label className="block text-sm font-medium">Font</label>
            <select className={A.input} value={f.c.font_family} onChange={(e) => setC('font_family', e.target.value as Form['c']['font_family'])}>
              <option value="inter">Inter</option>
              <option value="default">Stripe default</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Corners</label>
            <select className={A.input} value={f.c.border_style} onChange={(e) => setC('border_style', e.target.value as Form['c']['border_style'])}>
              <option value="rounded">Rounded</option>
              <option value="rectangular">Square</option>
              <option value="pill">Pill</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">Logo file ID</label>
            <input className={A.input} value={f.c.logo_file_id} onChange={(e) => setC('logo_file_id', e.target.value)} placeholder="file_..." />
            <p className="mt-1 text-xs text-[color:var(--ds-body)]">A Stripe file ID. Leave blank to use the logo from Stripe branding settings.</p>
          </div>
        </div>
      </section>

      <button className={A.primary} disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save settings'}</button>
    </div>
  );
}
