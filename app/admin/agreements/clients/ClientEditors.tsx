'use client';

import { useState } from 'react';
import { A } from '@/components/anchor/ui';
import type { Adv } from './data';

// Edits go straight to the advertiser record, the same record Partners reads,
// so a change here shows in Partners with nothing to sync.
async function patch(id: number, body: Record<string, unknown>) {
  const r = await fetch(`/api/admin/advertisers/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Could not save (HTTP ${r.status})`);
  window.dispatchEvent(new Event('focus')); // reloads the client lists
}

function Modal({ title, onClose, onSave, saving, error, children, saveLabel = 'Save' }: { title: string; onClose: () => void; onSave: () => void; saving: boolean; error: string | null; children: React.ReactNode; saveLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[14px] bg-white sm:rounded-[14px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4"><h3 className="text-lg font-semibold text-[color:var(--ds-ink)]">{title}</h3><button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent' }} className="text-2xl leading-none text-[color:var(--ds-body)]">×</button></div>
        <div className="space-y-3 overflow-y-auto px-5 pb-4">{error && <div className={A.error}>{error}</div>}{children}</div>
        <div className="flex justify-end gap-2 border-t border-[color:var(--ds-line)] px-5 py-3"><button type="button" className={A.outline} onClick={onClose}>Cancel</button><button type="button" className={A.primary} disabled={saving} onClick={onSave}>{saving ? 'Saving…' : saveLabel}</button></div>
      </div>
    </div>
  );
}
const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <label className="block text-xs text-[color:var(--ds-body)]">{label}<input type={type} className={`${A.input} mt-1`} value={value} onChange={(e) => onChange(e.target.value)} /></label>
);

export function EditClientModal({ client, onClose }: { client: Adv; onClose: () => void }) {
  const [f, setF] = useState({
    company: client.company || client.name || '', type: client.type === 'individual' ? 'individual' : 'business',
    status: client.status === 'prospect' ? 'prospect' : client.status === 'archived' || client.status === 'inactive' ? 'archived' : 'advertiser',
    first_name: client.first_name ?? '', last_name: client.last_name ?? '', contact_email: client.contact_email ?? '', phone: client.phone ?? '',
    address: client.address ?? '', address_2: client.address_2 ?? '', city: client.city ?? '', state: client.state ?? '', zip: client.zip ?? '',
  });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.company.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError(null);
    try {
      // `type` on the record is the Partners category; only status and the details change here.
      const { type: _t, ...rest } = f; void _t;
      await patch(client.id, rest); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); setSaving(false); }
  };
  return (
    <Modal title="Edit client" onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Client name" value={f.company} onChange={set('company')} />
      <label className="block text-xs text-[color:var(--ds-body)]">Status<select className={`${A.input} mt-1 appearance-none`} value={f.status} onChange={(e) => set('status')(e.target.value)}><option value="advertiser">Active</option><option value="prospect">Prospect</option><option value="archived">Archived</option></select></label>
      <p className="pt-1 text-xs font-medium text-[color:var(--ds-ink)]">Main contact</p>
      <div className="grid grid-cols-2 gap-3"><Field label="First name" value={f.first_name} onChange={set('first_name')} /><Field label="Last name" value={f.last_name} onChange={set('last_name')} /></div>
      <Field label="Email" type="email" value={f.contact_email} onChange={set('contact_email')} />
      <Field label="Phone" value={f.phone} onChange={set('phone')} />
      <p className="pt-1 text-xs font-medium text-[color:var(--ds-ink)]">Address</p>
      <Field label="Address" value={f.address} onChange={set('address')} />
      <Field label="Address line 2" value={f.address_2} onChange={set('address_2')} />
      <div className="grid grid-cols-3 gap-3"><Field label="City" value={f.city} onChange={set('city')} /><Field label="State" value={f.state} onChange={set('state')} /><Field label="ZIP" value={f.zip} onChange={set('zip')} /></div>
    </Modal>
  );
}

export type ContactTarget =
  | { kind: 'new' }
  | { kind: 'main' }
  | { kind: 'billing' }
  | { kind: 'extra'; index: number };

// Which stored slot a displayed contact lives in, matched by email then name.
export function targetFor(a: Adv, c: { name: string; email: string | null }): ContactTarget {
  const same = (n?: string | null, e?: string | null) => (c.email && e ? c.email.toLowerCase() === e.toLowerCase() : (n ?? '').toLowerCase() === c.name.toLowerCase());
  const main = [a.first_name, a.last_name].filter(Boolean).join(' ');
  if (same(main, a.contact_email)) return { kind: 'main' };
  if (a.billing_contact_name && same(a.billing_contact_name, a.billing_email)) return { kind: 'billing' };
  const i = (a.additional_contacts ?? []).findIndex((x) => same(x.name, x.email));
  return i >= 0 ? { kind: 'extra', index: i } : { kind: 'new' };
}

export function ContactModal({ client, target, current, onClose }: { client: Adv; target: ContactTarget; current?: { name: string; email: string | null; phone: string | null }; onClose: () => void }) {
  const [name, setName] = useState(current?.name ?? ''); const [email, setEmail] = useState(current?.email ?? ''); const [phone, setPhone] = useState(current?.phone ?? '');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const extras = client.additional_contacts ?? [];
  const run = async (remove = false) => {
    if (!remove && !name.trim() && !email.trim()) { setError('Enter a name or an email.'); return; }
    setSaving(true); setError(null);
    try {
      if (target.kind === 'main') {
        const [first, ...rest] = name.trim().split(/\s+/);
        await patch(client.id, { first_name: first ?? '', last_name: rest.join(' '), contact_email: email, phone });
      } else if (target.kind === 'billing') {
        await patch(client.id, remove ? { billing_contact_name: '', billing_email: '', billing_contact_phone: '' } : { billing_contact_name: name, billing_email: email, billing_contact_phone: phone });
      } else {
        const entry = { name: name.trim(), email: email.trim(), phone: phone.trim() };
        const next = target.kind === 'extra' ? (remove ? extras.filter((_, i) => i !== target.index) : extras.map((x, i) => (i === target.index ? { ...x, ...entry } : x))) : [...extras, entry];
        await patch(client.id, { additional_contacts: next });
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); setSaving(false); }
  };
  return (
    <Modal title={target.kind === 'new' ? 'Add contact' : 'Edit contact'} onClose={onClose} onSave={() => run()} saving={saving} error={error}>
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Email" type="email" value={email} onChange={setEmail} />
      <Field label="Phone" value={phone} onChange={setPhone} />
      {(target.kind === 'extra' || target.kind === 'billing') && <button type="button" disabled={saving} onClick={() => { if (window.confirm('Remove this contact?')) void run(true); }} style={{ border: 0, background: 'transparent' }} className="text-sm font-medium text-red-700 hover:underline">Remove contact</button>}
      {target.kind === 'main' && <p className="text-xs text-[color:var(--ds-body)]">This is the client&apos;s main contact. Change it here and it updates in Partners.</p>}
    </Modal>
  );
}
