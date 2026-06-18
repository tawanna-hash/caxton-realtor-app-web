'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getApiBase } from '@/lib/api-base';

import PageTitle from '@/components/ui/PageTitle';
const API_URL = getApiBase();

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.message || 'Request failed');
      }
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <PageTitle size="md">Reset your password</PageTitle>
          <p className="text-sm text-gray-500 mt-1">Enter your admin email</p>
        </div>
        {submitted ? (
          <div className="bg-white border border-gray-200 p-6 rounded-md">
            <p className="text-sm text-[#021D40] mb-3">
              If that email is registered as an admin, we&apos;ve sent a password reset link. Check your inbox.
            </p>
            <p className="text-sm text-gray-500 mb-5">
              The link expires in 15 minutes.
            </p>
            <Link
              href="/admin/login"
              className="block w-full text-center bg-[#021D40] text-white py-2.5 text-sm font-medium tracking-wide hover:bg-[#03285a] transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-6 rounded-md space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#021D40]"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-md">{error}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#021D40] text-white py-2.5 text-sm font-medium tracking-wide hover:bg-[#03285a] disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div className="text-center pt-1">
              <Link href="/admin/login" className="text-sm text-gray-500 hover:text-[#021D40]">
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
