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

// Mobile slide-up drawer (matches the Anchor "Edit client" sheet): grab handle, close X,
// centered title, full-width Save. Becomes a centered dialog from the sm breakpoint up.
function Modal({ title, onClose, onSave, saving, error, children, saveLabel = 'Save' }: { title: string; onClose: () => void; onSave: () => void; saving: boolean; error: string | null; children: React.ReactNode; saveLabel?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1b1830]/25 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white sm:rounded-[20px]" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[#C9C7D1] sm:hidden" />
        <button type="button" aria-label="Close" onClick={onClose} style={{ border: 0, background: 'transparent' }} className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center text-[color:var(--ds-body)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
        <h3 className="px-5 pb-5 pt-9 text-center text-xl font-semibold text-[color:var(--ds-ink)]">{title}</h3>
        <div className="flex-1 overflow-y-auto px-5">{error && <div className={`${A.error} mb-3`}>{error}</div>}{children}</div>
        <div className="shrink-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <button type="button" disabled={saving} onClick={onSave} className="h-12 w-full rounded-[10px] border-0 bg-[#6240ED] text-base font-medium text-white hover:bg-[#5233d6] disabled:opacity-60">{saving ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

// Outlined input with the label sitting on the top border.
const Field = ({ label, value, onChange, type = 'text', className = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) => (
  <label className={`relative mb-5 block ${className}`}>
    <span className="absolute -top-2 left-3 bg-[#fcfcfc] px-1 text-xs leading-4 text-[color:var(--ds-body)]">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-md border border-[#C9C7D1] bg-[#fcfcfc] px-4 text-base text-[color:var(--ds-body)] focus:border-[#6240ED] focus:outline-none" />
  </label>
);

const AddLink = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} style={{ border: 0, background: 'transparent' }} className="mb-5 flex min-h-11 items-center gap-3 p-0 text-sm font-semibold text-[#6240ED]">
    <span aria-hidden className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-[#6240ED]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </span>
    {children}
  </button>
);

export function EditClientModal({ client, onClose }: { client: Adv; onClose: () => void }) {
  const [f, setF] = useState({
    company: client.company || client.name || '',
    status: client.status === 'prospect' ? 'prospect' : client.status === 'archived' || client.status === 'inactive' ? 'archived' : 'advertiser',
    address: client.address ?? '', address_2: client.address_2 ?? '', city: client.city ?? '', state: client.state ?? '', zip: client.zip ?? '',
  });
  const [kind, setKind] = useState<'business' | 'individual'>(client.type === 'individual' ? 'individual' : 'business');
  const [showAddress, setShowAddress] = useState(Boolean(client.address || client.city || client.zip));
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.company.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError(null);
    try {
      // `type` on the record is the Partners category, so the Business/Individual toggle is not written to it.
      await patch(client.id, f); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); setSaving(false); }
  };
  return (
    <Modal title="Edit client" onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-[color:var(--ds-ink)]">Client type</span>
        <div role="radiogroup" aria-label="Client type" className="flex w-[246px] max-w-[62%] rounded-full bg-[#ECECF1] p-[3px]">
          {(['business', 'individual'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} style={{ border: kind === k ? '1px solid #D5D3DE' : '1px solid transparent' }} className={`h-10 flex-1 rounded-full text-sm ${kind === k ? 'bg-white font-semibold text-[color:var(--ds-ink)] shadow-sm' : 'bg-transparent font-medium text-[color:var(--ds-body)]'}`}>{k === 'business' ? 'Business' : 'Individual'}</button>
          ))}
        </div>
      </div>
      <Field label="Client name" value={f.company} onChange={set('company')} />
      <label className="relative mb-5 block">
        <span className="absolute -top-2 left-3 bg-[#fcfcfc] px-1 text-xs leading-4 text-[color:var(--ds-body)]">Status</span>
        <select value={f.status} onChange={(e) => set('status')(e.target.value)} className="h-12 w-full appearance-none rounded-md border border-[#C9C7D1] bg-[#fcfcfc] px-4 text-base text-[color:var(--ds-body)] focus:border-[#6240ED] focus:outline-none"><option value="advertiser">Active</option><option value="prospect">Prospect</option><option value="archived">Archived</option></select>
      </label>
      {showAddress ? (
        <>
          <Field label="Address" value={f.address} onChange={set('address')} />
          <Field label="Address line 2" value={f.address_2} onChange={set('address_2')} />
          <Field label="City" value={f.city} onChange={set('city')} />
          <div className="grid grid-cols-2 gap-3"><Field label="State" value={f.state} onChange={set('state')} /><Field label="ZIP" value={f.zip} onChange={set('zip')} /></div>
        </>
      ) : <AddLink onClick={() => setShowAddress(true)}>Add address</AddLink>}
      <hr className="my-3 border-0 border-t border-[#DEDCE6]" />
      <h4 className="mb-3 mt-6 text-base font-semibold text-[color:var(--ds-ink)]">Reference fields</h4>
      <AddLink onClick={() => { /* reference fields are not stored on advertiser records yet */ }}>Add reference field</AddLink>
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
