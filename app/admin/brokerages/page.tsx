'use client';

import { useCallback, useEffect, useState } from 'react';

type Member = { realtorId: string; role: string; email: string; name: string };
type Brokerage = { id: string; name: string; slug: string; emailDomains: string[]; ssoEntryPoint: string; ssoIdpIssuer: string; ssoCert: string; ssoEnabled: boolean; members: Member[] };
const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const btnCls = 'rounded-md bg-[#301D5D] px-3 py-2 text-xs font-bold text-white disabled:opacity-45';
const blank = { name: '', slug: '', emailDomains: '', ssoEntryPoint: '', ssoIdpIssuer: '', ssoCert: '', ssoEnabled: false };

export default function BrokeragesAdminPage() {
  const [list, setList] = useState<Brokerage[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [member, setMember] = useState<Record<string, { email: string; role: string }>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/closing-time/brokerages', { credentials: 'include' });
    if (res.ok) setList((await res.json()).brokerages);
  }, []);
  useEffect(() => { let on = true; fetch('/api/admin/closing-time/brokerages', { credentials: 'include' }).then((r) => r.json()).then((d) => { if (on && d.brokerages) setList(d.brokerages); }).catch(() => undefined); return () => { on = false; }; }, []);

  const post = async (payload: Record<string, unknown>) => {
    setMsg('');
    const res = await fetch('/api/admin/closing-time/brokerages', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Saved.' : (body.error ?? 'Something went wrong.'));
    await load();
    return res.ok;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Closing Time Brokerages</h1>
        <p className="mt-1 text-sm text-slate-600">Create a brokerage, add its agents and an office admin, and optionally turn on single sign-on. Office admins see the dashboard at /agents/closing-time/office.</p>
      </div>
      {msg && <p className="text-sm font-semibold text-[#301D5D]" role="status">{msg}</p>}

      <section className="space-y-3 border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-950">{form.id ? 'Edit brokerage' : 'New brokerage'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputCls} placeholder="Brokerage name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Brokerage name" />
          <input className={inputCls} placeholder="Short slug, for example acme-realty" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} aria-label="Slug" />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Email domains, comma separated (acme.com)" value={form.emailDomains} onChange={(e) => setForm({ ...form, emailDomains: e.target.value })} aria-label="Email domains" />
          <input className={inputCls} placeholder="Identity provider sign-in URL" value={form.ssoEntryPoint} onChange={(e) => setForm({ ...form, ssoEntryPoint: e.target.value })} aria-label="SSO sign-in URL" />
          <input className={inputCls} placeholder="Identity provider issuer (entity ID)" value={form.ssoIdpIssuer} onChange={(e) => setForm({ ...form, ssoIdpIssuer: e.target.value })} aria-label="SSO issuer" />
          <textarea className={`${inputCls} min-h-[90px] font-mono text-xs sm:col-span-2`} placeholder="Identity provider signing certificate (public, PEM)" value={form.ssoCert} onChange={(e) => setForm({ ...form, ssoCert: e.target.value })} aria-label="SSO certificate" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ssoEnabled} onChange={(e) => setForm({ ...form, ssoEnabled: e.target.checked })} /> Single sign-on enabled</label>
        <div className="flex gap-2">
          <button type="button" className={btnCls} disabled={!form.name || !form.slug} onClick={async () => {
            if (await post({ action: 'save', id: form.id, name: form.name, slug: form.slug, emailDomains: form.emailDomains.split(',').map((d) => d.trim()).filter(Boolean), ssoEntryPoint: form.ssoEntryPoint, ssoIdpIssuer: form.ssoIdpIssuer, ssoCert: form.ssoCert, ssoEnabled: form.ssoEnabled })) setForm(blank);
          }}>Save</button>
          {form.id && <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold" onClick={() => setForm(blank)}>Cancel</button>}
        </div>
      </section>

      {list.map((b) => (
        <section key={b.id} className="space-y-3 border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-950">{b.name}</h2>
              <p className="text-xs text-slate-500">Domains: {b.emailDomains.join(', ') || 'none'} · SSO {b.ssoEnabled ? 'on' : 'off'}</p>
            </div>
            <button type="button" className="text-xs font-bold text-[#301D5D] underline" onClick={() => setForm({ id: b.id, name: b.name, slug: b.slug, emailDomains: b.emailDomains.join(', '), ssoEntryPoint: b.ssoEntryPoint, ssoIdpIssuer: b.ssoIdpIssuer, ssoCert: b.ssoCert, ssoEnabled: b.ssoEnabled })}>Edit</button>
          </div>
          <div className="space-y-1 break-all text-xs text-slate-600">
            <p>Give the brokerage&apos;s IT team: Entity ID <code>https://realtynewsnow.app/api/sso/saml/{b.slug}</code></p>
            <p>Reply URL: <code>https://realtynewsnow.app/api/sso/saml/{b.slug}/acs</code></p>
            <p>Metadata: <code>https://realtynewsnow.app/api/sso/saml/{b.slug}/metadata</code></p>
            <p>Sign-in link for agents: <code>https://realtynewsnow.app/api/sso/saml/{b.slug}/login</code></p>
          </div>
          <ul className="space-y-1 text-sm">
            {b.members.map((m) => (
              <li key={m.realtorId} className="flex items-center justify-between border border-slate-100 px-2 py-1">
                <span>{m.name || m.email} · {m.email} · {m.role}</span>
                <button type="button" className="text-xs font-bold text-[#661102] underline" onClick={() => void post({ action: 'remove_member', brokerageId: b.id, realtorId: m.realtorId })}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <input className={inputCls} type="email" placeholder="Agent email (must have an account)" value={member[b.id]?.email ?? ''} onChange={(e) => setMember({ ...member, [b.id]: { email: e.target.value, role: member[b.id]?.role ?? 'agent' } })} aria-label="Member email" />
            <select className={inputCls} value={member[b.id]?.role ?? 'agent'} onChange={(e) => setMember({ ...member, [b.id]: { email: member[b.id]?.email ?? '', role: e.target.value } })} aria-label="Member role"><option value="agent">Agent</option><option value="admin">Office admin</option></select>
            <button type="button" className={btnCls} disabled={!member[b.id]?.email} onClick={async () => { if (await post({ action: 'add_member', brokerageId: b.id, email: member[b.id].email, role: member[b.id].role ?? 'agent' })) setMember({ ...member, [b.id]: { email: '', role: 'agent' } }); }}>Add</button>
          </div>
        </section>
      ))}
    </div>
  );
}
