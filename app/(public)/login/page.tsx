'use client';

// app/(public)/login/page.tsx
//
// Dedicated public sign-in page. Rendered BEFORE /dashboard so visitors
// authenticate first, then hit the market picker inside dashboard on next
// step. Landing page CTAs and /auth/sign-in alias route here.
//
// Zero changes to dashboard phase machine — on successful sign-in we
// router.push('/dashboard') and the existing /auth/me probe there sees
// the caxton_session_v2 cookie and lands the user on their feed (or the
// picker if no caxton_pub yet).

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiBase } from '@/lib/api-base';

const API = getApiBase();

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/dashboard';

  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === 'password') {
        const r = await fetch(`${API}/auth/password-login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || j.message || `Sign-in failed (${r.status})`);
        }
        router.push(next);
        router.refresh();
      } else {
        const r = await fetch(`${API}/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || j.message || `Could not send link (${r.status})`);
        }
        setMsg('Check your email for the sign-in link.');
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-700 font-medium mb-2 text-center">
          Realty News Now
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 text-center mb-2">
          Sign In or Create an Account
        </h1>
        <p className="text-sm text-gray-500 font-light text-center mb-6">
          Sign in to access your market feed.
        </p>

        <div className="mx-auto mb-6 inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 px-3 py-2 rounded-md ${mode === 'password' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-600'}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode('magic')}
            className={`flex-1 px-3 py-2 rounded-md ${mode === 'magic' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-600'}`}
          >
            Email link
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3.5 border border-gray-300 rounded-md text-base bg-white focus:outline-none focus:border-brand-700"
          />
          {mode === 'password' && (
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 pr-16 border border-gray-300 rounded-md text-base bg-white focus:outline-none focus:border-brand-700"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-3.5 text-xs uppercase tracking-wider text-gray-400"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <button
            type="submit"
            disabled={busy || !email || (mode === 'password' && !password)}
            className="w-full py-3.5 bg-brand-700 text-white text-base font-medium uppercase tracking-wider rounded-md disabled:opacity-40"
          >
            {busy ? 'Working…' : mode === 'password' ? 'Sign In' : 'Send Sign-In Link'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/auth/forgot-password" className="text-gray-500 underline">
            Forgot password?
          </Link>
          <Link href="/subscribe" className="text-brand-700 font-medium underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
