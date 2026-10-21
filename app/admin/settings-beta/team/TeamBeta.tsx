'use client';

// Settings (Beta) > Team: Anchor-style member table (name, role, status) with a
// row menu. Uses the existing admin roster API, which is owner-only.

import { useCallback, useEffect, useState } from 'react';
import { A, RowMenu } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';

type Member = { id: string; email: string; fullName: string; active: boolean; lastLoginAt: string | null; isOwner: boolean };

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export default function TeamBeta() {
  const [rows, setRows] = useState<Member[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<Member | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/admin/team', { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Could not load the team.'); setRows([]); return; }
      setRows(j.admins ?? []);
    }).catch(() => { setErr('Could not load the team.'); setRows([]); });
  }, []);
  useEffect(load, [load]);

  async function call(url: string, method: string, body?: unknown, ok = 'Saved.') {
    setBusy(true); setErr(''); setMsg('');
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || 'That did not work.'); return false; }
    setMsg(ok); load(); return true;
  }
  const open = (m: Member | null) => { setEdit(m); setName(m?.fullName ?? ''); setEmail(m?.email ?? ''); setInvite(true); setMsg(''); setErr(''); };
  async function submit() {
    const done = edit
      ? await call(`/api/admin/team/${edit.id}`, 'PATCH', { email, fullName: name }, 'Member updated.')
      : await call('/api/admin/team', 'POST', { email, fullName: name }, 'Invitation sent. They get a link to set a password.');
    if (done) setInvite(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className={A.title}>Team ({rows?.length ?? 0})</h1><p className={A.subtitle}>Add and manage your team members</p></div>
        <button type="button" className={A.primary} onClick={() => open(null)}>+ Invite team member</button>
      </div>
      {err && <div className={A.error}>{err}</div>}
      {msg && <div className={A.notice}>{msg}</div>}
      {invite && (
        <div className="space-y-3 rounded-[14px] bg-white p-5">
          <h2 className="text-lg font-medium text-[color:var(--ds-ink)]">{edit ? 'Edit team member' : 'Invite team member'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs text-[color:var(--ds-body)]">Full name</span><input className={A.input} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-xs text-[color:var(--ds-body)]">Email</span><input type="email" className={A.input} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          </div>
          <div className="flex gap-2">
            <button type="button" className={A.primary} disabled={busy || !name.trim() || !email.trim()} onClick={submit}>{edit ? 'Save changes' : 'Send invitation'}</button>
            <button type="button" className={A.small} onClick={() => setInvite(false)}>Cancel</button>
          </div>
        </div>
      )}
      {rows === null ? <p className={A.subtitle}>Loading...</p> : (
        <div className="overflow-x-auto">
          <SortTable rows={rows} cols={[{ label: 'Member name', get: (m) => m.fullName }, { label: 'Role', get: (m) => (m.isOwner ? 'Owner' : 'Admin') }, { label: 'Status', get: (m) => (m.active ? 'Active' : 'Inactive') }, { label: '' }]} className={`${A.table} min-w-[640px]`}>
            {(rws) => (<>{rws.map((m) => (
              <tr key={m.id}>
                <td><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--ds-selected)] text-xs font-medium text-[color:var(--ds-primary)]">{initials(m.fullName)}</span><div><div className="font-semibold text-[color:var(--ds-ink)]">{m.fullName}</div><div className="text-xs text-[color:var(--ds-body)]">{m.email}</div></div></div></td>
                <td className="text-[color:var(--ds-ink)]">{m.isOwner ? 'Owner' : 'Admin'}</td>
                <td><span className={`rounded-full px-3 py-0.5 text-xs ${m.active ? 'bg-[#E6F6EC] text-[#1B7A3D]' : 'bg-[#EEE] text-[color:var(--ds-body)]'}`}>{m.active ? 'Active' : 'Inactive'}</span></td>
                <td className="text-right">{!m.isOwner && (
                  <RowMenu items={[
                    { label: 'Edit', onClick: () => open(m) },
                    { label: m.active ? 'Deactivate' : 'Reactivate', onClick: () => { if (confirm(`${m.active ? 'Deactivate' : 'Reactivate'} ${m.fullName}?`)) call(`/api/admin/team/${m.id}`, 'PATCH', { active: !m.active }, m.active ? 'Member deactivated.' : 'Member reactivated.'); } },
                    ...(!m.active ? [{ label: 'Delete', danger: true, onClick: () => { if (confirm(`Permanently delete ${m.fullName}? This cannot be undone.`)) call(`/api/admin/team/${m.id}`, 'DELETE', undefined, 'Member deleted.'); } }] : []),
                  ]} />
                )}</td>
              </tr>
            ))}</>)}
          </SortTable>
        </div>
      )}
    </div>
  );
}
