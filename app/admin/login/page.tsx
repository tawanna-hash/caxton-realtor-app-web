'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminApi.login(email, password);
      router.push('/admin/giveaways');
    } catch (err) {
      const e = err as Error & { status?: number };
      setError(e.status === 401 ? 'Invalid email or password' : e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[#1a2a44] tracking-tight">Caxton Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#1a2a44]"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#1a2a44]"
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#1a2a44] text-white py-2.5 text-sm font-medium tracking-wide hover:bg-[#243556] disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
