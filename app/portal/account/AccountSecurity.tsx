'use client';

import { useState } from 'react';

export default function AccountSecurity({ loginEmail, hasPassword }: { loginEmail: string; hasPassword: boolean }) {
  const [email, setEmail] = useState(loginEmail);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordSet, setPasswordSet] = useState(hasPassword);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next && next !== confirm) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    const body: Record<string, string> = {};
    if (email.trim().toLowerCase() !== loginEmail.toLowerCase()) body.login_email = email.trim();
    if (next) body.new_password = next;
    if (passwordSet && current) body.current_password = current;
    if (!body.login_email && !body.new_password) { setMsg({ ok: false, text: 'Nothing to update.' }); return; }
    setBusy(true);
    const res = await fetch('/api/portal/credentials', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const detail = data?.details ? Object.values(data.details as Record<string, string[]>).flat().join(' ') : '';
      setMsg({ ok: false, text: detail || data?.error || 'Could not update.' });
      return;
    }
    if (body.new_password) setPasswordSet(true);
    setCurrent(''); setNext(''); setConfirm('');
    setMsg({ ok: true, text: 'Saved.' });
  }

  const field = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  const label = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <form onSubmit={submit} className="rounded-md border border-gray-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-serif text-lg text-gray-900">Login and password</h2>
        <p className="text-sm text-gray-600">
          {passwordSet
            ? 'Sign in any time at /portal/login with your login email and password.'
            : 'Set a password to sign in without waiting for an emailed link.'}
        </p>
      </div>
      <label className="block">
        <span className={label}>Login email</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      {passwordSet && (
        <label className="block">
          <span className={label}>Current password (required to change anything here)</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
        </label>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className={label}>{passwordSet ? 'New password' : 'Password'} (10+ characters)</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className={label}>Confirm password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
        </label>
      </div>
      {msg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? 'bg-[#E0FBE0] border-[#00E200]/30 text-[#005A00]' : 'bg-[#FFEAE6] border-[#FF2A04]/30 text-[#661102]'}`}>{msg.text}</div>
      )}
      <button disabled={busy} className="rounded-md bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
        {busy ? 'Saving...' : 'Save login settings'}
      </button>
    </form>
  );
}
