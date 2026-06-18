// caxton-suspense-wrapper
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided');
      return;
    }

    api.auth
      .verify(token)
      .then((result) => {
        setStatus('success');
        setMessage(
          result.isNewUser
            ? 'Account verified! Redirecting to your dashboard...'
            : 'Signed in successfully! Redirecting...',
        );
        setTimeout(() => router.push('/dashboard'), 1500);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired.');
      });
  }, [searchParams, router]);

  return (
    <div
      className="min-h-screen bg-white flex flex-col justify-center py-12 px-6"
    >
      <div className="w-full max-w-md mx-auto text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">
          Caxton Publications, Inc.
        </p>
        <h1 className="text-2xl text-gray-900 font-semibold mb-8">Verifying your account</h1>

        {status === 'verifying' && (
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-[#021D40] mx-auto" />
            <p className="mt-6 text-base text-gray-500 font-light">One moment...</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="mt-4 text-base text-gray-700 font-medium">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="mt-4 text-base text-red-800">{message}</p>
            <a
              href="/dashboard"
              className="mt-6 inline-block text-sm uppercase tracking-wider font-medium text-[#021D40] border-b border-[#021D40] pb-0.5"
            >
              Back to the app
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function VerifyFallback() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col justify-center py-12 px-6"
    >
      <div className="w-full max-w-md mx-auto text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">
          Caxton Publications, Inc.
        </p>
        <h1 className="text-2xl text-gray-900 font-semibold mb-8">Verifying your account</h1>
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-[#021D40] mx-auto" />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}
