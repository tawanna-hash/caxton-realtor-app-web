'use client';

import { useState } from 'react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [sent, setSent] = useState(false);

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

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await fetch('/api/portal/forgot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setSent(true);
    setBusy(false);
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={forgot} className="space-y-4">
        {sent ? (
          <div className="rounded-md bg-[#E6F6EA] border border-[#B7E1C1] text-[#14532D] px-3 py-2 text-sm">
            If that email is on a partner account, a reset link is on its way. It is valid for 1 hour.
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">Enter your login email and we will send you a link to choose a new password.</p>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Email</span>
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <button disabled={busy} className="w-full rounded-full bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
              {busy ? 'Sending...' : 'Send reset link'}
            </button>
          </>
        )}
        <button type="button" onClick={() => { setMode('signin'); setSent(false); }} className="block w-full text-center text-sm text-[#6D3FD6] hover:underline">
          Back to sign in
        </button>
      </form>
    );
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
      <button disabled={busy} className="w-full rounded-full bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
      <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="block w-full text-center text-sm text-[#6D3FD6] hover:underline">
        Forgot your password?
      </button>
    </form>
  );
}
