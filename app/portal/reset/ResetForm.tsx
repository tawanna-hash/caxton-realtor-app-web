'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <p className="text-sm text-gray-700">
        This reset link is missing its token. <Link href="/portal/login" className="font-medium text-[#6D3FD6] underline">Request a new link</Link>.
      </p>
    );
  }
  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-[#E6F6EA] border border-[#B7E1C1] text-[#14532D] px-3 py-2 text-sm">Your password has been updated.</div>
        <Link href="/portal/login" className="block w-full rounded-full bg-[#301D5D] text-white px-4 py-2 text-center text-sm font-medium">Go to sign in</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Inputs are uncontrolled and read on submit, so a hydration pass (Safari)
    // can never clear what the user already typed.
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const res = await fetch('/api/portal/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) { setDone(true); return; }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? 'Could not reset the password.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">New password</span>
        <input type="password" required minLength={10} name="password" autoComplete="new-password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</span>
        <input type="password" required minLength={10} name="confirm" autoComplete="new-password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </label>
      {error && <div className="rounded-md bg-[#FFEAE6] border border-[#FF2A04]/30 text-[#661102] px-3 py-2 text-sm">{error}</div>}
      <button disabled={busy} className="w-full rounded-full bg-[#301D5D] text-white px-4 py-2 text-sm font-medium disabled:opacity-60">{busy ? 'Saving...' : 'Set new password'}</button>
    </form>
  );
}
