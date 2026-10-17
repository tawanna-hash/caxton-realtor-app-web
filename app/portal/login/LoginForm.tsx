'use client';

import { useState } from 'react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = '/portal';
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? 'Sign in failed.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">Email</span>
        <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">Password</span>
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      {error && <div className="rounded-md bg-[#FFEAE6] border border-[#FF2A04]/30 text-[#661102] px-3 py-2 text-sm">{error}</div>}
      <button disabled={busy} className="w-full rounded-md bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
