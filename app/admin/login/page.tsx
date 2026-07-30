'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';

import PageTitle from '@/components/ui/PageTitle';
// Only allow same-origin relative paths under /admin to land in `next`.
// Anything else (absolute URLs, protocol-relative, or non-admin paths)
// falls back to the default landing page. This blocks open-redirect
// abuse where an attacker crafts /admin/login?next=https://evil.com.
function safeNext(raw: string | null): string {
  const fallback = '/admin/crm';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback; // protocol-relative
  if (!raw.startsWith('/admin/') && raw !== '/admin') return fallback;
  // Block returning to the login/forgot/reset pages themselves.
  if (raw === '/admin/login' || raw.startsWith('/admin/login?')) return fallback;
  if (raw.startsWith('/admin/forgot-password')) return fallback;
  if (raw.startsWith('/admin/reset-password')) return fallback;
  return raw;
}

// useSearchParams() requires a Suspense boundary in app router. Splitting
// the form into a child component keeps the boundary tight (the form is
// the only thing that depends on the query string).
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-22: surface a visible inline error when an invalid email is blurred,
  // matched to the same aria-invalid state announced to screen readers.
  const [emailError, setEmailError] = useState<string | null>(null);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleEmailBlur = () => {
    if (!email) {
      setEmailError(null);
      return;
    }
    setEmailError(isValidEmail(email) ? null : 'Enter a valid email address.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminApi.login(email, password);
      router.push(next);
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
          <PageTitle size="md">Realty News Now Admin</PageTitle>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onBlur={handleEmailBlur}
              autoComplete="username"
              inputMode="email"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'admin-email-error' : undefined}
              className={`w-full border px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none ${
                emailError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-gray-300 focus:border-brand-700'
              }`}
            />
            {emailError && (
              <p id="admin-email-error" className="mt-1.5 text-xs text-red-600">
                {emailError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-gray-300 px-4 py-3 pr-16 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs uppercase tracking-wider text-gray-500 hover:text-brand-700 px-2 py-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-md">{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-700 text-white py-3 text-sm font-medium tracking-wide hover:bg-brand-800 disabled:opacity-60 transition-colors rounded-md"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="text-center pt-1">
            <Link href="/admin/forgot-password" className="text-sm text-gray-500 hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
