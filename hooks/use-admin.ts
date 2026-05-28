'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';

export type AdminUser = {
  id: string;
  email: string;
  name?: string;
};

export function useAdmin() {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi.me()
      .then((data) => {
        if (cancelled) return;
        setAdmin(data?.admin || data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        if (err.status === 401 && pathname !== '/admin/login') {
          // Preserve the page they tried to load so login can bounce them
          // back. The middleware does the same for navigations; this covers
          // the case where the page renders shell HTML before the client
          // fetch fails.
          const search = typeof window !== 'undefined' ? window.location.search : '';
          const next = encodeURIComponent((pathname ?? '') + search);
          router.replace(`/admin/login?next=${next}`);
        }
      });
    return () => { cancelled = true; };
  }, [pathname, router]);

  return { admin, loading };
}
