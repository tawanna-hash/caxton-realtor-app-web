"use client";

import { useState } from 'react';
import { getApiBase } from '@/lib/api-base';

const SW = { fontFamily: 'Switzer, system-ui, sans-serif' };
const API = getApiBase();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not send reset email');
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  const ic = "w-full px-4 py-3.5 border border-gray-300 text-base font-light bg-white focus:outline-none focus:border-[#1a2a44] mb-3";

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
        <div className="w-full max-w-md px-8 text-center">
          <div className="text-5xl mb-4">{"\u2709"}</div>
          <h2 className="text-2xl text-gray-900 font-semibold mb-3">Check Your Email</h2>
          <p className="text-lg text-gray-500 font-light mb-2">If an account exists for</p>
          <p className="text-lg text-[#1a2a44] font-semibold mb-6">{email}</p>
          <p className="text-base text-gray-400 font-light mb-8">we have sent a password reset link. It expires in 60 minutes.</p>
          <p className="text-sm text-gray-300 font-light mb-6">Check your spam folder if you do not see it.</p>
          <a href="/dashboard" className="text-sm text-gray-500 font-light underline">Back to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-40" style={SW}>
      <div className="w-full max-w-md px-8">
        <p className="text-sm uppercase tracking-[0.25em] text-gray-400 font-medium mb-2 text-center">Caxton Publications</p>
        <h2 className="text-2xl text-gray-900 font-semibold text-center mb-2">Reset Your Password</h2>
        <p className="text-sm text-gray-400 font-light text-center mb-6">Enter your email and we will send you a link to set a new password.</p>
        {error && <p className="text-base text-red-500 text-center mb-4 font-light">{error}</p>}
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={ic}
          autoComplete="email"
          onKeyDown={(e) => { if (e.key === 'Enter' && email) handleSubmit(); }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !email}
          className="w-full text-center py-3.5 text-base font-medium uppercase tracking-wider text-white mb-3 bg-[#1a2a44] disabled:opacity-40"
        >
          {loading ? 'Sending\u2026' : 'Send Reset Link'}
        </button>
        <a href="/dashboard" className="block w-full text-center py-2 text-base text-gray-400 font-light">Back to sign in</a>
      </div>
    </div>
  );
}
