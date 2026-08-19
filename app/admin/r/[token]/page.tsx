'use client';

/**
 * Admin reset short-link redirector.
 *
 * The reset email links here at /admin/r/<token> — path-only, no
 * query string — because Resend's click-tracking wrapper strips query
 * strings on redirect but preserves paths. We stash the token in
 * sessionStorage (survives the in-tab client navigation, dies with
 * the tab) and hop to /admin/reset-password, which reads it back.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AdminResetShortLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    const token = params?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        sessionStorage.setItem('caxton_admin_reset_token', token);
      } catch {
        // storage disabled — fall through to query-string carry-over
      }
      router.replace(`/admin/reset-password?token=${encodeURIComponent(token)}`);
    } else {
      router.replace('/admin/forgot-password');
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-gray-500">Opening reset link…</p>
    </div>
  );
}
