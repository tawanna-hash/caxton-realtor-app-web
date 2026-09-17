'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiBase } from '@/lib/api-base';
import PageTitle from '@/components/ui/PageTitle';

// Mirrors the safeNext() allow-list pattern from /admin/login: only
// same-origin relative paths under /admin (specifically Get Paid's own
// pages) are honored, so this can't be used as an open redirect.
function safeNext(raw: string | null): string {
  const fallback = '/admin/getpaid';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  const allowedPrefixes = ['/admin/getpaid', '/admin/ar', '/admin/invoices'];
  if (!allowedPrefixes.some((p) => raw === p || raw.startsWith(`${p}/`))) return fallback;
  return raw;
}

function GetPaidLockForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/admin/getpaid-unlock`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Incorrect code.');
        setSubmitting(false);
        return;
      }
      router.push(next);
    } catch {
      setError('Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: '0 24px' }}>
      <PageTitle size="md">Get Paid is locked</PageTitle>
      <p style={{ color: '#7A7974', marginBottom: 24, fontSize: 15, lineHeight: 1.5 }}>
        Payment links, statements, recurring payments, sales transactions, and invoices
        require a development code before they can be viewed or changed.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Development code"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 15,
            border: '1px solid #D4D1CA',
            borderRadius: 6,
            marginBottom: 12,
          }}
        />
        {error && (
          <p style={{ color: '#A12C7B', fontSize: 14, marginBottom: 12 }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 15,
            fontWeight: 600,
            color: '#F9F8F5',
            background: '#01696F',
            border: 'none',
            borderRadius: 6,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting || !code.trim() ? 0.6 : 1,
          }}
        >
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}

export default function GetPaidLockPage() {
  return (
    <Suspense fallback={null}>
      <GetPaidLockForm />
    </Suspense>
  );
}
