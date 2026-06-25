'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiBase } from '@/lib/api-base';

import PageTitle from '@/components/ui/PageTitle';
const API_URL = getApiBase();

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="bg-white border border-gray-200 p-6 rounded-md">
        <p className="text-sm text-red-600 mb-4">
          No reset token provided. The link you used may be invalid or incomplete.
        </p>
        <Link
          href="/admin/forgot-password"
          className="block w-full text-center bg-brand-700 text-white py-2.5 text-sm font-medium tracking-wide hover:bg-[#493676] transition-colors"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.message || 'Reset failed');
      }
      setSuccess(true);
      setTimeout(() => router.push('/admin/login'), 2000);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white border border-gray-200 p-6 rounded-md">
        <p className="text-sm text-brand-700 mb-2">Password updated.</p>
        <p className="text-sm text-gray-500">Redirecting you to the sign-in page...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 p-6 space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">New Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700"
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
      <div>
        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Confirm New Password</label>
        <input
          type={showPassword ? 'text' : 'password'}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700"
        />
      </div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-md">{error}</div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-700 text-white py-2.5 text-sm font-medium tracking-wide hover:bg-[#493676] disabled:opacity-60 transition-colors"
      >
        {submitting ? 'Updating...' : 'Update Password'}
      </button>
      <div className="text-center pt-1">
        <Link href="/admin/login" className="text-sm text-gray-500 hover:text-brand-700">
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <PageTitle size="md">Set new password</PageTitle>
          <p className="text-sm text-gray-500 mt-1">Choose a new admin password</p>
        </div>
        <Suspense fallback={<div className="bg-white border border-gray-200 p-6 text-sm text-gray-500 rounded-md">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
