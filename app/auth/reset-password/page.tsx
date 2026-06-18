"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api-base';

// Sans-serif body font is now wired globally via Inter in app/layout.tsx.
// Empty marker object kept so existing `style={SW}` props remain valid
// without re-touching every JSX site — next cleanup pass can drop them.
const SW = {} as const;
const API = getApiBase();

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      queueMicrotask(() => {
        setError('Reset link is missing or invalid — please request a new one');
      });
    }
  }, [token]);

  async function handleSubmit() {
    setError('');
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not reset password');
      }
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not reset password');
    } finally {
      setLoading(false);
    }
  }

  const ic = "w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#021D40] mb-3";

  if (done) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
        <div className="w-full max-w-md px-8 text-center">
          <div className="text-5xl mb-4">{"\u2713"}</div>
          <h1 className="text-2xl text-gray-900 font-semibold mb-3">Password updated</h1>
          <p className="text-base text-gray-400 font-light">Signing you in\u2026</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium mb-2 text-center">Realty News Now</p>
        <h1 className="text-2xl text-gray-900 font-semibold text-center mb-6">Set a New Password</h1>
        {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}
        <div className="relative mb-3">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="New password (at least 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={ic + ' pr-16 mb-0'}
            autoComplete="new-password"
            disabled={!token || loading}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-xs uppercase tracking-wider text-gray-400">
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={ic}
          autoComplete="new-password"
          disabled={!token || loading}
          onKeyDown={(e) => { if (e.key === 'Enter' && newPassword && confirmPassword) handleSubmit(); }}
        />
        <button
          onClick={handleSubmit}
          disabled={!token || loading || !newPassword || !confirmPassword}
          className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3 bg-[#021D40] disabled:opacity-40"
        >
          {loading ? 'Updating\u2026' : 'Update Password'}
        </button>
        <a href="/dashboard" className="block w-full text-center py-2 text-base text-gray-400 font-light">Back to sign in</a>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-white" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
